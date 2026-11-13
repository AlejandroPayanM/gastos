export function money(n: number, opts?: { sign?: boolean }) {
  const neg = n < 0;
  const abs = Math.abs(Math.round(n * 100) / 100);
  const [i, f] = abs.toFixed(2).split('.');
  const w = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const s = `$${w}${f === '00' ? '' : '.' + f}`;
  if (neg) return `-${s}`;
  return opts?.sign && n > 0 ? `+${s}` : s;
}

/** Acepta "1,234.50", "1234.5", "$ 1 234" … y devuelve NaN si no es un número */
export function parseAmount(s: string) {
  const clean = s.replace(/[^0-9.\-]/g, '');
  if (!clean) return NaN;
  return Number(clean);
}

export const round2 = (n: number) => Math.round(n * 100) / 100;
