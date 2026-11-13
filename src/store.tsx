import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Account, DB, Fixed, Plan, Tx } from './types';

const KEY = 'gastos.db.v1';

const DEFAULT_DB: DB = {
  accounts: [{ id: 'debito-1', name: 'Débito', kind: 'debito', color: '#0F766E', initialBalance: 0 }],
  txs: [],
  fixed: [],
  plans: [],
  paid: {},
  overrides: {},
  settings: {},
};

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

interface Store {
  db: DB;
  ready: boolean;
  saveTx: (t: Tx) => void;
  deleteTx: (id: string) => void;
  saveFixed: (f: Fixed) => void;
  deleteFixed: (id: string) => void;
  saveAccount: (a: Account) => void;
  deleteAccount: (id: string) => void;
  savePlan: (p: Plan) => void;
  deletePlan: (id: string) => void;
  /** Marca/desmarca como pagado (o recibido). `amount` es el monto que se registra. */
  togglePaid: (key: string, amount: number) => void;
  /** Reemplaza todos los datos (restaurar respaldo). Devuelve un error si el texto no es válido. */
  restore: (json: string) => string | null;
  /** Ajusta el monto de una ocurrencia (null = volver al monto original). Si ya estaba pagada, actualiza lo pagado. */
  setOverride: (key: string, amount: number | null) => void;
  /** Estimado propio de gasto variable por quincena (undefined = usar el promedio). */
  setVariableEstimate: (amount: number | undefined) => void;
  /** Cambia preferencias de la estimación (arrastrar sobrante, quincenas donde sí se guarda). */
  updateSettings: (patch: Partial<DB['settings']>) => void;
  /** Reemplaza todos los datos locales (lo usa la sincronización con la nube). */
  replaceDb: (db: DB) => void;
}

const Ctx = createContext<Store | null>(null);

const upsert = <T extends { id: string }>(list: T[], item: T) =>
  list.some((x) => x.id === item.id) ? list.map((x) => (x.id === item.id ? item : x)) : [...list, item];

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [db, setDb] = useState<DB>(DEFAULT_DB);
  const [ready, setReady] = useState(false);
  const loaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(KEY);
        if (raw) setDb({ ...DEFAULT_DB, ...JSON.parse(raw) });
      } catch {
        // si falla la lectura arrancamos con datos vacíos
      }
      loaded.current = true;
      setReady(true);
    })();
  }, []);

  useEffect(() => {
    if (!loaded.current) return;
    AsyncStorage.setItem(KEY, JSON.stringify(db)).catch(() => {});
  }, [db]);

  const saveTx = useCallback((t: Tx) => setDb((d) => ({ ...d, txs: upsert(d.txs, t) })), []);
  const deleteTx = useCallback((id: string) => setDb((d) => ({ ...d, txs: d.txs.filter((x) => x.id !== id) })), []);
  const saveFixed = useCallback((f: Fixed) => setDb((d) => ({ ...d, fixed: upsert(d.fixed, f) })), []);
  const deleteFixed = useCallback((id: string) => setDb((d) => ({ ...d, fixed: d.fixed.filter((x) => x.id !== id) })), []);
  const saveAccount = useCallback((a: Account) => setDb((d) => ({ ...d, accounts: upsert(d.accounts, a) })), []);
  const deleteAccount = useCallback(
    (id: string) =>
      setDb((d) => ({
        ...d,
        accounts: d.accounts.filter((a) => a.id !== id).map((a) => (a.payFromId === id ? { ...a, payFromId: undefined } : a)),
        txs: d.txs.map((t) => (t.accountId === id ? { ...t, accountId: undefined } : t)),
        fixed: d.fixed.map((f) => (f.accountId === id ? { ...f, accountId: undefined } : f)),
        plans: d.plans.filter((p) => p.accountId !== id),
      })),
    [],
  );
  const savePlan = useCallback((p: Plan) => setDb((d) => ({ ...d, plans: upsert(d.plans, p) })), []);
  const deletePlan = useCallback((id: string) => setDb((d) => ({ ...d, plans: d.plans.filter((x) => x.id !== id) })), []);
  const togglePaid = useCallback(
    (key: string, amount: number) =>
      setDb((d) => {
        const paid = { ...d.paid };
        if (key in paid) delete paid[key];
        else paid[key] = amount;
        return { ...d, paid };
      }),
    [],
  );

  const setOverride = useCallback(
    (key: string, amount: number | null) =>
      setDb((d) => {
        const overrides = { ...d.overrides };
        const paid = { ...d.paid };
        if (amount === null) delete overrides[key];
        else {
          overrides[key] = amount;
          if (key in paid) paid[key] = amount;
        }
        return { ...d, overrides, paid };
      }),
    [],
  );
  const setVariableEstimate = useCallback((amount: number | undefined) => setDb((d) => ({ ...d, settings: { ...d.settings, variableEstimate: amount } })), []);

  const updateSettings = useCallback((patch: Partial<DB['settings']>) => setDb((d) => ({ ...d, settings: { ...d.settings, ...patch } })), []);

  const replaceDb = useCallback((next: DB) => setDb(next), []);

  const restore = useCallback((json: string) => {
    let data: any;
    try {
      data = JSON.parse(json.trim());
    } catch {
      return 'El texto no es un respaldo válido.';
    }
    if (data?.app === 'mis-gastos' && data.db) data = data.db;
    const ok = data && ['accounts', 'txs', 'fixed', 'plans'].every((k) => Array.isArray(data[k])) && data.paid && typeof data.paid === 'object';
    if (!ok || data.accounts.length === 0) return 'El respaldo está incompleto o no es de esta app.';
    setDb({ accounts: data.accounts, txs: data.txs, fixed: data.fixed, plans: data.plans, paid: data.paid, overrides: data.overrides ?? {}, settings: data.settings ?? {} });
    return null;
  }, []);

  const value = useMemo(
    () => ({ db, ready, saveTx, deleteTx, saveFixed, deleteFixed, saveAccount, deleteAccount, savePlan, deletePlan, togglePaid, restore, setOverride, setVariableEstimate, updateSettings, replaceDb }),
    [db, ready, saveTx, deleteTx, saveFixed, deleteFixed, saveAccount, deleteAccount, savePlan, deletePlan, togglePaid, restore, setOverride, setVariableEstimate, updateSettings, replaceDb],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error('useStore fuera de StoreProvider');
  return s;
}
