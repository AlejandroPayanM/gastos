import assert from 'node:assert/strict';
import { cardPayments, cashNow, fixedOccs, summarize, todayView } from '../src/finance';
import { historyRows, historyTotals, projection, toCsv } from '../src/insights';
import { periodFor } from '../src/dates';
const round = (n: number) => Math.round(n * 100) / 100;
import type { DB } from '../src/types';

const mk = (): DB => ({
  accounts: [
    { id: 'deb', name: 'Débito', kind: 'debito', color: '#000', initialBalance: 2100 },
    { id: 'nu', name: 'Nu', kind: 'credito', color: '#800', cutDay: 26, dueDay: 16, creditLimit: 12000, payFromId: 'deb' },
  ],
  txs: [
    { id: '1', type: 'gasto', amount: 1000, concept: 'Super, y "otros"', category: 'Comida', date: '2026-11-10', accountId: 'nu' },
    { id: '2', type: 'imprevisto', amount: 300, concept: 'Llanta', category: 'Auto', date: '2026-11-12', accountId: 'deb' },
  ],
  fixed: [
    { id: 'g', name: 'Gasolina', amount: 1000, kind: 'gasto', freq: 'quincenal', days: [13, 30], startDate: '2026-01-01', accountId: 'deb' },
    { id: 'i', name: 'Internet', amount: 350, kind: 'gasto', freq: 'mensual', day: 13, startDate: '2026-01-01', accountId: 'deb' },
    { id: 's', name: 'Sueldo', amount: 9000, kind: 'ingreso', freq: 'quincenal', days: [13, 30], startDate: '2026-01-01', accountId: 'deb' },
  ],
  plans: [
    { id: 'p1', accountId: 'nu', name: 'Saldo corte', monthlyAmount: 4212, months: 1, firstDue: '2026-11-16' },
    { id: 'p2', accountId: 'nu', name: 'Taller', monthlyAmount: 3215.41, months: 1, firstDue: '2026-12-16' },
  ],
  paid: {},
  overrides: {},
  settings: { carryOver: true }, // las pruebas de abajo suponen que el sobrante pasa a la siguiente quincena
});

const today = '2026-11-12';

// --- Sobrante que no se arrastra (por defecto) ---
{
  const db = mk();
  db.settings = {};
  // Mismas quincenas: el sobrante de cada una se asume gastado, solo queda lo que entra en la siguiente
  const q = projection(db, 'quincena', today, 4);
  assert.equal(q.carryOver, false);
  assert.deepEqual(q.rows.map((r) => r.startBalance), [1800, 0, 0, 0]);
  assert.deepEqual(q.rows.map((r) => r.endBalance), [0, 0, 0, 0]);
  assert.deepEqual(q.rows.map((r) => r.dropped), [9800, 13238 - 9800, 21238 - 13238, 24672.59 - 21238]);
  // En vista mensual el cierre de noviembre ya no suma el sobrante de la 1ª quincena a la paga del 30
  const m = projection(db, 'mes', today, 2);
  const conArrastre = projection(mk(), 'mes', today, 2);
  assert.equal(m.rows[0].dropped, 13238); // sobrantes de las quincenas 30-oct y 13-nov
  assert.equal(m.rows[0].endBalance, round(conArrastre.rows[0].endBalance - 13238)); // solo queda lo que entra el 30
  assert.equal(m.rows[1].startBalance, m.rows[0].endBalance);
  // Guardar el sobrante de una quincena concreta (p. ej. diciembre) sí lo suma
  const db2 = mk();
  db2.settings = { keepPeriods: ['2026-11-13'] };
  const k = projection(db2, 'quincena', today, 3);
  assert.deepEqual(k.rows.map((r) => r.endBalance), [0, 13238 - 9800, 0]);
  assert.equal(k.rows[2].startBalance, 13238 - 9800);
  // Un faltante (negativo) no se descarta
  const db3 = mk();
  db3.settings = {};
  db3.fixed[2].amount = 100; // sueldo muy bajo
  const n = projection(db3, 'quincena', today, 3);
  assert.ok(n.rows[1].endBalance < 0);
  assert.equal(n.rows[2].startBalance, n.rows[1].endBalance);
}

