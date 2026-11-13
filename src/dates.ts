import type { Mode, Period, WeekendRule } from './types';

export const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];
export const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DIAS_SEMANA = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
export const DIAS_CORTO = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

export const pad = (n: number) => String(n).padStart(2, '0');
export const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

export function parse(s: string) {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

export const daysInMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const clampDay = (y: number, m: number, d: number) => Math.max(1, Math.min(d, daysInMonth(y, m)));

export function todayStr() {
  const n = new Date();
  return ymd(n.getFullYear(), n.getMonth() + 1, n.getDate());
}

export function addDays(s: string, n: number) {
  const { y, m, d } = parse(s);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

export function addMonths(y: number, m: number, n: number) {
  const t = m - 1 + n;
  return { y: y + Math.floor(t / 12), m: (((t % 12) + 12) % 12) + 1 };
}

/** Días que hay de `a` a `b` (negativo si `b` es anterior). */
export function daysBetween(a: string, b: string) {
  const pa = parse(a);
  const pb = parse(b);
  return Math.round((Date.UTC(pb.y, pb.m - 1, pb.d) - Date.UTC(pa.y, pa.m - 1, pa.d)) / 86400000);
}

/** 0 = lunes … 6 = domingo */
export function weekdayMon(s: string) {
  const { y, m, d } = parse(s);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

export const monthIndex = (s: string) => {
  const { y, m } = parse(s);
  return y * 12 + (m - 1);
};

export function isValidDate(s: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const { y, m, d } = parse(s);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function formatDay(s: string) {
  const { m, d } = parse(s);
  return `${d} ${MESES_CORTO[m - 1]}`;
}

export function formatLong(s: string) {
  const { y, m, d } = parse(s);
  return `${DIAS_CORTO[weekdayMon(s)]} ${d} ${MESES_CORTO[m - 1]} ${y}`;
}

/** Mueve sábado/domingo al viernes anterior o al lunes siguiente, según la regla. */
export function shiftWeekend(date: string, rule: WeekendRule) {
  if (rule === 'igual') return date;
  const w = weekdayMon(date); // 0 = lunes … 5 = sábado, 6 = domingo
  if (w < 5) return date;
  return rule === 'viernes' ? addDays(date, -(w - 4)) : addDays(date, 7 - w);
}

/**
 * Quincena "de paga a paga": empieza el día que cobras y termina el día antes de la siguiente paga.
 * `days` son los días nominales de cobro (p. ej. 15 y 31) y `rule` qué pasa si caen en fin de semana.
 */
export interface Cycle {
  days: number[];
  rule: WeekendRule;
}

/** Fechas de cobro (ya ajustadas por fin de semana) entre dos meses antes y después de `s`. */
export function paydays(cycle: Cycle, s: string): string[] {
  const { y, m } = parse(s);
  const out = new Set<string>();
  for (let k = -2; k <= 2; k++) {
    const t = addMonths(y, m, k);
    for (const dd of cycle.days) out.add(shiftWeekend(ymd(t.y, t.m, clampDay(t.y, t.m, dd)), cycle.rule));
  }
  return [...out].sort();
}

export function periodFor(mode: Mode, s: string, cycle?: Cycle): Period {
  if (mode === 'quincena' && cycle && cycle.days.length > 0) {
    const days = paydays(cycle, s);
    let start = days[0];
    for (const d of days) if (d <= s) start = d;
    const next = days.find((d) => d > s) ?? addDays(start, 15);
    const end = addDays(next, -1);
    return { mode, start, end, label: `Quincena del ${formatDay(start)} al ${formatDay(end)}`, sub: `Cobras el ${formatDay(start)} · próxima paga el ${formatDay(next)}` };
  }
  const { y, m, d } = parse(s);
  const dim = daysInMonth(y, m);
  if (mode === 'mes') {
    return { mode, start: ymd(y, m, 1), end: ymd(y, m, dim), label: `${MESES[m - 1]} ${y}`, sub: `1 – ${dim} ${MESES_CORTO[m - 1]}` };
  }
  if (mode === 'quincena') {
    const first = d <= 15;
    return {
      mode,
      start: ymd(y, m, first ? 1 : 16),
      end: ymd(y, m, first ? 15 : dim),
      label: `${first ? '1ª' : '2ª'} quincena de ${MESES[m - 1]}`,
      sub: `${first ? '1 – 15' : `16 – ${dim}`} ${MESES_CORTO[m - 1]} ${y}`,
    };
  }
  const start = addDays(s, -weekdayMon(s));
  const end = addDays(start, 6);
  return { mode, start, end, label: 'Semana', sub: `${formatDay(start)} – ${formatDay(end)} ${parse(end).y}` };
}

export function shiftPeriod(p: Period, dir: 1 | -1, cycle?: Cycle): Period {
  if (p.mode === 'quincena' && cycle && cycle.days.length > 0) {
    return periodFor('quincena', dir > 0 ? addDays(p.end, 1) : addDays(p.start, -1), cycle);
  }
  const { y, m, d } = parse(p.start);
  if (p.mode === 'mes') {
    const n = addMonths(y, m, dir);
    return periodFor('mes', ymd(n.y, n.m, 1));
  }
  if (p.mode === 'quincena') {
    const first = d === 1;
    if (dir > 0) {
      if (first) return periodFor('quincena', ymd(y, m, 16));
      const n = addMonths(y, m, 1);
      return periodFor('quincena', ymd(n.y, n.m, 1));
    }
    if (!first) return periodFor('quincena', ymd(y, m, 1));
    const n = addMonths(y, m, -1);
    return periodFor('quincena', ymd(n.y, n.m, 16));
  }
  return periodFor('semana', addDays(p.start, 7 * dir));
}

export const inRange = (date: string, start: string, end: string) => date >= start && date <= end;
