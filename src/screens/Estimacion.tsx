import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { formatDay, todayStr } from '../dates';
import { projection, type ProjRow } from '../insights';
import { money, parseAmount } from '../money';
import { useStore } from '../store';
import { C } from '../theme';
import type { Mode } from '../types';
import { Button, Card, Field, Row, SectionTitle, Segmented } from '../ui';

const COUNT: Record<Mode, number> = { quincena: 6, semana: 8, mes: 4 };
/** Meses desde el actual hasta diciembre del año siguiente. */
const monthsToNextDecember = (today: string) => 13 - Number(today.slice(5, 7)) + 12;
const UNIT: Record<Mode, string> = { quincena: 'quincena', semana: 'semana', mes: 'mes' };
const kindColor = { ingreso: C.ingreso, fijo: C.gasto, tarjeta: C.tarjeta, programado: C.imprevisto } as const;

export function Estimacion() {
  const { db, setVariableEstimate, updateSettings } = useStore();
  const [mode, setMode] = useState<Mode>('quincena');
  const [open, setOpen] = useState<string | undefined>();
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState(false);
  const today = todayStr();

  const proj = useMemo(() => projection(db, mode, today, mode === 'mes' ? monthsToNextDecember(today) : COUNT[mode]), [db, mode, today]);
  const hasData = db.fixed.length > 0 || db.txs.length > 0 || db.plans.length > 0;
  const negative = proj.lowest && proj.lowest.endBalance < 0 ? proj.lowest : undefined;
  const cur = proj.rows[0];

  const keep = db.settings?.keepPeriods ?? [];
  const toggleKeep = (row: ProjRow) => {
    const keys = row.boundaries.filter((b) => b.amount > 0).map((b) => b.key);
    const allKept = keys.every((k) => keep.includes(k));
    const next = allKept ? keep.filter((k) => !keys.includes(k)) : [...new Set([...keep, ...keys])];
    updateSettings({ keepPeriods: next });
  };

  const saveEstimate = () => {
    const n = parseAmount(draft);
    if (!(n >= 0)) return;
    setVariableEstimate(n);
    setEditing(false);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }} keyboardShouldPersistTaps="handled">
      <Segmented
        value={mode}
        onChange={(m) => {
          setMode(m);
          setOpen(undefined);
        }}
        options={[
          { value: 'quincena', label: 'Quincenas' },
          { value: 'semana', label: 'Semanas' },
          { value: 'mes', label: 'Meses' },
        ]}
      />

      {!hasData ? (
        <Card style={{ marginTop: 12 }}>
          <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 12 }}>
            Agrega tus pagos fijos, tu sueldo y tus tarjetas, y aquí verás cómo se va a mover tu dinero en los próximos periodos.
          </Text>
        </Card>
      ) : null}

      {/* Ahora */}
      <Card style={{ marginTop: 12, backgroundColor: negative ? '#7F1D1D' : C.primary, borderColor: 'transparent' }}>
        <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>Hoy tienes en débito y efectivo</Text>
        <Text style={{ color: '#fff', fontSize: 30, fontWeight: '800' }}>{money(proj.startBalance)}</Text>
        {cur ? (
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 13, marginTop: 6 }}>
            Al cerrar esta {UNIT[mode]} te quedarían <Text style={{ fontWeight: '800' }}>{money(cur.endBalance)}</Text>
          </Text>
        ) : null}
        {cur && cur.dropped > 0 ? (
          <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 4 }}>
            No cuento {money(cur.dropped)} de sobrante de quincenas anteriores: se asume que se gasta en el día a día.
          </Text>
        ) : null}
        {negative ? (
          <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginTop: 8 }}>
            ⚠ Te faltarían {money(-negative.endBalance)} al cierre de: {negative.period.label} ({negative.period.sub})
          </Text>
        ) : proj.rows.length ? (
          <Text style={{ color: '#fff', fontSize: 13, marginTop: 8 }}>✓ No te quedas en negativo en los próximos {proj.rows.length} periodos.</Text>
        ) : null}
      </Card>

      {cur && proj.freeNow > 0 ? (
        <Card>
          <Text style={{ fontSize: 13, color: C.muted, fontWeight: '600' }}>Libre en esta {UNIT[mode]} después de tus pagos pendientes</Text>
          <Text style={{ fontSize: 24, fontWeight: '800', color: C.text }}>{money(proj.freeNow)}</Text>
          <Text style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>
            ≈ {money(proj.perDay)} por día durante {proj.daysLeft} {proj.daysLeft === 1 ? 'día' : 'días'}
          </Text>
        </Card>
      ) : null}

      {/* Gasto variable */}
      <SectionTitle>Gasto del día a día</SectionTitle>
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '700', color: C.text }}>
          {money(proj.variable)} por {UNIT[mode]}
          <Text style={{ fontWeight: '400', color: C.muted }}> · {proj.usingOverride ? 'estimado tuyo' : 'promedio automático'}</Text>
        </Text>
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 4 }}>
          {proj.usingOverride
            ? 'Usas tu propio estimado por quincena.'
            : proj.variableSamples > 0
              ? `Calculado con tus salidas e imprevistos de débito/efectivo ${proj.variableSamples === 1 ? 'del último periodo completo' : `de los últimos ${proj.variableSamples} periodos completos`}.`
              : 'Aún no hay suficiente historial completo; por ahora se estima en $0. Captura tus gastos o escribe un estimado.'}{' '}
          Los pagos fijos y de tarjeta no entran aquí porque se calculan aparte.
        </Text>
        {editing ? (
          <View style={{ marginTop: 10 }}>
            <Field label="Estimado de gasto variable por quincena" value={draft} onChangeText={setDraft} keyboardType="decimal-pad" placeholder="0.00" autoFocus />
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Button small label="Guardar" onPress={saveEstimate} />
              <Button small kind="ghost" label="Cancelar" onPress={() => setEditing(false)} />
            </View>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Button
              small
              kind="ghost"
              label="Poner mi estimado"
              onPress={() => {
                setDraft(String(db.settings?.variableEstimate ?? Math.round(proj.variableAuto / (mode === 'mes' ? 2 : mode === 'semana' ? 7 / 15 : 1))));
                setEditing(true);
              }}
            />
            {proj.usingOverride ? <Button small kind="ghost" label="Usar promedio" onPress={() => setVariableEstimate(undefined)} /> : null}
          </View>
        )}
      </Card>

      {/* Sobrante */}
      <SectionTitle>Sobrante entre quincenas</SectionTitle>
      <Card>
        <Segmented
          value={proj.carryOver ? 'si' : 'no'}
          onChange={(v) => updateSettings({ carryOver: v === 'si' })}
          options={[
            { value: 'no', label: 'No arrastrar' },
            { value: 'si', label: 'Arrastrar todo' },
          ]}
        />
        <Text style={{ fontSize: 12, color: C.muted, marginTop: 8 }}>
          {proj.carryOver
            ? 'Lo que sobra de cada quincena se suma a la siguiente.'
            : 'Lo que sobra de cada quincena se asume gastado en el día a día y no se suma a la siguiente (un faltante sí se arrastra). En los periodos donde sí vas a guardar, como diciembre, ábrelos y actívalo ahí.'}
        </Text>
      </Card>

      {/* Periodos */}
      <SectionTitle>Próximos periodos</SectionTitle>
      {proj.rows.map((r) => (
        <PeriodCard
          key={r.period.start}
          row={r}
          open={open === r.period.start}
          onToggle={() => setOpen(open === r.period.start ? undefined : r.period.start)}
          canKeep={!proj.carryOver}
          keep={keep}
          onKeep={() => toggleKeep(r)}
        />
      ))}
      <Text style={{ color: C.muted, fontSize: 12 }}>
        Es una estimación: parte de tu saldo de hoy y suma tus ingresos fijos, resta tus pagos fijos y los pagos de tarjeta calculados por corte y fecha límite, más el gasto del día a día. Compras nuevas con tarjeta aparecerán en el pago de su estado de cuenta cuando las captures.
      </Text>
    </ScrollView>
  );
}

