import assert from 'node:assert/strict';
import { daysBetween, periodFor } from '../src/dates';
import { fixedOccurrences, summarize } from '../src/finance';
import type { DB, Fixed } from '../src/types';

const ahorro = (startDate: string): Fixed => ({ id: 'a', name: 'Ahorro', amount: 1000, kind: 'gasto', freq: 'bisemanal', startDate, accountId: 'deb' });

assert.equal(daysBetween('2026-11-13', '2026-11-27'), 14);
assert.equal(daysBetween('2026-11-27', '2026-11-13'), -14);

// Un viernes sí y otro no, desde el viernes 13-nov-2026
const f = ahorro('2026-11-13');
assert.deepEqual(fixedOccurrences(f, '2026-11-01', '2026-12-31'), ['2026-11-13', '2026-11-27', '2026-12-11', '2026-12-25']);
// Rango que empieza a la mitad: respeta la cadencia de 14 días
assert.deepEqual(fixedOccurrences(f, '2026-12-01', '2026-12-31'), ['2026-12-11', '2026-12-25']);
assert.deepEqual(fixedOccurrences(f, '2026-12-12', '2027-01-31'), ['2026-12-25', '2027-01-08', '2027-01-22']);
// Antes del primer pago no hay nada
assert.deepEqual(fixedOccurrences(f, '2026-11-01', '2026-11-12'), []);
// Todas son viernes
for (const d of fixedOccurrences(f, '2026-11-01', '2027-06-30')) assert.equal(new Date(d + 'T00:00:00Z').getUTCDay(), 5);
// Unos 26 al año (27 si el primero cae el 1-ene y el último el 31-dic)
assert.equal(fixedOccurrences(ahorro('2027-01-08'), '2027-01-01', '2027-12-31').length, 26);
assert.equal(fixedOccurrences(ahorro('2027-01-01'), '2027-01-01', '2027-12-31').length, 27);

// Meses con tres pagos (y no coincide con la paga): oct-2026 desde el viernes 2
const tres = fixedOccurrences(ahorro('2026-10-02'), '2026-10-01', '2026-10-31');
assert.deepEqual(tres, ['2026-10-02', '2026-10-16', '2026-10-30']);

// Entra al resumen del periodo como cualquier pago fijo
const db: DB = {
  accounts: [{ id: 'deb', name: 'Débito', kind: 'debito', color: '#000', initialBalance: 0 }],
  txs: [],
  fixed: [f],
  plans: [],
  paid: {},
  overrides: {},
  settings: {},
};
const s = summarize(db, periodFor('mes', '2026-11-12'));
assert.equal(s.fijos, 2000); // 13 y 27 de noviembre
// Un viernes sin ahorrar: se ajusta solo esa fecha a 0
db.overrides['a|2026-11-27'] = 0;
assert.equal(summarize(db, periodFor('mes', '2026-11-12')).fijos, 1000);

console.log('OK: pagos fijos cada 2 semanas');
