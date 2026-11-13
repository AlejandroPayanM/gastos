import assert from 'node:assert/strict';
import { fixedOccurrences, shiftWeekend, weekendRule } from '../src/finance';
import { weekdayMon } from '../src/dates';
import type { Fixed } from '../src/types';

const q = (over: Partial<Fixed> = {}): Fixed => ({ id: 'q', name: 'Sueldo', amount: 1, kind: 'ingreso', freq: 'quincenal', days: [15, 31], startDate: '2020-01-01', ...over });

// Días de la semana de referencia (0 = lunes)
assert.equal(weekdayMon('2026-11-15'), 6); // domingo
assert.equal(weekdayMon('2026-08-15'), 5); // sábado

// 15 en domingo / sábado → viernes anterior
assert.deepEqual(fixedOccurrences(q(), '2026-11-01', '2026-11-15'), ['2026-11-13']);
assert.deepEqual(fixedOccurrences(q(), '2026-08-01', '2026-08-15'), ['2026-08-14']);
// 15 en día hábil no se mueve (15-oct-2026 es jueves)
assert.deepEqual(fixedOccurrences(q(), '2026-10-01', '2026-10-15'), ['2026-10-15']);

// Fin de mes: 31 de mayo 2026 es domingo → viernes 29; 30 de mayo sábado también iría al 29
assert.equal(weekdayMon('2026-05-31'), 6);
assert.deepEqual(fixedOccurrences(q(), '2026-05-16', '2026-05-31'), ['2026-05-29']);
// Febrero: día 31 se recorta al 28 (sábado en 2026) → viernes 27
assert.deepEqual(fixedOccurrences(q(), '2026-02-16', '2026-02-28'), ['2026-02-27']);
// Mes de 30 días: 30 de nov 2026 es lunes → no se mueve
assert.deepEqual(fixedOccurrences(q({ days: [15, 30] }), '2026-11-16', '2026-11-30'), ['2026-11-30']);

// El pago adelantado cuenta en la quincena donde cae realmente
assert.deepEqual(fixedOccurrences(q({ days: [1, 16] }), '2026-10-30', '2026-10-31'), ['2026-10-30']); // domingo 1-nov → viernes 30-oct
assert.deepEqual(fixedOccurrences(q({ days: [1, 16] }), '2026-11-01', '2026-11-15'), []); // ya no cae en nov

// Pasar al lunes (puede cruzar de mes)
assert.deepEqual(fixedOccurrences(q({ weekend: 'lunes' }), '2026-06-01', '2026-06-01'), ['2026-06-01']); // 31-may domingo → lunes 1-jun
// 31-oct (sábado) pasa al lunes 2-nov (entra a la 1ª quincena de nov) y el 15-nov (domingo) pasa al 16 (2ª quincena)
assert.deepEqual(fixedOccurrences(q({ weekend: 'lunes' }), '2026-11-01', '2026-11-15'), ['2026-11-02']);
assert.deepEqual(fixedOccurrences(q({ weekend: 'lunes' }), '2026-11-16', '2026-11-30'), ['2026-11-16', '2026-11-30']);

// Dejar igual
assert.deepEqual(fixedOccurrences(q({ weekend: 'igual' }), '2026-11-01', '2026-11-15'), ['2026-11-15']);

// Valores por defecto: quincenal → viernes, mensual → igual, y se respeta lo elegido
assert.equal(weekendRule({ freq: 'quincenal' }), 'viernes');
assert.equal(weekendRule({ freq: 'mensual' }), 'igual');
assert.equal(weekendRule({ freq: 'mensual', weekend: 'viernes' }), 'viernes');
assert.deepEqual(fixedOccurrences(q({ freq: 'mensual', day: 15, days: undefined }), '2026-11-01', '2026-11-30'), ['2026-11-15']); // mensual no se mueve por defecto

// Sin duplicados si dos días se mueven al mismo viernes (sábado 14 y domingo 15 con viernes)
assert.deepEqual(fixedOccurrences(q({ days: [14, 15] }), '2026-11-01', '2026-11-30'), ['2026-11-13']);

assert.equal(shiftWeekend('2026-11-14', 'viernes'), '2026-11-13');
assert.equal(shiftWeekend('2026-11-14', 'lunes'), '2026-11-16');

console.log('OK: regla de fin de semana');
