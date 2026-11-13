import type { DB } from '../types';

/**
 * Motor de sincronización: guarda en la nube (una fila por usuario) lo que cambia en este dispositivo
 * y trae lo que cambió en otros. La app siempre trabaja primero con sus datos locales; la nube es una
 * copia compartida. No depende de React ni de Supabase, para poder probarlo con una nube simulada.
 */

export interface RemoteRow {
  data: DB;
  version: number;
}

export interface CloudApi {
  pull(): Promise<RemoteRow | null>;
  /** Crea la fila (versión 1). 'conflict' si ya existía. */
  insert(db: DB): Promise<RemoteRow | 'conflict'>;
  /** Guarda solo si la nube sigue en `baseVersion`. 'conflict' si otro dispositivo guardó antes. */
  update(db: DB, baseVersion: number): Promise<RemoteRow | 'conflict'>;
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'pending' | 'error' | 'conflict';

export interface Conflict {
  remote: RemoteRow;
  local: DB;
}

export interface SyncState {
  status: SyncStatus;
  lastSyncAt?: string;
  error?: string;
  conflict?: Conflict;
}

/** Lo que se recuerda entre sesiones para saber si hay algo pendiente por subir. */
export interface SyncMeta {
  version: number | null;
  dirty: boolean;
  lastSyncAt?: string;
}

export interface SyncIO {
  /** Datos locales actuales (debe reflejar de inmediato lo que se aplicó con applyDb). */
  getDb(): DB;
  /** Reemplaza los datos locales con lo que llegó de la nube / de combinar. */
  applyDb(db: DB): void;
  onState(s: SyncState): void;
  saveMeta(m: SyncMeta): void;
}

export type ConflictChoice = 'nube' | 'dispositivo' | 'combinar';

/* ------------------------------------------------------------------ */
/* Utilidades de datos                                                 */
/* ------------------------------------------------------------------ */

function stable(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stable).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o)
      .filter((k) => o[k] !== undefined)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stable(o[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v) ?? 'null';
}

export const sameDb = (a: DB, b: DB) => stable(a) === stable(b);

/** Datos tal como arranca la app: sin movimientos, pagos fijos ni planes y con la cuenta inicial vacía. */
export function isPristine(db: DB) {
  const a = db.accounts;
  return (
    db.txs.length === 0 &&
    db.fixed.length === 0 &&
    db.plans.length === 0 &&
    Object.keys(db.paid ?? {}).length === 0 &&
    Object.keys(db.overrides ?? {}).length === 0 &&
    Object.keys(db.settings ?? {}).length === 0 &&
    a.length <= 1 &&
    (a.length === 0 || (a[0].kind === 'debito' && !a[0].initialBalance))
  );
}

function byId<T extends { id: string }>(local: T[], remote: T[]) {
  const m = new Map(remote.map((x) => [x.id, x]));
  for (const x of local) m.set(x.id, x); // si está en los dos, gana lo de este dispositivo
  return [...m.values()];
}

/** Une dos copias por id. Lo borrado en un lado puede reaparecer si el otro todavía lo tenía. */
export function mergeDbs(local: DB, remote: DB): DB {
  return {
    accounts: byId(local.accounts, remote.accounts ?? []),
    txs: byId(local.txs, remote.txs ?? []),
    fixed: byId(local.fixed, remote.fixed ?? []),
    plans: byId(local.plans, remote.plans ?? []),
    paid: { ...(remote.paid ?? {}), ...local.paid },
    overrides: { ...(remote.overrides ?? {}), ...local.overrides },
    settings: { ...(remote.settings ?? {}), ...local.settings },
  };
}

export const summaryOf = (db: DB) => ({ accounts: db.accounts.length, txs: db.txs.length, fixed: db.fixed.length, plans: db.plans.length });

/** Acepta lo que venga de la nube y lo completa por si faltan campos de versiones anteriores. */
export function normalizeDb(raw: Partial<DB>): DB {
  return {
    accounts: raw.accounts ?? [],
    txs: raw.txs ?? [],
    fixed: raw.fixed ?? [],
    plans: raw.plans ?? [],
    paid: raw.paid ?? {},
    overrides: raw.overrides ?? {},
    settings: raw.settings ?? {},
  };
}

/* ------------------------------------------------------------------ */
/* Motor                                                               */
/* ------------------------------------------------------------------ */

export class SyncEngine {
  version: number | null;
  dirty: boolean;
  state: SyncState = { status: 'idle' };
  private chain: Promise<unknown> = Promise.resolve();

  constructor(
    private api: CloudApi,
    private io: SyncIO,
    meta?: SyncMeta,
  ) {
    this.version = meta?.version ?? null;
    this.dirty = meta?.dirty ?? false;
    this.state = { status: 'idle', lastSyncAt: meta?.lastSyncAt };
  }

  /** Hay un cambio local sin subir. */
  markDirty() {
    this.dirty = true;
    if (this.state.status !== 'conflict') this.set({ status: 'pending' });
    this.persist();
  }