// --- Estimación sin historial de gasto variable ---
// El sueldo cae el 13 y el 30 → quincenas de paga a paga: 30-oct..12-nov, 13..29-nov, 30-nov..10-dic, 11..29-dic
{
  const proj = projection(mk(), 'quincena', today, 4);
  assert.equal(proj.startBalance, 1800);
  assert.deepEqual(
    proj.rows.map((r) => [r.period.start, r.period.end]),
    [
      ['2026-10-30', '2026-11-12'],
      ['2026-11-13', '2026-11-29'],
      ['2026-11-30', '2026-12-10'],
      ['2026-12-11', '2026-12-29'],
    ],
  );
  // La 1ª incluye la paga del 30-oct que no está marcada como recibida (+9000 − 1000 de gasolina)
  assert.deepEqual(
    proj.rows.map((r) => r.endBalance),
    [9800, 13238, 21238, 24672.59],
  );
  assert.equal(proj.rows[1].tarjetas, 4212); // pago de tarjeta del 16-nov cae en la quincena que empieza el 13
  assert.equal(proj.rows[3].tarjetas, 4215.41); // 1000 de compras + 3215.41 del taller
  assert.equal(proj.lowest?.period.start, '2026-10-30');
  assert.equal(proj.variable, 0);
  assert.equal(proj.freeNow, 9800);
  assert.equal(proj.daysLeft, 1); // hoy es el último día de la quincena
  assert.equal(proj.perDay, 9800);
}

// --- Estimado propio de gasto variable (por quincena) ---
{
  const db = mk();
  db.settings.variableEstimate = 500;
  const q = projection(db, 'quincena', today, 2);
  assert.equal(q.rows[0].variable, 200); // 500 − 300 ya gastado en la quincena
  assert.equal(q.rows[1].variable, 500);
  const m = projection(db, 'mes', today, 1);
  assert.equal(m.variable, 1000); // dos quincenas
}

// --- Promedio automático con historial completo ---
{
  const db = mk();
  db.txs.push({ id: 'a', type: 'gasto', amount: 600, concept: 'x', category: 'Comida', date: '2026-09-30', accountId: 'deb' }); // quincena 30-sep..12-oct (primer dato: periodo completo)
  db.txs.push({ id: 'b', type: 'gasto', amount: 400, concept: 'y', category: 'Comida', date: '2026-10-20', accountId: 'deb' }); // 2ª quincena oct
  db.txs.push({ id: 'c', type: 'gasto', amount: 5000, concept: 'tarjeta', category: 'Ropa', date: '2026-10-21', accountId: 'nu' }); // no cuenta
  const p = projection(db, 'quincena', today, 1);
  assert.equal(p.variableSamples, 2);
  assert.equal(p.variableAuto, 500);
}

// --- Ajustes por periodo ---
{
  const db = mk();
  db.overrides['i|2026-11-13'] = 400;
  db.overrides['card:nu|2026-12-16'] = 4000;
  const occ = fixedOccs(db, '2026-11-01', '2026-11-30').find((o) => o.key === 'i|2026-11-13')!;
  assert.equal(occ.amount, 400);
  assert.equal(occ.adjusted, true);
  assert.equal(fixedOccs(db, '2026-12-01', '2026-12-31').find((o) => o.key === 'i|2026-12-13')!.amount, 350); // otros meses no cambian
  const pay = cardPayments(db, '2026-12-01', '2026-12-31')[0];
  assert.equal(pay.amount, 4000);
  assert.equal(pay.computed, 4215.41);
  assert.equal(summarize(db, periodFor('quincena', '2026-11-01')).fijos, 1400);
}

// --- Historial y CSV ---
{
  const db = mk();
  db.paid['g|2026-11-13'] = 1000;
  db.paid['s|2026-11-13'] = 9000;
  db.paid['card:nu|2026-11-16'] = 4212;
  const rows = historyRows(db, '2026-11-01', '2026-11-30');
  assert.equal(rows.length, 5); // 2 movimientos + 3 marcados como pagados
  assert.equal(rows[0].concept, 'Pago Nu'); // más reciente primero
  const t = historyTotals(rows);
  assert.equal(t.entradas, 9000);
  assert.equal(t.imprevistos, 300);
  assert.equal(t.salidas, 1000 + 4212); // gasolina + pago de tarjeta; la compra con tarjeta no se duplica
  assert.equal(t.neto, 9000 - 300 - 5212);

  const csv = toCsv(rows);
  assert.ok(csv.startsWith('﻿Fecha,Tipo,Concepto'));
  assert.ok(csv.includes('"Super, y ""otros"""'));
  assert.ok(csv.includes(',-300.00'));
  assert.equal(csv.split('\r\n').length, 6);
}

