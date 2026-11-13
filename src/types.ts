export type TxType = 'ingreso' | 'gasto' | 'imprevisto';
export type AccountKind = 'debito' | 'efectivo' | 'credito';
export type Freq = 'mensual' | 'quincenal' | 'semanal';

export interface Account {
  id: string;
  name: string;
  kind: AccountKind;
  color: string;
  /** Débito / efectivo: saldo con el que empiezas a usar la app */
  initialBalance?: number;
  /** Crédito: límite de crédito */
  creditLimit?: number;
  /** Crédito: día del mes en que corta (1-31) */
  cutDay?: number;
  /** Crédito: día del mes de la fecha límite de pago (1-31) */
  dueDay?: number;
  /** Crédito: cuenta de débito desde la que normalmente pagas la tarjeta */
  payFromId?: string;
}

export interface Tx {
  id: string;
  type: TxType;
  amount: number;
  concept: string;
  category: string;
  /** YYYY-MM-DD */
  date: string;
  accountId?: string;
}

export interface Fixed {
  id: string;
  name: string;
  amount: number;
  kind: 'gasto' | 'ingreso';
  freq: Freq;
  /** mensual: día del mes */
  day?: number;
  /** quincenal: un día en cada quincena, p.ej. [13, 30] */
  days?: [number, number];
  /** semanal: 0 = lunes … 6 = domingo */
  weekday?: number;
  accountId?: string;
  category?: string;
  /** No se generan ocurrencias antes de esta fecha */
  startDate: string;
}

/**
 * Cargo programado a una tarjeta: compras a meses (MSI / diferidos) o un
 * saldo que ya traías de un estado de cuenta anterior (1 mes).
 * Se suma al pago de cada estado de cuenta cuya fecha límite cae en el mes
 * correspondiente.
 */
export interface Plan {
  id: string;
  accountId: string;
  name: string;
  monthlyAmount: number;
  months: number;
  /** Fecha del primer pago (solo importa el mes) YYYY-MM-DD */
  firstDue: string;
}

export interface DB {
  accounts: Account[];
  txs: Tx[];
  fixed: Fixed[];
  plans: Plan[];
  /** clave de ocurrencia → monto con el que se marcó como pagado/recibido */
  paid: Record<string, number>;
}

export type Mode = 'quincena' | 'semana' | 'mes';

export interface Period {
  mode: Mode;
  start: string;
  end: string;
  label: string;
  sub: string;
}
