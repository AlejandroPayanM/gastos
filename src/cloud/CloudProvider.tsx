import AsyncStorage from '@react-native-async-storage/async-storage';
import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';
import { useStore } from '../store';
import type { DB } from '../types';
import { cloudConfigured, supabase } from './client';
import { SyncEngine, type ConflictChoice, type SyncMeta, type SyncState } from './engine';
import { supabaseApi } from './supabaseApi';

const META_KEY = 'gastos.sync.meta.v1';

export interface Cloud {
  /** La app se compiló con los datos de Supabase */
  enabled: boolean;
  /** Ya se revisó si hay una sesión guardada */
  checked: boolean;
  email?: string;
  state: SyncState;
  /** Llegó por el enlace de "olvidé mi contraseña" */
  recovery: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signUp: (email: string, password: string) => Promise<{ error?: string; confirm?: boolean }>;
  signOut: () => Promise<void>;
  syncNow: () => void;
  resolveConflict: (choice: ConflictChoice) => void;
  resetPassword: (email: string) => Promise<string | null>;
  updatePassword: (password: string) => Promise<string | null>;
}

const Ctx = createContext<Cloud | null>(null);

const MESSAGES: [RegExp, string][] = [
  [/invalid login credentials/i, 'Correo o contraseña incorrectos.'],
  [/already registered|already been registered/i, 'Ese correo ya tiene cuenta. Usa "Entrar".'],
  [/at least \d+ characters/i, 'La contraseña debe tener al menos 6 caracteres.'],
  [/email not confirmed/i, 'Primero confirma tu correo (revisa tu bandeja de entrada y el spam).'],
  [/invalid email|unable to validate email/i, 'Ese correo no es válido.'],
  [/rate limit|too many/i, 'Demasiados intentos. Espera unos minutos e intenta de nuevo.'],
  [/failed to fetch|network|fetch failed/i, 'Sin conexión. Revisa tu internet.'],
  [/same password|different from the old/i, 'La nueva contraseña debe ser distinta a la anterior.'],
];
const translate = (msg: string) => MESSAGES.find(([re]) => re.test(msg))?.[1] ?? msg;

const webOrigin = () => (Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.origin : undefined);

export function CloudProvider({ children }: { children: React.ReactNode }) {
  const { db, ready, replaceDb } = useStore();
  const [session, setSession] = useState<Session | null>(null);
  const [checked, setChecked] = useState(!supabase);
  const [state, setState] = useState<SyncState>({ status: 'idle' });
  const [recovery, setRecovery] = useState(false);

  const dbRef = useRef<DB>(db);
  dbRef.current = db;
  const engineRef = useRef<SyncEngine | null>(null);
  const applying = useRef(false);
  const baseline = useRef<DB | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /* ---- sesión ---- */
  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecked(true);
    });
    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  /* ---- motor de sincronización (uno por usuario con sesión) ---- */
  const uid = session?.user.id;
  useEffect(() => {
    if (!supabase || !uid || !ready) {
      engineRef.current = null;
      if (!uid) setState({ status: 'idle' });
      return;
    }
    let cancelled = false;
    (async () => {
      let meta: (SyncMeta & { userId?: string }) | undefined;
      try {
        const raw = await AsyncStorage.getItem(META_KEY);
        const parsed = raw ? JSON.parse(raw) : undefined;
        if (parsed?.userId === uid) meta = parsed;
      } catch {
        // sin datos previos
      }
      if (cancelled) return;
      const engine = new SyncEngine(
        supabaseApi(supabase as NonNullable<typeof supabase>, uid),
        {
          getDb: () => dbRef.current,
          applyDb: (d) => {
            dbRef.current = d;
            applying.current = true;
            replaceDb(d);
          },
          onState: setState,
          saveMeta: (m) => {
            AsyncStorage.setItem(META_KEY, JSON.stringify({ ...m, userId: uid })).catch(() => {});
          },
        },
        meta,
      );
      engineRef.current = engine;
      engine.start();
    })();
    return () => {
      cancelled = true;
      engineRef.current = null;
    };
  }, [uid, ready, replaceDb]);

  /* ---- cambios locales: se marcan pendientes y se suben con una pequeña espera ---- */
  const schedule = useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      engineRef.current?.sync();
    }, 1500);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (baseline.current === null) {
      baseline.current = db; // la carga inicial no cuenta como cambio
      return;
    }
    if (db === baseline.current) return;
    baseline.current = db;
    if (applying.current) {
      applying.current = false; // vino de la nube: no hay nada que subir
      return;
    }
    const engine = engineRef.current;
    if (engine) {
      engine.markDirty();
      schedule();
    } else {
      // Cambio hecho sin sesión: se recuerda para subirlo cuando vuelvas a entrar
      AsyncStorage.getItem(META_KEY)
        .then((raw) => {
          if (raw) AsyncStorage.setItem(META_KEY, JSON.stringify({ ...JSON.parse(raw), dirty: true }));
        })
        .catch(() => {});
    }
  }, [db, ready, schedule]);

  /* ---- reintentar si falló, y revisar la nube al volver a la app o recuperar internet ---- */
  useEffect(() => {
    if (state.status !== 'error' || !engineRef.current) return;
    const t = setTimeout(() => engineRef.current?.sync(), 30000);
    return () => clearTimeout(t);
  }, [state]);

  useEffect(() => {
    if (!supabase) return;
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') engineRef.current?.sync();
    });
    const online = () => engineRef.current?.sync();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.addEventListener('online', online);
    return () => {
      sub.remove();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.removeEventListener('online', online);
    };
  }, []);

  /* ---- acciones ---- */
  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'La nube no está configurada.';
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    return error ? translate(error.message) : null;
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) return { error: 'La nube no está configurada.' };
    const { data, error } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: webOrigin() } });
    if (error) return { error: translate(error.message) };
    // Sin sesión = Supabase pide confirmar el correo antes de entrar
    return data.session ? {} : { confirm: true };
  }, []);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    try {
      await engineRef.current?.sync(); // sube lo pendiente antes de salir (si hay internet)
    } catch {
      // no bloquea cerrar sesión
    }
    await supabase.auth.signOut();
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    if (!supabase) return 'La nube no está configurada.';
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: webOrigin() });
    return error ? translate(error.message) : null;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) return 'La nube no está configurada.';
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return translate(error.message);
    setRecovery(false);
    return null;
  }, []);

  const value = useMemo<Cloud>(
    () => ({
      enabled: cloudConfigured,
      checked,
      email: session?.user.email ?? undefined,
      state,
      recovery,
      signIn,
      signUp,
      signOut,
      syncNow: () => {
        engineRef.current?.sync();
      },
      resolveConflict: (choice) => {
        engineRef.current?.resolve(choice);
      },
      resetPassword,
      updatePassword,
    }),
    [checked, session, state, recovery, signIn, signUp, signOut, resetPassword, updatePassword],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useCloud() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCloud fuera de CloudProvider');
  return c;
}
