import type { TxType } from './types';

export const C = {
  bg: '#F3F5F4',
  card: '#FFFFFF',
  text: '#0F1B18',
  muted: '#6B7A76',
  line: '#E3E8E6',
  primary: '#0F766E',
  primarySoft: '#D9F0EC',
  ingreso: '#15803D',
  gasto: '#DC2626',
  imprevisto: '#D97706',
  tarjeta: '#6D28D9',
  danger: '#B91C1C',
};

export const typeColor: Record<TxType, string> = {
  ingreso: C.ingreso,
  gasto: C.gasto,
  imprevisto: C.imprevisto,
};

export const typeLabel: Record<TxType, string> = {
  ingreso: 'Entrada',
  gasto: 'Salida',
  imprevisto: 'Imprevisto',
};

export const CATEGORIAS: Record<TxType, string[]> = {
  ingreso: ['Sueldo', 'Cundina', 'Extra', 'Venta', 'Otros'],
  gasto: ['Comida', 'Transporte', 'Gasolina', 'Hogar', 'Servicios', 'Salud', 'Ocio', 'Ropa', 'Regalos', 'Ahorro', 'Otros'],
  imprevisto: ['Auto', 'Salud', 'Hogar', 'Trabajo', 'Otros'],
};

export const ACCOUNT_COLORS = ['#0F766E', '#2563EB', '#6D28D9', '#DB2777', '#EA580C', '#4B5563'];
