import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { periodFor, shiftPeriod, todayStr } from './src/dates';
import { TxForm } from './src/forms';
import { Cuentas } from './src/screens/Cuentas';
import { Estimacion } from './src/screens/Estimacion';
import { Fijos } from './src/screens/Fijos';
import { Historial } from './src/screens/Historial';
import { Movimientos } from './src/screens/Movimientos';
import { Resumen } from './src/screens/Resumen';
import { StoreProvider, useStore } from './src/store';
import { C } from './src/theme';
import type { Mode, Period } from './src/types';
import { Segmented } from './src/ui';

// En la versión web gratuita de Netlify aparece una insignia flotante abajo; se sube el menú para que no lo tape.
const WEB_LIFT = Platform.OS === 'web' ? 56 : 0;

type Tab ='resumen' | 'movimientos' | 'historial' | 'estimacion' | 'fijos' | 'cuentas';

const TABS: { key: Tab; icon: string; label: string; title: string }[] = [
  { key: 'resumen', icon: '📊', label: 'Resumen', title: 'Resumen' },
  { key: 'movimientos', icon: '🧾', label: 'Movs.', title: 'Movimientos' },
  { key: 'historial', icon: '🗂️', label: 'Historial', title: 'Historial' },
  { key: 'estimacion', icon: '🔮', label: 'Estimación', title: 'Estimación' },
  { key: 'fijos', icon: '🔁', label: 'Fijos', title: 'Pagos fijos' },
  { key: 'cuentas', icon: '💳', label: 'Cuentas', title: 'Cuentas' },
];

function Shell() {
  const { ready } = useStore();
  const [tab, setTab] = useState<Tab>('resumen');
  const [mode, setMode] = useState<Mode>('quincena');
  const [period, setPeriod] = useState<Period>(() => periodFor('quincena', todayStr()));
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    // En la versión web pide al navegador que no borre los datos guardados.
    try {
      (globalThis as any).navigator?.storage?.persist?.();
    } catch {
      // no pasa nada si no está disponible
    }
  }, []);

  const changeMode = (m: Mode) => {
    setMode(m);
    setPeriod(periodFor(m, todayStr()));
  };

  if (!ready) return <View style={{ flex: 1, backgroundColor: C.bg }} />;

  const showPeriod = tab === 'resumen' || tab === 'movimientos';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: C.bg }} edges={['top', 'bottom']}>
      <StatusBar style="dark" />
      <View style={st.container}>
        <View style={st.header}>
          <Text style={st.title}>{TABS.find((t) => t.key === tab)?.title}</Text>
          {showPeriod ? (
            <>
              <Segmented
                value={mode}
                onChange={changeMode}
                options={[
                  { value: 'quincena', label: 'Quincena' },
                  { value: 'semana', label: 'Semana' },
                  { value: 'mes', label: 'Mes' },
                ]}
              />
              <View style={st.nav}>
                <Pressable style={st.arrow} onPress={() => setPeriod((p) => shiftPeriod(p, -1))} hitSlop={8}>
                  <Text style={st.arrowText}>‹</Text>
                </Pressable>
                <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setPeriod(periodFor(mode, todayStr()))}>
                  <Text style={st.periodLabel}>{period.label}</Text>
                  <Text style={st.periodSub}>{period.sub}</Text>
                </Pressable>
                <Pressable style={st.arrow} onPress={() => setPeriod((p) => shiftPeriod(p, 1))} hitSlop={8}>
                  <Text style={st.arrowText}>›</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </View>

        <View style={{ flex: 1 }}>
          {tab === 'resumen' && <Resumen period={period} />}
          {tab === 'movimientos' && <Movimientos period={period} />}
          {tab === 'historial' && <Historial />}
          {tab === 'estimacion' && <Estimacion />}
          {tab === 'fijos' && <Fijos />}
          {tab === 'cuentas' && <Cuentas />}
        </View>

        <Pressable style={[st.fab, { bottom: 80 + WEB_LIFT }]} onPress={() => setAdding(true)}>
          <Text style={st.fabText}>＋</Text>
        </Pressable>

        <View style={[st.tabbar, { marginBottom: WEB_LIFT }]}>
          {TABS.map((t) => (
            <Pressable key={t.key} style={st.tab} onPress={() => setTab(t.key)}>
              <Text style={{ fontSize: 18, opacity: tab === t.key ? 1 : 0.45 }}>{t.icon}</Text>
              <Text style={[st.tabLabel, tab === t.key && { color: C.primary }]}>{t.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>
      <TxForm visible={adding} onClose={() => setAdding(false)} />
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Shell />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

const st = StyleSheet.create({
  container: { flex: 1, width: '100%', maxWidth: 640, alignSelf: 'center' },
  header: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8, gap: 10 },
  title: { fontSize: 26, fontWeight: '800', color: C.text },
  nav: { flexDirection: 'row', alignItems: 'center' },
  arrow: { width: 44, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.line },
  arrowText: { fontSize: 24, color: C.primary, fontWeight: '700', marginTop: -2 },
  periodLabel: { fontSize: 16, fontWeight: '800', color: C.text },
  periodSub: { fontSize: 12, color: C.muted },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 80,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
  },
  fabText: { color: '#fff', fontSize: 28, marginTop: -2 },
  tabbar: { flexDirection: 'row', backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: C.line, paddingVertical: 6 },
  tab: { flex: 1, alignItems: 'center', gap: 2, paddingVertical: 4 },
  tabLabel: { fontSize: 10, fontWeight: '700', color: C.muted },
});
