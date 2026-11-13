import React, { useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { formatDay, todayStr } from '../dates';
import { accountBalance, cardStatus } from '../finance';
import { AccountForm } from '../forms';
import { money } from '../money';
import { useStore } from '../store';
import { C } from '../theme';
import type { Account } from '../types';
import { BackupSheet } from '../backup';
import { CloudCard } from '../cloud/CloudUI';
import { Button, Card, Row, SectionTitle } from '../ui';

export function Cuentas() {
  const { db } = useStore();
  const [editing, setEditing] = useState<Account | undefined>();
  const [open, setOpen] = useState(false);
  const [backup, setBackup] = useState(false);
  const today = todayStr();

  const show = (a?: Account) => {
    setEditing(a);
    setOpen(true);
  };

  const debits = db.accounts.filter((a) => a.kind !== 'credito');
  const cards = db.accounts.filter((a) => a.kind === 'credito');
  const total = debits.reduce((s, a) => s + accountBalance(db, a, today), 0);
  const debt = cards.reduce((s, a) => s + cardStatus(db, a, today).used, 0);

  return (
    <>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 110 }}>
        <Card style={{ backgroundColor: C.primary, borderColor: 'transparent' }}>
          <Text style={{ color: 'rgba(255,255,255,0.8)', fontSize: 13, fontWeight: '600' }}>Dinero en débito y efectivo</Text>
          <Text style={{ color: '#fff', fontSize: 32, fontWeight: '800' }}>{money(total)}</Text>
          {cards.length > 0 ? <Text style={{ color: 'rgba(255,255,255,0.85)', fontSize: 13, marginTop: 4 }}>Deuda en tarjetas: {money(debt)}</Text> : null}
        </Card>

        <Button label="+ Nueva cuenta o tarjeta" onPress={() => show()} style={{ marginBottom: 12 }} />

        <SectionTitle>Débito y efectivo</SectionTitle>
        <Card style={{ paddingVertical: 4 }}>
          {debits.map((a) => (
            <Row
              key={a.id}
              onPress={() => show(a)}
              left={
                <Text style={{ fontWeight: '600', color: C.text, fontSize: 15 }}>
                  <Text style={{ color: a.color }}>● </Text>
                  {a.name}
                  <Text style={{ color: C.muted, fontWeight: '400' }}>  {a.kind === 'efectivo' ? 'efectivo' : 'débito'}</Text>
                </Text>
              }
              right={<Text style={{ fontWeight: '800', color: C.text }}>{money(accountBalance(db, a, today))}</Text>}
            />
          ))}
        </Card>

        <SectionTitle>Tarjetas de crédito</SectionTitle>
        {cards.length === 0 ? (
          <Card>
            <Text style={{ color: C.muted, textAlign: 'center', paddingVertical: 12 }}>
              Agrega tus tarjetas con su día de corte y fecha límite de pago; los pagos se calculan solos.
            </Text>
          </Card>
        ) : (
          cards.map((a) => {
            const st = cardStatus(db, a, today);
            return (
              <Card key={a.id}>
                <Row
                  onPress={() => show(a)}
                  left={
                    <Text style={{ fontWeight: '800', color: C.text, fontSize: 16 }}>
                      <Text style={{ color: a.color }}>● </Text>
                      {a.name}
                    </Text>
                  }
                  right={<Text style={{ color: C.primary, fontWeight: '700', fontSize: 13 }}>Editar</Text>}
                />
                <View style={{ flexDirection: 'row', marginTop: 10, gap: 8 }}>
                  <Stat label="Usado" value={money(st.used)} color={C.tarjeta} />
                  <Stat label={st.available !== undefined ? 'Disponible' : 'Límite'} value={st.available !== undefined ? money(st.available) : '—'} />
                </View>
                <View style={{ flexDirection: 'row', marginTop: 8, gap: 8 }}>
                  <Stat label="Próximo corte" value={formatDay(st.nextCut)} small />
                  <Stat label={st.nextPayment ? `Pago · vence ${formatDay(st.nextPayment.due)}` : 'Próximo pago'} value={st.nextPayment ? money(st.nextPayment.amount) : 'Sin pago'} small />
                </View>
                <Text style={{ fontSize: 12, color: C.muted, marginTop: 10 }}>
                  Corte día {a.cutDay} · límite de pago día {a.dueDay}
                  {a.creditLimit ? ` · límite ${money(a.creditLimit)}` : ''}
                </Text>
              </Card>
            );
          })
        )}

        <SectionTitle>Datos</SectionTitle>
        <CloudCard />
        <Button kind="ghost" label="Respaldo: guardar o restaurar datos" onPress={() => setBackup(true)} />
      </ScrollView>
      <BackupSheet visible={backup} onClose={() => setBackup(false)} />
      <AccountForm visible={open} initial={editing} onClose={() => setOpen(false)} />
    </>
  );
}

function Stat({ label, value, color, small }: { label: string; value: string; color?: string; small?: boolean }) {
  return (
    <View style={{ flex: 1, backgroundColor: '#F6F8F7', borderRadius: 12, padding: 10 }}>
      <Text style={{ fontSize: 11, color: C.muted, fontWeight: '600' }}>{label}</Text>
      <Text style={{ fontSize: small ? 15 : 18, fontWeight: '800', color: color ?? C.text, marginTop: 2 }}>{value}</Text>
    </View>
  );
}
