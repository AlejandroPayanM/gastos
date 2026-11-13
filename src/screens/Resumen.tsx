import React from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatDay, todayStr } from '../dates';
import { summarize } from '../finance';
import { money } from '../money';
import { useStore } from '../store';
import { C } from '../theme';
import type { Period } from '../types';
import { Card, Empty, Row, SectionTitle } from '../ui';

function Line({ label, value, color, bold, note }: { label: string; value: string; color?: string; bold?: boolean; note?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 }}>
      <View style={{ flex: 1 }}>
        <Text style={{ color: C.text, fontSize: 15, fontWeight: bold ? '800' : '500' }}>{label}</Text>
        {note ? <Text style={{ color: C.muted, fontSize: 12 }}>{note}</Text> : null}
      </View>
      <Text style={{ color: color ?? C.text, fontSize: 15, fontWeight: bold ? '800' : '700' }}>{value}</Text>
    </View>
  );
}

function PayButton({ paid, onPress, doneLabel, label }: { paid: boolean; onPress: () => void; doneLabel: string; label: string }) {
  return (
    <Pressable onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 10, backgroundColor: paid ? '#DCFCE7' : C.primarySoft }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: paid ? C.ingreso : C.primary }}>{paid ? `✓ ${doneLabel}` : label}</Text>
    </Pressable>
  );
}

export function Resumen({ period }: { period: Period }) {
  const { db, togglePaid } = useStore();
  const s = summarize(db, period);
  const today = todayStr();
  const neg = s.disponible < 0;

  const fixedList = s.occs.filter((o) => !o.onCard);
  const maxCat = Math.max(1, ...s.byCategory.map((c) => c.total));

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
      <Card style={{ backgroundColor: neg ? '#7F1D1D' : C.primary, borderColor: 'transparent' }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>Disponible del periodo</Text>
        <Text style={{ color: '#fff', fontSize: 36, fontWeight: '800', marginVertical: 2 }}>{money(s.disponible)}</Text>
        <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13 }}>
          Entradas {money(s.entradas)} − salidas {money(s.salidas)}
        </Text>
        {s.pendiente > 0 ? (
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 8 }}>Por pagar todavía: {money(s.pendiente)}</Text>
        ) : null}
      </Card>

      <SectionTitle>Desglose</SectionTitle>
      <Card>
        <Line label="Entradas" value={money(s.entradas, { sign: true })} color={C.ingreso} note={s.entradasFijas ? `incluye ${money(s.entradasFijas)} de ingresos fijos` : undefined} />
        <Line label="Salidas (débito / efectivo)" value={money(-s.gastos)} color={C.gasto} />
        <Line label="Imprevistos" value={money(-s.imprevistos)} color={C.imprevisto} />
        <Line label="Pagos fijos" value={money(-s.fijos)} color={C.gasto} note={s.fijosPendientes ? `${money(s.fijosPendientes)} pendientes` : undefined} />
        <Line
          label="Pagos de tarjeta"
          value={money(-s.pagosTarjeta)}
          color={C.tarjeta}
          note={s.pagos.length ? 'calculados según corte y fecha límite' : 'ninguna fecha límite en este periodo'}
        />
        <View style={{ height: 1, backgroundColor: C.line, marginVertical: 6 }} />
        <Line label="Disponible" value={money(s.disponible)} bold color={neg ? C.danger : C.text} />
        {s.comprasTarjeta > 0 ? (
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 6 }}>
            Además cargaste {money(s.comprasTarjeta)} a tarjetas en este periodo; se pagarán en la fecha límite de su estado de cuenta.
          </Text>
        ) : null}
      </Card>

      <SectionTitle>Pagos de tarjeta</SectionTitle>
      <Card>
        {s.pagos.length === 0 ? (
          <Empty>Ninguna tarjeta vence en este periodo.</Empty>
        ) : (
          s.pagos.map((p) => (
            <Row
              key={p.key}
              left={
                <>
                  <Text style={{ fontWeight: '700', color: C.text }}>
                    <Text style={{ color: p.account.color }}>● </Text>
                    {p.account.name} · vence {formatDay(p.due)}
                  </Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>
                    Corte {formatDay(p.cut)} · compras {money(p.charges)}
                    {p.plans ? ` + meses/saldos ${money(p.plans)}` : ''}
                    {!p.paid && p.due < today ? ' · vencido' : ''}
                  </Text>
                </>
              }
              right={
                <View style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Text style={{ fontWeight: '800', color: C.tarjeta }}>{money(p.amount)}</Text>
                  <PayButton paid={p.paid} onPress={() => togglePaid(p.key, p.amount)} label="Marcar pagado" doneLabel="Pagado" />
                </View>
              }
            />
          ))
        )}
      </Card>

      <SectionTitle>Pagos e ingresos fijos</SectionTitle>
      <Card>
        {fixedList.length === 0 ? (
          <Empty>No hay pagos fijos en este periodo.</Empty>
        ) : (
          fixedList.map((o) => {
            const inc = o.fixed.kind === 'ingreso';
            return (
              <Row
                key={o.key}
                left={
                  <>
                    <Text style={{ fontWeight: '600', color: C.text }}>{o.fixed.name}</Text>
                    <Text style={{ fontSize: 12, color: C.muted }}>
                      {formatDay(o.date)}
                      {!o.paid && o.date < today ? (inc ? ' · sin confirmar' : ' · vencido') : ''}
                    </Text>
                  </>
                }
                right={
                  <View style={{ alignItems: 'flex-end', gap: 6 }}>
                    <Text style={{ fontWeight: '800', color: inc ? C.ingreso : C.gasto }}>{money(inc ? o.fixed.amount : -o.fixed.amount)}</Text>
                    <PayButton paid={o.paid} onPress={() => togglePaid(o.key, o.fixed.amount)} label={inc ? 'Marcar recibido' : 'Marcar pagado'} doneLabel={inc ? 'Recibido' : 'Pagado'} />
                  </View>
                }
              />
            );
          })
        )}
      </Card>

      {s.byCategory.length > 0 ? (
        <>
          <SectionTitle>En qué se va</SectionTitle>
          <Card>
            {s.byCategory.map((c) => (
              <View key={c.category} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                  <Text style={{ color: C.text, fontSize: 14 }}>{c.category}</Text>
                  <Text style={{ color: C.text, fontWeight: '700', fontSize: 14 }}>{money(c.total)}</Text>
                </View>
                <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, marginTop: 4 }}>
                  <View style={{ height: 6, borderRadius: 3, backgroundColor: C.primary, width: `${(c.total / maxCat) * 100}%` }} />
                </View>
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </ScrollView>
  );
}
