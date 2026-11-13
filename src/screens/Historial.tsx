import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { addMonths, formatLong, pad, parse, periodFor, todayStr, ymd } from '../dates';
import { exportCsv } from '../exportFile';
import { TxForm } from '../forms';
import { historyRows, historyTotals, toCsv, type HistGroup } from '../insights';
import { money } from '../money';
import { useStore } from '../store';
import { C, typeColor } from '../theme';
import type { Tx } from '../types';
import { Button, Card, Chips, Empty, Row, s } from '../ui';

type Filter = 'todos' | HistGroup;
const groupColor: Record<HistGroup, string> = { ingreso: typeColor.ingreso, gasto: typeColor.gasto, imprevisto: typeColor.imprevisto, pago: C.tarjeta };

export function Historial() {
  const { db } = useStore();
  const now = parse(todayStr());
  const [ym, setYm] = useState<{ y: number; m: number } | 'todo'>({ y: now.y, m: now.m });
  const [filter, setFilter] = useState<Filter>('todos');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<Tx | undefined>();
  const [msg, setMsg] = useState('');

  const range = useMemo(() => {
    if (ym === 'todo') return { start: '0000-01-01', end: '9999-12-31', label: 'Todo el historial' };
    const p = periodFor('mes', ymd(ym.y, ym.m, 1));
    return { start: p.start, end: p.end, label: p.label };
  }, [ym]);

  const all = useMemo(() => historyRows(db, range.start, range.end), [db, range]);
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return all.filter((r) => (filter === 'todos' || r.group === filter) && (!q || `${r.concept} ${r.category} ${r.accountName} ${r.label}`.toLowerCase().includes(q)));
  }, [all, filter, query]);
  const totals = useMemo(() => historyTotals(rows), [rows]);

  const groups = useMemo(() => {
    const byDay = new Map<string, typeof rows>();
    for (const r of rows) byDay.set(r.date, [...(byDay.get(r.date) ?? []), r]);
    return [...byDay.entries()];
  }, [rows]);

  const step = (dir: 1 | -1) => {
    if (ym === 'todo') return;
    setYm(addMonths(ym.y, ym.m, dir));
  };

  const doExport = async (everything: boolean) => {
    const data = everything ? historyRows(db, '0000-01-01', '9999-12-31') : rows;
    if (data.length === 0) return setMsg('No hay movimientos para exportar.');
    const name = everything || ym === 'todo' ? `historial-${todayStr()}.csv` : `historial-${ym.y}-${pad(ym.m)}.csv`;
    try {
      const r = await exportCsv(name, toCsv(data));
      setMsg(r);
    } catch {
      setMsg('No se pudo exportar.');
    }
  };

  const edit = (txId?: string) => {
    if (!txId) return;
    setEditing(db.txs.find((t) => t.id === txId));
  };

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Pressable style={nav.arrow} onPress={() => step(-1)} hitSlop={8}>
            <Text style={nav.arrowText}>‹</Text>
          </Pressable>
          <Pressable style={{ flex: 1, alignItems: 'center' }} onPress={() => setYm(ym === 'todo' ? { y: now.y, m: now.m } : 'todo')}>
            <Text style={{ fontSize: 16, fontWeight: '800', color: C.text }}>{range.label}</Text>
            <Text style={{ fontSize: 12, color: C.primary }}>{ym === 'todo' ? 'Toca para ver por mes' : 'Toca para ver todo'}</Text>
          </Pressable>
          <Pressable style={nav.arrow} onPress={() => step(1)} hitSlop={8}>
            <Text style={nav.arrowText}>›</Text>
          </Pressable>
        </View>

        <TextInput value={query} onChangeText={setQuery} placeholder="Buscar por concepto, categoría o cuenta" placeholderTextColor="#9AA7A3" style={[s.input, { marginBottom: 10 }]} />
        <View style={{ marginBottom: 12 }}>
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'ingreso', label: 'Entradas', color: C.ingreso },
              { value: 'gasto', label: 'Salidas', color: C.gasto },
              { value: 'imprevisto', label: 'Imprevistos', color: C.imprevisto },
              { value: 'pago', label: 'Pagos', color: C.tarjeta },
            ]}
          />
        </View>

        <Card>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Total label="Entradas" value={totals.entradas} color={C.ingreso} />
            <Total label="Salidas" value={totals.salidas} color={C.gasto} />
            <Total label="Imprevistos" value={totals.imprevistos} color={C.imprevisto} />
          </View>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
            <Text style={{ fontWeight: '700', color: C.text }}>Neto</Text>
            <Text style={{ fontWeight: '800', color: totals.neto < 0 ? C.danger : C.text }}>{money(totals.neto)}</Text>
          </View>
          <Text style={{ fontSize: 11, color: C.muted, marginTop: 6 }}>
            Incluye pagos fijos y de tarjeta marcados como pagados. Las compras con tarjeta se cuentan cuando pagas el estado de cuenta.
          </Text>
        </Card>

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 6 }}>
          <Button small kind="ghost" label="Exportar lo que se ve (Excel)" onPress={() => doExport(false)} style={{ flex: 1 }} />
          <Button small kind="ghost" label="Exportar todo" onPress={() => doExport(true)} style={{ flex: 1 }} />
        </View>
        {msg ? <Text style={{ color: C.muted, fontSize: 12, marginBottom: 6 }}>{msg}</Text> : null}

        {groups.length === 0 ? (
          <Card>
            <Empty>Sin movimientos con estos filtros.</Empty>
          </Card>
        ) : (
          groups.map(([date, list]) => (
            <View key={date}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, marginVertical: 6 }}>{formatLong(date)}</Text>
              <Card style={{ paddingVertical: 4 }}>
                {list.map((r) => (
                  <Row
                    key={r.id}
                    onPress={r.txId ? () => edit(r.txId) : undefined}
                    left={
                      <>
                        <Text style={{ fontWeight: '600', color: C.text, fontSize: 15 }}>{r.concept}</Text>
                        <Text style={{ fontSize: 12, color: C.muted }}>
                          <Text style={{ color: groupColor[r.group], fontWeight: '700' }}>{r.label}</Text> · {r.category}
                          {r.accountName ? ` · ${r.onCard ? '💳 ' : ''}${r.accountName}` : ''}
                          {r.txId ? '' : ' · se edita en Resumen'}
                        </Text>
                      </>
                    }
                    right={<Text style={{ fontWeight: '800', color: groupColor[r.group] }}>{money(r.amount)}</Text>}
                  />
                ))}
              </Card>
            </View>
          ))
        )}
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>Toca un movimiento para editarlo o eliminarlo.</Text>
      </ScrollView>
      <TxForm visible={!!editing} initial={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}

function Total({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F6F8F7', borderRadius: 12, padding: 10 }}>
      <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: 15, fontWeight: '800', color, marginTop: 2 }}>{money(value)}</Text>
    </View>
  );
}

const nav = {
  arrow: { width: 44, height: 40, borderRadius: 12, backgroundColor: '#fff', alignItems: 'center' as const, justifyContent: 'center' as const, borderWidth: 1, borderColor: C.line },
  arrowText: { fontSize: 24, color: C.primary, fontWeight: '700' as const, marginTop: -2 },
};
