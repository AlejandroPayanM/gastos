import assert from 'node:assert/strict';
import { SyncEngine, isPristine, mergeDbs, sameDb, type CloudApi, type RemoteRow, type SyncMeta, type SyncState } from '../src/cloud/engine';
import type { DB } from '../src/types';

const empty = (): DB => ({
  accounts: [{ id: 'debito-1', name: 'Débito', kind: 'debito', color: '#0F766E', initialBalance: 0 }],
  txs: [],
  fixed: [],
  plans: [],
  paid: {},
  overrides: {},
  settings: {},
});
const tx = (id: string, amount = 10) => ({ id, type: 'gasto' as const, amount, concept: id, category: 'Otros', date: '2026-11-12', accountId: 'debito-1' });

/** Nube simulada en memoria con control de versión, igual que la tabla user_data. */
class FakeCloud implements CloudApi {
  row: RemoteRow | null = null;
  calls: string[] = [];
  failNext = false;
  private maybeFail() {
    if (this.failNext) {
      this.failNext = false;
      throw new Error('sin conexión');
    }
  }
  async pull() {
    this.calls.push('pull');
    this.maybeFail();
    return this.row ? { data: structuredClone(this.row.data), version: this.row.version } : null;
  }
  async insert(db: DB) {
    this.calls.push('insert');
    this.maybeFail();
    if (this.row) return 'conflict' as const;
    this.row = { data: structuredClone(db), version: 1 };
    return { data: db, version: 1 };
  }
  async update(db: DB, base: number) {
    this.calls.push('update');
    this.maybeFail();
    if (!this.row || this.row.version !== base) return 'conflict' as const;
    this.row = { data: structuredClone(db), version: base + 1 };
    return { data: db, version: base + 1 };
  }
}

/** "Dispositivo": datos locales + motor, con getDb que refleja applyDb al instante. */
function device(cloud: CloudApi, local: DB, meta?: SyncMeta) {
  const d = {
    db: local,
    states: [] as SyncState[],
    meta: meta as SyncMeta | undefined,
    engine: undefined as unknown as SyncEngine,
    edit(fn: (db: DB) => void) {
      const next = structuredClone(d.db);
      fn(next);
      d.db = next;
      d.engine.markDirty();
    },
  };
  d.engine = new SyncEngine(
    cloud,
    {
      getDb: () => d.db,
      applyDb: (x) => (d.db = x),
      onState: (s) => d.states.push(s),
      saveMeta: (m) => (d.meta = m),
    },
    meta,
  );
  return d;
}