  /** Al iniciar sesión: decide qué hacer con la nube y con los datos de este dispositivo. */
  start() {
    return this.run(() => this.doStart());
  }

  /** Sube lo pendiente o trae lo nuevo. Se llama al cambiar datos, al volver a la app y a mano. */
  sync() {
    return this.run(() => this.doSync());
  }

  resolve(choice: ConflictChoice) {
    return this.run(() => this.doResolve(choice));
  }

  /* ---- internos ---- */

  private run<T>(fn: () => Promise<T>) {
    const p = this.chain.then(fn, fn);
    this.chain = p.catch(() => undefined);
    return p;
  }

  private set(patch: Partial<SyncState>) {
    this.state = { ...this.state, ...patch };
    this.io.onState(this.state);
  }

  private persist() {
    this.io.saveMeta({ version: this.version, dirty: this.dirty, lastSyncAt: this.state.lastSyncAt });
  }

  private done() {
    this.state = { status: 'synced', lastSyncAt: new Date().toISOString() };
    this.io.onState(this.state);
    this.persist();
  }

  private fail(e: unknown) {
    this.set({ status: 'error', error: e instanceof Error ? e.message : String(e) });
    this.persist();
  }

  private adopt(row: RemoteRow) {
    this.io.applyDb(normalizeDb(row.data));
    this.version = row.version;
    this.dirty = false;
    this.done();
  }

  private async doStart(attempt = 0): Promise<void> {
    this.set({ status: 'syncing', error: undefined });
    try {
      const row = await this.api.pull();
      const local = this.io.getDb();
      if (!row) {
        const r = await this.api.insert(local);
        if (r === 'conflict') {
          if (attempt < 2) return this.doStart(attempt + 1);
          throw new Error('No se pudo crear tu espacio en la nube. Intenta de nuevo.');
        }
        this.version = r.version;
        this.dirty = false;
        return this.done();
      }
      if (this.version === null) {
        // Primera vez que este dispositivo se enlaza con esta cuenta
        if (isPristine(local)) return this.adopt(row);
        if (sameDb(local, normalizeDb(row.data))) {
          this.version = row.version;
          this.dirty = false;
          return this.done();
        }
        this.set({ status: 'conflict', conflict: { remote: row, local } });
        return;
      }
      await this.reconcile(row);
    } catch (e) {
      this.fail(e);
    }
  }

  private async reconcile(row: RemoteRow) {
    if (row.version === this.version) {
      if (this.dirty) return this.push();
      return this.done();
    }
    // La nube tiene cambios de otro dispositivo
    if (!this.dirty) return this.adopt(row);
    this.io.applyDb(mergeDbs(this.io.getDb(), normalizeDb(row.data)));
    this.version = row.version;
    this.dirty = true;
    return this.push();
  }

  private async doSync(): Promise<void> {
    if (this.state.status === 'conflict') return;
    if (this.version === null) return this.doStart();
    this.set({ status: 'syncing', error: undefined });
    try {
      if (this.dirty) return await this.push();
      const row = await this.api.pull();
      if (!row) {
        const r = await this.api.insert(this.io.getDb());
        if (r === 'conflict') return this.doStart();
        this.version = r.version;
        return this.done();
      }
      await this.reconcile(row);
    } catch (e) {
      this.fail(e);
    }
  }

  /** Sube lo local; si otro dispositivo guardó antes, trae lo suyo, lo une y vuelve a intentar. */
  private async push(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      const snap = this.io.getDb();
      const r = await this.api.update(snap, this.version as number);
      if (r !== 'conflict') {
        this.version = r.version;
        // Si mientras se guardaba hubo otro cambio, sigue pendiente
        this.dirty = this.io.getDb() !== snap;
        this.done();
        if (this.dirty) this.set({ status: 'pending' });
        return;
      }
      const row = await this.api.pull();
      if (!row) {
        const ins = await this.api.insert(snap);
        if (ins !== 'conflict') {
          this.version = ins.version;
          this.dirty = this.io.getDb() !== snap;
          return this.done();
        }
        continue;
      }
      this.io.applyDb(mergeDbs(this.io.getDb(), normalizeDb(row.data)));
      this.version = row.version;
    }
    throw new Error('Otro dispositivo está guardando al mismo tiempo. Intenta de nuevo en un momento.');
  }

  private async doResolve(choice: ConflictChoice): Promise<void> {
    const c = this.state.conflict;
    if (!c) return;
    this.set({ status: 'syncing', conflict: undefined, error: undefined });
    try {
      if (choice === 'nube') return this.adopt(c.remote);
      const remote = normalizeDb(c.remote.data);
      if (choice === 'combinar') this.io.applyDb(mergeDbs(this.io.getDb(), remote));
      this.version = c.remote.version;
      this.dirty = true;
      await this.push();
    } catch (e) {
      this.fail(e);
    }
  }
}
