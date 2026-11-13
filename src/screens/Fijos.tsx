import React, { useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { DIAS_SEMANA, formatDay, weekdayMon } from '../dates';
import { findAccount, weekendRule } from '../finance';
import { FixedForm } from '../forms';
import { money } from '../money';
import { useStore } from '../store';
import { C } from '../theme';
import type { Fixed } from '../types';
import { Button, Card, Empty, Row, SectionTitle } from '../ui';

function when(f: Fixed) {
  if (f.freq === 'semanal') return `Cada ${DIAS_SEMANA[f.weekday ?? 0].toLowerCase()}`;
  if (f.freq === 'bisemanal') return `Cada 2 semanas (${DIAS_SEMANA[weekdayMon(f.startDate)].toLowerCase()}, desde el ${formatDay(f.startDate)})`;
  const rule = weekendRule(f);
  const weekend = rule === 'viernes' ? ' · fin de semana → viernes' : rule === 'lunes' ? ' · fin de semana → lunes' : '';
  if (f.freq === 'mensual') return `Cada mes, día ${f.day}${weekend}`;
  return `Cada quincena (días ${f.days?.[0]} y ${f.days?.[1]})${weekend}`;
}

export function Fijos() {
  const { db } = useStore();
  const [editing, setEditing] = useState<Fixed | undefined>();
  const [open, setOpen] = useState(false);

  const show = (f?: Fixed) => {
    setEditing(f);
    setOpen(true);
  };

  const group = (kind: 'gasto' | 'ingreso') => db.fixed.filter((f) => f.kind === kind);

  const render = (list: Fixed[], empty: string) => (
    <Card>
      {list.length === 0 ? (
        <Empty>{empty}</Empty>
      ) : (
        list.map((f) => {
          const acc = findAccount(db, f.accountId);
          return (
            <Row
              key={f.id}
              onPress={() => show(f)}
              left={
                <>
                  <Text style={{ fontWeight: '600', color: C.text, fontSize: 15 }}>{f.name}</Text>
                  <Text style={{ fontSize: 12, color: C.muted }}>
                    {when(f)}
                    {acc ? ` · ${acc.kind === 'credito' ? '💳 ' : ''}${acc.name}` : ''}
                  </Text>
                </>
              }
              right={<Text style={{ fontWeight: '800', color: f.kind === 'ingreso' ? C.ingreso : C.gasto }}>{money(f.amount)}</Text>}
            />
          );
        })
      )}
    </Card>
  );

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Button label="+ Nuevo pago fijo" onPress={() => show()} style={{ marginBottom: 12 }} />
        <SectionTitle>Pagos fijos</SectionTitle>
        {render(group('gasto'), 'Aún no tienes pagos fijos (renta, internet, gasolina, ahorro…).')}
        <SectionTitle>Ingresos fijos</SectionTitle>
        {render(group('ingreso'), 'Agrega tu sueldo para que se proyecte cada quincena.')}
        <Text style={{ color: C.muted, fontSize: 12 }}>
          Los pagos fijos se calculan solos en cada periodo (semana, quincena o mes). Si un pago fijo es con tarjeta de crédito, se suma al estado de cuenta en lugar de salir de tu saldo.
        </Text>
      </ScrollView>
      <FixedForm visible={open} initial={editing} onClose={() => setOpen(false)} />
    </>
  );
}
