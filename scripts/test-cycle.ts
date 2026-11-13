import assert from 'node:assert/strict';
import { periodFor, shiftPeriod, type Cycle } from '../src/dates';
import { cycleOf, summarize, todayView } from '../src/finance';
import { projection } from '../src/insights';
import type { DB } from '../src/types';

// Cobras el 15 y el 31 (o el viernes anterior si cae en fin de semana)
const cycle: Cycle = { days: [15, 31], rule: 'viernes' };

// 12-nov-2026: la paga del 30-oct (31 era sábado) cubre del 30-oct al 12-nov
let p = periodFor('quincena', '2026-11-12', cycle);
assert.deepEqual([p.start, p.end], ['2026-10-30', '2026-11-12']);
// La paga del 13-nov (15 era domingo) cubre del 13 al 29
p = periodFor('quincena', '2026-11-13', cycle);
assert.deepEqual([p.start, p.end], ['2026-11-13', '2026-11-29']);
assert.deepEqual([periodFor('quincena', '2026-11-29', cycle).start, periodFor('quincena', '2026-11-29', cycle).end], ['2026-11-13', '2026-11-29']);
// La paga del 30-nov (lunes) empieza otra quincena
p = periodFor('quincena', '2026-11-30', cycle);
assert.deepEqual([p.start, p.end], ['2026-11-30', '2026-12-14']);
assert.ok(p.label.includes('30 nov') && p.label.includes('14 dic'));

// Navegar adelante y atrás encadena sin huecos ni traslapes
let cur = periodFor('quincena', '2026-11-12', cycle);
const seen: string[] = [];
for (let i = 0; i < 8; i++) {
  const next = shiftPeriod(cur, 1, cycle);
  assert.equal(next.start, new Date(Date.UTC(+cur.end.slice(0, 4), +cur.end.slice(5, 7) - 1, +cur.end.slice(8) + 1)).toISOString().slice(0, 10));
  assert.deepEqual(shiftPeriod(next, -1, cycle), cur);
  seen.push(`${cur.start}..${cur.end}`);
  cur = next;
}
assert.equal(seen[1], '2026-11-13..2026-11-29');
assert.equal(seen[3], '2026-12-15..2026-12-30');

// Mes y semana no cambian
assert.equal(periodFor('mes', '2026-11-12', cycle).start, '2026-11-01');
assert.equal(periodFor('semana', '2026-11-12', cycle).start, '2026-11-09');
// Sin ciclo: quincenas de calendario como antes
assert.equal(periodFor('quincena', '2026-11-12').start, '2026-11-01');

// ---- Con datos: el pago de tarjeta del 16 cae en la quincena que empieza el 13 ----
const db: DB = {
  accounts: [
    { id: 'deb', name: 'Débito', kind: 'debito', color: '#000', initialBalance: 2000 },
    { id: 'nu', name: 'Nu', kind: 'credito', color: '#800', cutDay: 6, dueDay: 16, payFromId: 'deb' },
  ],
  txs: [],
  fixed: [
    { id: 's', name: 'Sueldo', amount: 9000, kind: 'ingreso', freq: 'quincenal', days: [15, 31], weekend: 'viernes', startDate: '2026-10-01', accountId: 'deb' },
    { id: 'g', name: 'Gasolina', amount: 1000, kind: 'gasto', freq: 'quincenal', days: [15, 31], weekend: 'viernes', startDate: '2026-10-01', accountId: 'deb' },
  ],
  plans: [{ id: 'p', accountId: 'nu', name: 'Saldo corte', monthlyAmount: 4212, months: 1, firstDue: '2026-11-16' }],
  paid: { 's|2026-10-30': 9000, 'g|2026-10-30': 1000 },
  overrides: {},
  settings: {},
};
assert.deepEqual(cycleOf(db), { days: [15, 31], rule: 'viernes' });

const today = '2026-11-12';
const before = periodFor('quincena', today, cycleOf(db));
const sb = summarize(db, before);
assert.equal(sb.pagosTarjeta, 0); // el 16 todavía no es de esta quincena
const tvb = todayView(db, before, today);
assert.equal(tvb.throughMonth, false);
assert.equal(tvb.tarjetasTotal, 0);
assert.equal(tvb.cash, 2000 + 9000 - 1000);

const after = periodFor('quincena', '2026-11-13', cycleOf(db));
const sa = summarize(db, after);
assert.equal(sa.pagosTarjeta, 4212); // paga del 13 cubre la tarjeta del 16
assert.equal(sa.entradas, 9000);
assert.equal(sa.fijos, 1000);
assert.equal(sa.disponible, 9000 - 1000 - 4212);

// Estimación: periodos de paga a paga
const proj = projection(db, 'quincena', today, 3);
assert.deepEqual(proj.rows.map((r) => [r.period.start, r.period.end]), [
  ['2026-10-30', '2026-11-12'],
  ['2026-11-13', '2026-11-29'],
  ['2026-11-30', '2026-12-14'],
]);
assert.equal(proj.rows[1].tarjetas, 4212);

// Si el sueldo no define la quincena, vuelve el calendario y se aparta hasta fin de mes
db.fixed[0].cycle = false;
assert.equal(cycleOf(db), undefined);
const cal = periodFor('quincena', today, cycleOf(db));
assert.equal(cal.start, '2026-11-01');
assert.equal(todayView(db, cal, today).throughMonth, true);
assert.equal(todayView(db, cal, today).tarjetasTotal, 4212);

console.log('OK: quincena de paga a paga');
