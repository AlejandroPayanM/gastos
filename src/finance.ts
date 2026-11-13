import { addDays, addMonths, clampDay, inRange, monthIndex, parse, weekdayMon, ymd } from './dates';
import type { Account, DB, Fixed, Period, WeekendRule } from './types';
import { round2 } from './money';

export const isCard = (a?: Account) => a?.kind === 'credito';
export const findAccount = (db: DB, id?: string) => (id ? db.accounts.find((a) => a.id === id) : undefined);

/* ------------------------------------------------------------------ */
/* Pagos fijos                                                         */
/* ------------------------------------------------------------------ */

export function fixedOccurrences(f: Fixed, start: string, end: string): string[] {
  const out: string[] = [];
  const lo = f.startDate && f.startDate > start ? f.startDate : start;
  if (lo > end) return out;

  if (f.freq === 'semanal') {
    for (let d = lo; d <= end; d = addDays(d, 1)) if (weekdayMon(d) === (f.weekday ?? 0)) out.push(d);
    return out;
  }

  // Se revisa un mes antes y uno después porque al mover por fin de semana
  // una fecha puede cruzar al mes vecino (p. ej. domingo 1 → viernes 30 del mes anterior).
  const rule = weekendRule(f);
  const s = parse(lo);
  const e = parse(end);
  const first = addMonths(s.y, s.m, -1);
  const last = addMonths(e.y, e.m, 1);
  let { y, m } = first;
  while (y < last.y || (y === last.y && m <= last.m)) {
    const days = f.freq === 'mensual' ? [f.day ?? 1] : f.days ?? [15, 30];
    for (const dd of days) {
      const ds = shiftWeekend(ymd(y, m, clampDay(y, m, dd)), rule);
      if (ds >= lo && ds <= end) out.push(ds);
    }
    ({ y, m } = addMonths(y, m, 1));
  }
  return [...new Set(out)].sort();
}

/** Qué hacer cuando la fecha cae en sábado o domingo. */
export const weekendRule = (f: Pick<Fixed, 'freq' | 'weekend'>): WeekendRule => f.weekend ?? (f.freq === 'quincenal' ? 'viernes' : 'igual');

/** Mueve sábado/domingo al viernes anterior o al lunes siguiente, según la regla. */
export function shiftWeekend(date: string, rule: WeekendRule) {
  if (rule === 'igual') return date;
  const w = weekdayMon(date); // 0 = lunes … 5 = sábado, 6 = domingo
  if (w < 5) return date;
  return rule === 'viernes' ? addDays(date, -(w - 4)) : addDays(date, 7 - w);
}

export const fixedKey = (f: Fixed, date: string) => `${f.id}|${date}`;

export interface FixedOcc {
  key: string;
  fixed: Fixed;
  date: string;
  paid: boolean;
  onCard: boolean;
  /** Monto de esta ocurrencia (ajustado si lo editaste, si no el del pago fijo) */
  amount: number;
  adjusted: boolean;
}

