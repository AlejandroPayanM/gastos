import { daysBetween, inRange, periodFor, shiftPeriod } from './dates';
import { accountBalance, cardPayments, cycleOf, findAccount, fixedOccs, isCard } from './finance';
import { round2 } from './money';
import type { DB, Mode, Period, TxType } from './types';

/* ------------------------------------------------------------------ */
/* Historial                                                           */
/* ------------------------------------------------------------------ */

export type HistGroup = 'ingreso' | 'gasto' | 'imprevisto' | 'pago';

export interface HistRow {
  id: string;
  date: string;
  group: HistGroup;
  /** Etiqueta del tipo, p. ej. "Entrada", "Pago fijo", "Pago de tarjeta" */
  label: string;
  concept: string;
  category: string;
  accountName: string;
  onCard: boolean;
  /** Positivo = entra, negativo = sale */
  amount: number;
  /** Solo los movimientos capturados a mano son editables desde aquí */
  txId?: string;
}

const TX_LABEL: Record<TxType, string> = { ingreso: 'Entrada', gasto: 'Salida', imprevisto: 'Imprevisto' };

/** Todo lo que pasó entre dos fechas: movimientos capturados + pagos fijos y de tarjeta marcados como pagados. */
export function historyRows(db: DB, start: string, end: string): HistRow[] {
  const rows: HistRow[] = [];
  for (const t of db.txs) {
    if (!inRange(t.date, start, end)) continue;
    const acc = findAccount(db, t.accountId);
    rows.push({
      id: `tx:${t.id}`,
      date: t.date,
      group: t.type,
      label: TX_LABEL[t.type],
      concept: t.concept,
      category: t.category,
      accountName: acc?.name ?? '',
      onCard: isCard(acc),
      amount: t.type === 'ingreso' ? t.amount : -t.amount,
      txId: t.id,
    });
  }
  for (const [key, amount] of Object.entries(db.paid)) {
    const [id, date] = key.split('|');
    if (!date || !inRange(date, start, end)) continue;
    if (id.startsWith('card:')) {
      const card = findAccount(db, id.slice(5));
      if (!card) continue;
      rows.push({
        id: key,
        date,
        group: 'pago',
        label: 'Pago de tarjeta',
        concept: `Pago ${card.name}`,
        category: 'Tarjeta',
        accountName: findAccount(db, card.payFromId)?.name ?? '',
        onCard: false,
        amount: -amount,
      });
    } else {
      const f = db.fixed.find((x) => x.id === id);
      if (!f) continue;
      const inc = f.kind === 'ingreso';
      rows.push({
        id: key,
        date,
        group: inc ? 'ingreso' : 'pago',
        label: inc ? 'Ingreso fijo' : 'Pago fijo',
        concept: f.name,
        category: inc ? 'Fijo' : 'Pago fijo',
        accountName: findAccount(db, f.accountId)?.name ?? '',
        onCard: false,
        amount: inc ? amount : -amount,
      });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function historyTotals(rows: HistRow[]) {
  let entradas = 0;
  let salidas = 0;
  let imprevistos = 0;
  for (const r of rows) {
    if (r.group === 'ingreso') entradas += r.amount;
    else if (r.onCard) continue; // las compras con tarjeta se cuentan al pagar el estado de cuenta
    else if (r.group === 'imprevisto') imprevistos += -r.amount;
    else salidas += -r.amount;
  }
  return { entradas: round2(entradas), salidas: round2(salidas), imprevistos: round2(imprevistos), neto: round2(entradas - salidas - imprevistos) };
}

/* ------------------------------------------------------------------ */
/* CSV (Excel)                                                         */
/* ------------------------------------------------------------------ */

const cell = (v: string | number) => {
  const s = String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV con BOM para que Excel respete los acentos. Montos con signo: + entra, − sale. */
export function toCsv(rows: HistRow[]) {
  const head = ['Fecha', 'Tipo', 'Concepto', 'Categoría', 'Cuenta', 'Con tarjeta', 'Monto'];
  const lines = [head.map(cell).join(',')];
  for (const r of [...rows].sort((a, b) => a.date.localeCompare(b.date))) {
    lines.push([r.date, r.label, r.concept, r.category, r.accountName, r.onCard ? 'Sí' : 'No', r.amount.toFixed(2)].map(cell).join(','));
  }
  return '﻿' + lines.join('\r\n');
}

/* ------------------------------------------------------------------ */
/* Estimación                                                          */
/* ------------------------------------------------------------------ */


/** Gasto que no es fijo ni de tarjeta (lo que sale de débito/efectivo) entre dos fechas. */
function variableSpent(db: DB, from: string, to: string) {
  let t = 0;
  for (const x of db.txs) {
    if (x.type === 'ingreso' || !inRange(x.date, from, to)) continue;
    if (isCard(findAccount(db, x.accountId))) continue;
    t += x.amount;
  }
  return round2(t);
}

export interface ProjItem {
  date: string;
  label: string;
  /** Positivo = entra, negativo = sale */
  amount: number;
  kind: 'ingreso' | 'fijo' | 'tarjeta' | 'programado';
}

/** Fin de una quincena de la estimación: lo que sobra y si se guarda o se asume gastado */
export interface ProjBoundary {
  /** Inicio de la quincena (clave para "guardar este sobrante") */
  key: string;
  /** Último día de esa quincena */
  date: string;
  /** Sobrante positivo al cierre de la quincena (0 si quedó justo o en negativo) */
  amount: number;
  kept: boolean;
}

export interface ProjRow {
  period: Period;
  isCurrent: boolean;
  startBalance: number;
  entradas: number;
  fijos: number;
  tarjetas: number;
  programados: number;
  variable: number;
  /** Sobrante de quincenas que cierran dentro de este periodo y que no se arrastra (se asume gastado) */
  dropped: number;
  /** Quincenas que cierran dentro de este periodo (para decidir si se guarda su sobrante) */
  boundaries: ProjBoundary[];
  neto: number;
  endBalance: number;
  items: ProjItem[];
}

export interface Projection {
  rows: ProjRow[];
  startBalance: number;
  /** Gasto variable estimado por periodo del modo elegido */
  variable: number;
  variableAuto: number;
  variableSamples: number;
  usingOverride: boolean;
  /** true = el sobrante pasa de una quincena a la siguiente */
  carryOver: boolean;
  /** Periodo actual: lo que queda libre sin contar gasto variable restante, y cuánto por día */
  freeNow: number;
  daysLeft: number;
  perDay: number;
  lowest: ProjRow | undefined;
}

/** Cuánto vale el estimado manual (que se da por quincena) en cada tipo de periodo */
const SCALE: Record<Mode, number> = { quincena: 1, mes: 2, semana: 7 / 15 };

interface Flows {
  items: ProjItem[];
  entradas: number;
  fijos: number;
  tarjetas: number;
  programados: number;
}

/** Lo que todavía falta por entrar o salir en un periodo (lo ya marcado como pagado/recibido ya está en el saldo). */
function flowsOf(db: DB, p: Period, today: string): Flows {
  const items: ProjItem[] = [];
  let entradas = 0;
  let fijos = 0;
  let tarjetas = 0;
  let programados = 0;
  for (const o of fixedOccs(db, p.start, p.end)) {
    if (o.onCard || o.paid) continue;
    if (o.fixed.kind === 'ingreso') {
      entradas += o.amount;
      items.push({ date: o.date, label: o.fixed.name, amount: o.amount, kind: 'ingreso' });
    } else {
      fijos += o.amount;
      items.push({ date: o.date, label: o.fixed.name, amount: -o.amount, kind: 'fijo' });
    }
  }
  for (const c of cardPayments(db, p.start, p.end)) {
    if (c.paid) continue;
    tarjetas += c.amount;
    items.push({ date: c.due, label: `Tarjeta ${c.account.name}`, amount: -c.amount, kind: 'tarjeta' });
  }
  for (const t of db.txs) {
    if (t.date <= today || !inRange(t.date, p.start, p.end)) continue;
    if (isCard(findAccount(db, t.accountId))) continue;
    const amt = t.type === 'ingreso' ? t.amount : -t.amount;
    programados += amt;
    items.push({ date: t.date, label: `${t.concept} (programado)`, amount: amt, kind: 'programado' });
  }
  return { items: items.sort((a, b) => a.date.localeCompare(b.date)), entradas, fijos, tarjetas, programados };
}

export function projection(db: DB, mode: Mode, today: string, count: number): Projection {
  const startBalance = round2(db.accounts.filter((a) => !isCard(a)).reduce((s, a) => s + accountBalance(db, a, today), 0));
  const cycle = cycleOf(db);
  const cur = periodFor(mode, today, cycle);

  // Promedio de gasto variable en los últimos periodos completos con datos
  const dates = db.txs.map((t) => t.date).sort();
  const earliest = dates[0];
  const samples: number[] = [];
  let back = cur;
  for (let i = 0; i < 3; i++) {
    back = shiftPeriod(back, -1, cycle);
    if (earliest && earliest <= back.start) samples.push(variableSpent(db, back.start, back.end));
  }
  const variableAuto = samples.length ? round2(samples.reduce((s, x) => s + x, 0) / samples.length) : 0;
  const manual = db.settings?.variableEstimate;
  const variable = manual !== undefined ? round2(manual * SCALE[mode]) : variableAuto;

  const displayPeriods: Period[] = [];
  for (let p = cur, i = 0; i < count; i++, p = shiftPeriod(p, 1, cycle)) displayPeriods.push(p);
  const lastEnd = displayPeriods.length ? displayPeriods[displayPeriods.length - 1].end : cur.end;

  // Motor por quincena: ahí se decide si el sobrante pasa a la siguiente o se asume gastado
  // (un sobrante negativo siempre se arrastra: el faltante no desaparece).
  const carryOver = !!db.settings?.carryOver;
  const keep = new Set(db.settings?.keepPeriods ?? []);
  const variableQ = variable / SCALE[mode];
  const boundaries: ProjBoundary[] = [];
  {
    let q = periodFor('quincena', today, cycle);
    let bal = startBalance;
    let first = true;
    while (q.start <= lastEnd) {
      const f = flowsOf(db, q, today);
      const v = first ? Math.max(0, variableQ - variableSpent(db, q.start, today)) : variableQ;
      const left = round2(bal + f.entradas - f.fijos - f.tarjetas + f.programados - v);
      const kept = carryOver || keep.has(q.start);
      const amount = Math.max(0, left);
      boundaries.push({ key: q.start, date: q.end, amount, kept });
      bal = kept ? left : Math.min(0, left);
      first = false;
      q = shiftPeriod(q, 1, cycle);
    }
  }

  const rows: ProjRow[] = [];
  let balance = startBalance;
  displayPeriods.forEach((p, i) => {
    const isCurrent = i === 0;
    const f = flowsOf(db, p, today);
    const spentSoFar = isCurrent ? variableSpent(db, p.start, today) : 0;
    const v = isCurrent ? Math.max(0, round2(variable - spentSoFar)) : variable;
    const inside = boundaries.filter((b) => b.date >= p.start && b.date <= p.end && b.date >= today);
    const dropped = round2(inside.filter((b) => !b.kept).reduce((s, b) => s + b.amount, 0));
    const neto = round2(f.entradas - f.fijos - f.tarjetas + f.programados - v);
    const end = round2(balance + neto - dropped);
    rows.push({
      period: p,
      isCurrent,
      startBalance: round2(balance),
      entradas: round2(f.entradas),
      fijos: round2(f.fijos),
      tarjetas: round2(f.tarjetas),
      programados: round2(f.programados),
      variable: v,
      dropped,
      boundaries: inside,
      neto,
      endBalance: end,
      items: f.items,
    });
    balance = end;
  });

  const first = rows[0];
  const freeNow = first ? round2(first.endBalance + first.dropped + first.variable) : startBalance;
  const daysLeft = Math.max(1, daysBetween(today, cur.end) + 1);
  const lowest = rows.reduce<ProjRow | undefined>((m, r) => (!m || r.endBalance < m.endBalance ? r : m), undefined);
  return {
    rows,
    startBalance,
    variable,
    variableAuto,
    variableSamples: samples.length,
    usingOverride: manual !== undefined,
    carryOver,
    freeNow,
    daysLeft,
    perDay: freeNow > 0 ? round2(freeNow / daysLeft) : 0,
    lowest,
  };
}