// --- Disponible hoy: el ingreso fijo aún no recibido no cuenta ---
{
  const db = mk();
  db.fixed[2].cycle = false; // quincenas de calendario para este caso
  const p = periodFor('quincena', today);
  const s = summarize(db, p);
  assert.equal(cashNow(db, today), 1800);
  assert.equal(s.entradasPorRecibir, 9000);
  assert.equal(s.pendiente, 1350); // gasolina + internet del 13
  assert.equal(cashNow(db, today) - s.pendiente, 450); // disponible hoy
  assert.equal(s.disponible, 9000 - 1350 - 300); // proyectado de la quincena: sueldo − fijos − imprevisto ya gastado

  // Al marcar el sueldo como recibido (aunque su fecha sea el 13 y hoy el 12) ya cuenta en el saldo
  db.paid['s|2026-11-13'] = 9000;
  const s2 = summarize(db, p);
  assert.equal(s2.entradasPorRecibir, 0);
  assert.equal(cashNow(db, today), 10800);
  assert.equal(cashNow(db, today) - s2.pendiente, 9450);
  // La estimación no lo cuenta dos veces
  assert.equal(projection(db, 'quincena', today, 1).rows[0].endBalance, 10800 - 1350);
}

// --- Vista "con lo que tengo hoy": la 1ª quincena aparta lo que vence el 16 ---
{
  const db = mk();
  db.fixed[2].cycle = false; // quincenas de calendario: se aparta hasta fin de mes
  db.plans = [{ id: 'p1', accountId: 'nu', name: 'Saldo corte', monthlyAmount: 4212, months: 1, firstDue: '2026-11-16' }];
  const q1 = periodFor('quincena', today); // 1–15 nov
  const v = todayView(db, q1, today);
  assert.equal(v.cash, 1800);
  assert.equal(v.fijosTotal, 1350); // gasolina + internet del 13
  assert.equal(v.tarjetasTotal, 4212); // vence el 16, ya cuenta aunque caiga en la 2ª quincena
  assert.equal(v.tarjetas.length, 1);
  assert.equal(v.available, 1800 - 1350 - 4212);
  assert.equal(v.porRecibirTotal, 9000);
  assert.equal(v.withIncome, 1800 - 1350 - 4212 + 9000);
  // En vista de mes cuenta todo el mes: ambas quincenas de fijos (gasolina 13 y 30, internet 13)
  const m = todayView(db, periodFor('mes', today), today);
  assert.equal(m.fijosTotal, 1000 + 350 + 1000);
  assert.equal(m.porRecibirTotal, 18000);
  // Pagar la tarjeta antes de su fecha la quita de lo pendiente y baja el saldo (se paga desde Débito)
  db.paid['card:nu|2026-11-16'] = 4212;
  const paid = todayView(db, q1, today);
  assert.equal(paid.tarjetasTotal, 0);
  assert.equal(paid.cash, 1800 - 4212);
}

// --- Lo que no tiene cuenta asignada se toma de la primera cuenta de débito ---
{
  const db = mk();
  db.accounts[1].payFromId = undefined; // la tarjeta no tiene cuenta de pago
  db.fixed[2].accountId = undefined; // sueldo sin cuenta
  db.txs.push({ id: 'z', type: 'gasto', amount: 100, concept: 'efectivo', category: 'Otros', date: '2026-11-11' });
  db.paid['card:nu|2026-12-16'] = 1000;
  db.paid['s|2026-11-13'] = 9000;
  assert.equal(cashNow(db, today), 2100 - 300 - 100 - 1000 + 9000);
}

console.log('OK: insights (estimación, ajustes, historial, csv)');