export function fixedOccs(db: DB, start: string, end: string): FixedOcc[] {
  const out: FixedOcc[] = [];
  for (const f of db.fixed) {
    const onCard = isCard(findAccount(db, f.accountId));
    for (const date of fixedOccurrences(f, start, end)) {
      const key = fixedKey(f, date);
      const adj = db.overrides?.[key];
      out.push({ key, fixed: f, date, paid: key in db.paid, onCard, amount: adj ?? f.amount, adjusted: adj !== undefined });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ */
/* Tarjetas de crédito: cortes, fechas límite y pagos                  */
/* ------------------------------------------------------------------ */

const cutIn = (a: Account, y: number, m: number) => ymd(y, m, clampDay(y, m, a.cutDay ?? 1));

/** Primera fecha límite (día `dueDay`) estrictamente posterior al corte. */
function dueAfter(a: Account, cut: string) {
  const { y, m } = parse(cut);
  const d1 = ymd(y, m, clampDay(y, m, a.dueDay ?? 1));
  if (d1 > cut) return d1;
  const n = addMonths(y, m, 1);
  return ymd(n.y, n.m, clampDay(n.y, n.m, a.dueDay ?? 1));
}

export interface Statement {
  cut: string;
  due: string;
  /** primer día incluido en este estado de cuenta */
  cycleStart: string;
}

/** Estados de cuenta cuya fecha límite de pago cae dentro de [start, end]. */
export function statementsDue(a: Account, start: string, end: string): Statement[] {
  const s = parse(start);
  const e = parse(end);
  const out: Statement[] = [];
  let { y, m } = addMonths(s.y, s.m, -2);
  while (y < e.y || (y === e.y && m <= e.m)) {
    const cut = cutIn(a, y, m);
    const due = dueAfter(a, cut);
    if (due >= start && due <= end) {
      const pm = addMonths(y, m, -1);
      out.push({ cut, due, cycleStart: addDays(cutIn(a, pm.y, pm.m), 1) });
    }
    ({ y, m } = addMonths(y, m, 1));
  }
  return out;
}

/** Próxima fecha de corte (hoy cuenta) */
export function nextCut(a: Account, today: string) {
  const { y, m } = parse(today);
  const c = cutIn(a, y, m);
  if (c >= today) return c;
  const n = addMonths(y, m, 1);
  return cutIn(a, n.y, n.m);
}

/** Compras / cargos fijos hechos con la tarjeta entre dos fechas (incluidas). */
export function cardCharges(db: DB, a: Account, from: string, to: string) {
  let total = 0;
  for (const t of db.txs) {
    if (t.accountId === a.id && t.type !== 'ingreso' && inRange(t.date, from, to)) total += t.amount;
  }
  for (const f of db.fixed) {
    if (f.accountId === a.id && f.kind === 'gasto') {
      total += f.amount * fixedOccurrences(f, from, to).length;
    }
  }
  return round2(total);
}

/** Mensualidades programadas (MSI / saldos previos) que se pagan en el mes de `due`. */
export function planAmountDue(db: DB, a: Account, due: string) {
  let total = 0;
  const di = monthIndex(due);
  for (const p of db.plans) {
    if (p.accountId !== a.id) continue;
    const k = di - monthIndex(p.firstDue);
    if (k >= 0 && k < p.months) total += p.monthlyAmount;
  }
  return round2(total);
}

export const cardKey = (a: Account, due: string) => `card:${a.id}|${due}`;

export interface CardPayment {
  key: string;
  account: Account;
  cut: string;
  due: string;
  cycleStart: string;
  charges: number;
  plans: number;
  /** Monto final (pagado, ajustado o calculado) */
  amount: number;
  /** Monto calculado automáticamente según compras y planes */
  computed: number;
  adjusted: boolean;
  paid: boolean;
}

export function cardPayments(db: DB, start: string, end: string, onlyId?: string): CardPayment[] {
  const out: CardPayment[] = [];
  for (const a of db.accounts) {
    if (!isCard(a) || (onlyId && a.id !== onlyId)) continue;
    for (const st of statementsDue(a, start, end)) {
      const charges = cardCharges(db, a, st.cycleStart, st.cut);
      const plans = planAmountDue(db, a, st.due);
      const key = cardKey(a, st.due);
      const computed = round2(charges + plans);
      const paid = key in db.paid;
      const adj = db.overrides?.[key];
      const amount = paid ? db.paid[key] : adj ?? computed;
      if (computed > 0 || paid || adj !== undefined) {
        out.push({ key, account: a, cut: st.cut, due: st.due, cycleStart: st.cycleStart, charges, plans, amount, computed, adjusted: adj !== undefined, paid });
      }
    }
  }
  return out.sort((a, b) => a.due.localeCompare(b.due));
}

/* ------------------------------------------------------------------ */
/* Resumen por periodo                                                 */
/* ------------------------------------------------------------------ */

export interface Summary {
  entradas: number;
  entradasFijas: number;
  gastos: number;
  imprevistos: number;
  fijos: number;
  fijosPendientes: number;
  pagosTarjeta: number;
  pagosTarjetaPendientes: number;
  comprasTarjeta: number;
  disponible: number;
  pendiente: number;
  salidas: number;
  occs: FixedOcc[];
  pagos: CardPayment[];
  byCategory: { category: string; total: number }[];
}

export function summarize(db: DB, p: Period): Summary {
  const txs = db.txs.filter((t) => inRange(t.date, p.start, p.end));
  const onCard = (id?: string) => isCard(findAccount(db, id));

  let entradasTx = 0;
  let gastos = 0;
  let imprevistos = 0;
  let comprasTarjeta = 0;
  const cats = new Map<string, number>();

  for (const t of txs) {
    if (t.type === 'ingreso') {
      entradasTx += t.amount;
      continue;
    }
    cats.set(t.category, (cats.get(t.category) ?? 0) + t.amount);
    if (onCard(t.accountId)) comprasTarjeta += t.amount;
    else if (t.type === 'gasto') gastos += t.amount;
    else imprevistos += t.amount;
  }

  const occs = fixedOccs(db, p.start, p.end);
  let entradasFijas = 0;
  let fijos = 0;
  let fijosPendientes = 0;
  for (const o of occs) {
    if (o.fixed.kind === 'ingreso') {
      entradasFijas += o.amount;
    } else if (o.onCard) {
      comprasTarjeta += o.amount;
      cats.set(o.fixed.category ?? 'Fijos', (cats.get(o.fixed.category ?? 'Fijos') ?? 0) + o.amount);
    } else {
      const amt = o.paid ? db.paid[o.key] : o.amount;
      fijos += amt;
      if (!o.paid) fijosPendientes += amt;
    }
  }

  const pagos = cardPayments(db, p.start, p.end);
  const pagosTarjeta = pagos.reduce((s, x) => s + x.amount, 0);
  const pagosTarjetaPendientes = pagos.filter((x) => !x.paid).reduce((s, x) => s + x.amount, 0);

  const entradas = entradasTx + entradasFijas;
  const salidas = gastos + imprevistos + fijos + pagosTarjeta;

  return {
    entradas: round2(entradas),
    entradasFijas: round2(entradasFijas),
    gastos: round2(gastos),
    imprevistos: round2(imprevistos),
    fijos: round2(fijos),
    fijosPendientes: round2(fijosPendientes),
    pagosTarjeta: round2(pagosTarjeta),
    pagosTarjetaPendientes: round2(pagosTarjetaPendientes),
    comprasTarjeta: round2(comprasTarjeta),
    disponible: round2(entradas - salidas),
    pendiente: round2(fijosPendientes + pagosTarjetaPendientes),
    salidas: round2(salidas),
    occs,
    pagos,
    byCategory: [...cats.entries()].map(([category, total]) => ({ category, total: round2(total) })).sort((a, b) => b.total - a.total),
  };
}

/* ------------------------------------------------------------------ */
/* Cuentas                                                             */
/* ------------------------------------------------------------------ */

/** Saldo de una cuenta de débito / efectivo hasta `today` (incluido). */
export function accountBalance(db: DB, a: Account, today: string) {
  let bal = a.initialBalance ?? 0;
  for (const t of db.txs) {
    if (t.accountId !== a.id || t.date > today) continue;
    bal += t.type === 'ingreso' ? t.amount : -t.amount;
  }
  for (const [key, amount] of Object.entries(db.paid)) {
    const [id, date] = key.split('|');
    if (date > today) continue;
    if (id.startsWith('card:')) {
      const card = findAccount(db, id.slice(5));
      if (card?.payFromId === a.id) bal -= amount;
    } else {
      const f = db.fixed.find((x) => x.id === id);
      if (f?.accountId === a.id) bal += f.kind === 'ingreso' ? amount : -amount;
    }
  }
  return round2(bal);
}

export interface CardStatus {
  used: number;
  available?: number;
  nextCut: string;
  nextPayment?: CardPayment;
}

export function cardStatus(db: DB, a: Account, today: string): CardStatus {
  let charges = 0;
  for (const t of db.txs) if (t.accountId === a.id && t.type !== 'ingreso') charges += t.amount;
  for (const f of db.fixed) {
    if (f.accountId === a.id && f.kind === 'gasto') charges += f.amount * fixedOccurrences(f, f.startDate, today).length;
  }
  const plansTotal = db.plans.filter((p) => p.accountId === a.id).reduce((s, p) => s + p.monthlyAmount * p.months, 0);
  let paid = 0;
  for (const [key, amount] of Object.entries(db.paid)) if (key.startsWith(`card:${a.id}|`)) paid += amount;
  const used = Math.max(0, round2(charges + plansTotal - paid));
  const upcoming = cardPayments(db, today, addDays(today, 75), a.id).filter((x) => !x.paid);
  return {
    used,
    available: a.creditLimit ? round2(a.creditLimit - used) : undefined,
    nextCut: nextCut(a, today),
    nextPayment: upcoming[0],
  };
}