(async () => {
  // --- utilidades ---
  assert.equal(isPristine(empty()), true);
  const withTx = empty();
  withTx.txs.push(tx('a'));
  assert.equal(isPristine(withTx), false);
  const withBalance = empty();
  withBalance.accounts[0].initialBalance = 100;
  assert.equal(isPristine(withBalance), false);
  assert.equal(sameDb({ ...empty() }, JSON.parse(JSON.stringify(empty()))), true);
  const m = mergeDbs({ ...empty(), txs: [tx('a', 1), tx('b')], paid: { x: 1 } }, { ...empty(), txs: [tx('a', 99), tx('c')], paid: { y: 2 } });
  assert.deepEqual(m.txs.map((t) => [t.id, t.amount]).sort(), [['a', 1], ['b', 10], ['c', 10]]); // gana lo local
  assert.deepEqual(m.paid, { y: 2, x: 1 });

  // --- 1) Nube vacía: se sube lo del dispositivo (migración de lo que ya tenías) ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, { ...empty(), txs: [tx('a')] });
    await a.engine.start();
    assert.equal(cloud.row?.version, 1);
    assert.equal(cloud.row?.data.txs.length, 1);
    assert.equal(a.engine.state.status, 'synced');
    assert.equal(a.meta?.version, 1);
    assert.equal(a.meta?.dirty, false);
  }

  // --- 2) Dispositivo nuevo y vacío: baja lo de la nube ---
  {
    const cloud = new FakeCloud();
    cloud.row = { data: { ...empty(), txs: [tx('a'), tx('b')] }, version: 3 };
    const b = device(cloud, empty());
    await b.engine.start();
    assert.equal(b.db.txs.length, 2);
    assert.equal(b.engine.version, 3);
    assert.equal(b.engine.state.status, 'synced');
  }

  // --- 3) Datos distintos en ambos lados la primera vez: pide decidir ---
  {
    const mk = () => {
      const cloud = new FakeCloud();
      cloud.row = { data: { ...empty(), txs: [tx('nube')] }, version: 2 };
      return cloud;
    };
    // nube
    let cloud = mk();
    let c = device(cloud, { ...empty(), txs: [tx('local')] });
    await c.engine.start();
    assert.equal(c.engine.state.status, 'conflict');
    assert.equal(c.db.txs[0].id, 'local'); // aún no toca nada
    await c.engine.resolve('nube');
    assert.deepEqual(c.db.txs.map((t) => t.id), ['nube']);
    assert.equal(c.engine.state.status, 'synced');
    // dispositivo
    cloud = mk();
    c = device(cloud, { ...empty(), txs: [tx('local')] });
    await c.engine.start();
    await c.engine.resolve('dispositivo');
    assert.deepEqual(cloud.row?.data.txs.map((t) => t.id), ['local']);
    assert.equal(cloud.row?.version, 3);
    // combinar
    cloud = mk();
    c = device(cloud, { ...empty(), txs: [tx('local')] });
    await c.engine.start();
    await c.engine.resolve('combinar');
    assert.deepEqual(cloud.row?.data.txs.map((t) => t.id).sort(), ['local', 'nube']);
    assert.deepEqual(c.db.txs.map((t) => t.id).sort(), ['local', 'nube']);
  }

  // --- 4) Cambios locales se suben; un segundo dispositivo los recibe ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, empty());
    await a.engine.start();
    const b = device(cloud, empty());
    await b.engine.start();
    a.edit((db) => db.txs.push(tx('a1')));
    assert.equal(a.engine.state.status, 'pending');
    assert.equal(a.meta?.dirty, true); // se recuerda aunque se cierre la app
    await a.engine.sync();
    assert.equal(cloud.row?.version, 2);
    assert.equal(a.engine.state.status, 'synced');
    assert.equal(a.meta?.dirty, false);
    await b.engine.sync(); // b vuelve a la app
    assert.deepEqual(b.db.txs.map((t) => t.id), ['a1']);
  }

  // --- 5) Edición en los dos a la vez: se unen, no se pisa ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, empty());
    await a.engine.start();
    const b = device(cloud, empty());
    await b.engine.start();
    a.edit((db) => db.txs.push(tx('desde-a')));
    b.edit((db) => db.txs.push(tx('desde-b')));
    await a.engine.sync(); // a guarda primero
    await b.engine.sync(); // b está desactualizado → trae, une y guarda
    assert.deepEqual(cloud.row?.data.txs.map((t) => t.id).sort(), ['desde-a', 'desde-b']);
    assert.deepEqual(b.db.txs.map((t) => t.id).sort(), ['desde-a', 'desde-b']);
    await a.engine.sync();
    assert.deepEqual(a.db.txs.map((t) => t.id).sort(), ['desde-a', 'desde-b']);
  }

  // --- 6) Sin conexión: queda pendiente y se reintenta sin perder nada ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, empty());
    await a.engine.start();
    a.edit((db) => db.txs.push(tx('offline')));
    cloud.failNext = true;
    await a.engine.sync();
    assert.equal(a.engine.state.status, 'error');
    assert.equal(a.engine.state.error, 'sin conexión');
    assert.equal(a.engine.dirty, true);
    assert.equal(a.meta?.dirty, true);
    await a.engine.sync();
    assert.equal(a.engine.state.status, 'synced');
    assert.equal(cloud.row?.data.txs[0].id, 'offline');
  }

  // --- 7) Reiniciar la app con cambios pendientes: el estado recordado los sube ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, empty());
    await a.engine.start();
    a.edit((db) => db.txs.push(tx('pendiente')));
    const saved = a.meta as SyncMeta; // la app se cierra aquí
    const a2 = device(cloud, a.db, saved);
    await a2.engine.start();
    assert.equal(cloud.row?.data.txs[0].id, 'pendiente');
    assert.equal(a2.engine.state.status, 'synced');
  }

  // --- 8) Un cambio hecho mientras se guarda no se da por sincronizado ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, empty());
    await a.engine.start();
    a.edit((db) => db.txs.push(tx('uno')));
    const original = cloud.update.bind(cloud);
    cloud.update = async (db, base) => {
      a.edit((x) => x.txs.push(tx('dos'))); // el usuario edita durante la subida
      return original(db, base);
    };
    await a.engine.sync();
    assert.equal(a.engine.dirty, true);
    assert.equal(a.engine.state.status, 'pending');
    cloud.update = original;
    await a.engine.sync();
    assert.equal(cloud.row?.data.txs.length, 2);
    assert.equal(a.engine.dirty, false);
  }

  // --- 9) Otro dispositivo creó la nube justo antes: no se pierde nada ---
  {
    const cloud = new FakeCloud();
    const a = device(cloud, { ...empty(), txs: [tx('a')] });
    const insert = cloud.insert.bind(cloud);
    let first = true;
    cloud.insert = async (db) => {
      if (first) {
        first = false;
        cloud.row = { data: { ...empty(), txs: [tx('otro')] }, version: 1 };
      }
      return insert(db);
    };
    await a.engine.start();
    assert.equal(a.engine.state.status, 'conflict'); // ambos tienen datos distintos → decide el usuario
  }

  console.log('OK: sincronización (nube simulada)');
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
