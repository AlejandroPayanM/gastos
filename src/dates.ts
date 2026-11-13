import type { Mode, Period } from './types';

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

export function periodFor(mode: Mode, s: string): Period {
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

export function shiftPeriod(p: Period, dir: 1 | -1): Period {
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
