import assert from 'node:assert/strict';
import { periodFor, shiftPeriod } from '../src/dates';
import { accountBalance, cardPayments, cardStatus, fixedOccurrences, summarize } from '../src/finance';
import type { DB } from '../src/types';

// --- periodos ---
assert.deepEqual([periodFor('quincena', '2026-11-10').start, periodFor('quincena', '2026-11-10').end], ['2026-11-01', '2026-11-15']);
assert.deepEqual([periodFor('quincena', '2026-02-20').start, periodFor('quincena', '2026-02-20').end], ['2026-02-16', '2026-02-28']);
assert.equal(shiftPeriod(periodFor('quincena', '2026-12-20'), 1).start, '2027-01-01');
assert.equal(shiftPeriod(periodFor('quincena', '2027-01-03'), -1).start, '2026-12-16');
assert.equal(periodFor('semana', '2026-11-12').start, '2026-11-09'); // jueves -> lunes
assert.equal(periodFor('semana', '2026-11-12').end, '2026-11-15');

// --- recurrencia ---
const base = { id: 'f', name: 'x', amount: 100, kind: 'gasto' as const, startDate: '2026-01-01' };
assert.deepEqual(fixedOccurrences({ ...base, freq: 'mensual', day: 31 }, '2026-02-01', '2026-03-31'), ['2026-02-28', '2026-03-31']);
assert.deepEqual(fixedOccurrences({ ...base, freq: 'quincenal', days: [13, 30] }, '2026-11-01', '2026-11-30'), ['2026-11-13', '2026-11-30']);
assert.equal(fixedOccurrences({ ...base, freq: 'semanal', weekday: 4 }, '2026-11-01', '2026-11-30').length, 4); // viernes

// --- tarjeta: corte 26, límite de pago 16 (siguiente mes) ---
const db: DB = {
  accounts: [
    { id: 'deb', name: 'Débito', kind: 'debito', color: '#000', initialBalance: 5000 },
    { id: 'nu', name: 'Nu', kind: 'credito', color: '#800', cutDay: 26, dueDay: 16, creditLimit: 10000, payFromId: 'deb' },
  ],
  txs: [
    { id: '1', type: 'gasto', amount: 1000, concept: 'Super', category: 'Comida', date: '2026-11-10', accountId: 'nu' },
    { id: '2', type: 'gasto', amount: 500, concept: 'Gasolina', category: 'Gasolina', date: '2026-11-27', accountId: 'nu' }, // ya cae al siguiente corte
    { id: '3', type: 'imprevisto', amount: 300, concept: 'Llanta', category: 'Auto', date: '2026-11-12', accountId: 'deb' },
    { id: '4', type: 'ingreso', amount: 9000, concept: 'Sueldo', category: 'Sueldo', date: '2026-11-13', accountId: 'deb' },
  ],
  fixed: [{ id: 'net', name: 'Internet', amount: 350, kind: 'gasto', freq: 'mensual', day: 13, startDate: '2026-01-01', accountId: 'deb' }],
  plans: [{ id: 'p1', accountId: 'nu', name: 'Taller', monthlyAmount: 3215.41, months: 1, firstDue: '2026-12-16' }],
  paid: {},
  overrides: {},
  settings: {},
};

// Estado con corte 26-oct -> pago 16-nov (sin cargos en este ejemplo)
// Estado con corte 26-nov (compras 27-oct..26-nov: 1000) -> pago 16-dic, más plan 3215.41
const dic = cardPayments(db, '2026-12-01', '2026-12-31');
assert.equal(dic.length, 1);
assert.equal(dic[0].due, '2026-12-16');
assert.equal(dic[0].cut, '2026-11-26');
assert.equal(dic[0].charges, 1000);
assert.equal(dic[0].plans, 3215.41);
assert.equal(dic[0].amount, 4215.41);

// La compra del 27-nov cae al corte del 26-dic -> pago el 16-ene
const ene = cardPayments(db, '2027-01-01', '2027-01-31');
assert.equal(ene[0].amount, 500);

// Resumen de la 1ª quincena de diciembre: debe incluir el pago de tarjeta
const s = summarize(db, periodFor('quincena', '2026-12-16'));
assert.equal(s.pagosTarjeta, 4215.41);
assert.equal(s.disponible, round(-4215.41 - 350 * 0)); // sin entradas en esa quincena
const nov1 = summarize(db, periodFor('quincena', '2026-11-01'));
assert.equal(nov1.entradas, 9000);
assert.equal(nov1.imprevistos, 300);
assert.equal(nov1.fijos, 350);
assert.equal(nov1.comprasTarjeta, 1000);
assert.equal(nov1.disponible, 9000 - 300 - 350);

// Saldos
assert.equal(accountBalance(db, db.accounts[0], '2026-11-30'), 5000 + 9000 - 300);
db.paid['card:nu|2026-12-16'] = 4215.41;
assert.equal(accountBalance(db, db.accounts[0], '2026-12-20'), 5000 + 9000 - 300 - 4215.41);
const st = cardStatus(db, db.accounts[1], '2026-11-30');
assert.equal(st.used, round(1000 + 500 + 3215.41 - 4215.41));
assert.equal(st.available, 10000 - st.used);

function round(n: number) {
  return Math.round(n * 100) / 100;
}
console.log('OK: toda la lógica pasa');
