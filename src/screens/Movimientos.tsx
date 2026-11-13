import React, { useMemo, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { formatLong, inRange } from '../dates';
import { findAccount, isCard } from '../finance';
import { money } from '../money';
import { useStore } from '../store';
import { C, typeColor, typeLabel } from '../theme';
import type { Period, Tx, TxType } from '../types';
import { TxForm } from '../forms';
import { Card, Chips, Empty, Row } from '../ui';

export function Movimientos({ period }: { period: Period }) {
  const { db } = useStore();
  const [filter, setFilter] = useState<'todos' | TxType>('todos');
  const [editing, setEditing] = useState<Tx | undefined>();

  const groups = useMemo(() => {
    const list = db.txs.filter((t) => inRange(t.date, period.start, period.end) && (filter === 'todos' || t.type === filter));
    const byDay = new Map<string, Tx[]>();
    for (const t of list) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
    return [...byDay.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [db.txs, period, filter]);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <View style={{ marginBottom: 12 }}>
          <Chips
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'ingreso', label: 'Entradas', color: C.ingreso },
              { value: 'gasto', label: 'Salidas', color: C.gasto },
              { value: 'imprevisto', label: 'Imprevistos', color: C.imprevisto },
            ]}
          />
        </View>
        {groups.length === 0 ? (
          <Card>
            <Empty>Sin movimientos en este periodo. Usa el botón + para agregar.</Empty>
          </Card>
        ) : (
          groups.map(([date, txs]) => (
            <View key={date}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.muted, marginVertical: 6 }}>{formatLong(date)}</Text>
              <Card style={{ paddingVertical: 4 }}>
                {txs.map((t) => {
                  const acc = findAccount(db, t.accountId);
                  return (
                    <Row
                      key={t.id}
                      onPress={() => setEditing(t)}
                      left={
                        <>
                          <Text style={{ fontWeight: '600', color: C.text, fontSize: 15 }}>{t.concept}</Text>
                          <Text style={{ fontSize: 12, color: C.muted }}>
                            <Text style={{ color: typeColor[t.type], fontWeight: '700' }}>{typeLabel[t.type]}</Text> · {t.category}
                            {acc ? ` · ${isCard(acc) ? '💳 ' : ''}${acc.name}` : ''}
                          </Text>
                        </>
                      }
                      right={<Text style={{ fontWeight: '800', color: typeColor[t.type] }}>{money(t.type === 'ingreso' ? t.amount : -t.amount)}</Text>}
                    />
                  );
                })}
              </Card>
            </View>
          ))
        )}
      </ScrollView>
      <TxForm visible={!!editing} initial={editing} onClose={() => setEditing(undefined)} />
    </>
  );
}