function PeriodCard({ row, open, onToggle, canKeep, keep, onKeep }: { row: ProjRow; open: boolean; onToggle: () => void; canKeep: boolean; keep: string[]; onKeep: () => void }) {
  const leftovers = row.boundaries.filter((b) => b.amount > 0);
  const keeping = leftovers.length > 0 && leftovers.every((b) => keep.includes(b.key));
  const neg = row.endBalance < 0;
  return (
    <Card style={{ paddingVertical: 4 }}>
      <Pressable onPress={onToggle} style={{ paddingVertical: 10 }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>
              {row.period.label}
              {row.isCurrent ? '  · actual' : ''}
            </Text>
            <Text style={{ fontSize: 12, color: C.muted }}>{row.period.sub}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            {row.dropped > 0 && row.endBalance === 0 ? (
              <>
                <Text style={{ fontSize: 11, color: C.muted }}>Te sobra (no se arrastra)</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{money(row.dropped)}</Text>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 11, color: C.muted }}>Saldo al cierre</Text>
                <Text style={{ fontSize: 17, fontWeight: '800', color: neg ? C.danger : C.text }}>{money(row.endBalance)}</Text>
                {row.dropped > 0 ? <Text style={{ fontSize: 11, color: C.muted }}>sin {money(row.dropped)} de sobrante</Text> : null}
              </>
            )}
          </View>
        </View>
        <Text style={{ fontSize: 12, color: C.primary, marginTop: 4 }}>{open ? 'Ocultar detalle ▲' : 'Ver detalle ▼'}</Text>
      </Pressable>
      {open ? (
        <View style={{ paddingBottom: 8 }}>
          <Line label="Saldo al inicio" value={money(row.startBalance)} />
          <Line label="+ Entradas fijas" value={money(row.entradas)} color={C.ingreso} />
          <Line label="− Pagos fijos" value={money(-row.fijos)} color={C.gasto} />
          <Line label="− Pagos de tarjeta" value={money(-row.tarjetas)} color={C.tarjeta} />
          {row.programados !== 0 ? <Line label="± Movimientos programados" value={money(row.programados)} color={C.imprevisto} /> : null}
          <Line label={row.isCurrent ? '− Gasto del día a día que falta' : '− Gasto del día a día (estimado)'} value={money(-row.variable)} />
          {row.dropped > 0 ? <Line label="− Sobrante que no se arrastra" value={money(-row.dropped)} /> : null}
          {canKeep && leftovers.length > 0 ? (
            <Pressable onPress={onKeep} style={{ marginTop: 6, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: C.primary }}>
                {keeping ? '✓ Guardando el sobrante de este periodo (toca para quitar)' : 'Guardar el sobrante de este periodo'}
              </Text>
            </Pressable>
          ) : null}
          {row.items.length > 0 ? (
            <View style={{ marginTop: 8 }}>
              {row.items.map((it, i) => (
                <Row
                  key={`${it.date}-${it.label}-${i}`}
                  left={
                    <Text style={{ fontSize: 13, color: C.text }}>
                      <Text style={{ color: C.muted }}>{formatDay(it.date)}  </Text>
                      {it.label}
                    </Text>
                  }
                  right={<Text style={{ fontSize: 13, fontWeight: '700', color: kindColor[it.kind] }}>{money(it.amount, { sign: true })}</Text>}
                />
              ))}
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}

function Line({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
      <Text style={{ fontSize: 13, color: C.muted }}>{label}</Text>
      <Text style={{ fontSize: 13, fontWeight: '700', color: color ?? C.text }}>{value}</Text>
    </View>
  );
}
