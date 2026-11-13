import React, { useEffect, useState } from 'react';
import { Alert, Platform, Text, View } from 'react-native';
import { addDays, DIAS_SEMANA, formatLong, isValidDate, todayStr } from './dates';
import { fixedOccurrences, weekendRule } from './finance';
import { money, parseAmount } from './money';
import { uid, useStore } from './store';
import { ACCOUNT_COLORS, CATEGORIAS, C, typeColor, typeLabel } from './theme';
import type { Account, AccountKind, Fixed, Freq, Plan, Tx, TxType, WeekendRule } from './types';
import { AccountPicker, Button, Card, Chips, DateField, Field, Label, Row, SectionTitle, Segmented, Sheet } from './ui';

/** Confirmación que funciona en móvil y en web. */
export function confirm(title: string, message: string, onYes: () => void) {
  if (Platform.OS === 'web') {
    // eslint-disable-next-line no-alert
    if (typeof window !== 'undefined' && window.confirm(`${title}\n${message}`)) onYes();
    return;
  }
  Alert.alert(title, message, [
    { text: 'Cancelar', style: 'cancel' },
    { text: 'Eliminar', style: 'destructive', onPress: onYes },
  ]);
}

const num = (s: string) => parseAmount(s);
const dayOk = (s: string) => /^\d+$/.test(s) && +s >= 1 && +s <= 31;

/* ------------------------------------------------------------------ */
/* Movimiento                                                          */
/* ------------------------------------------------------------------ */

export function TxForm({ visible, initial, defaultType = 'gasto', onClose }: { visible: boolean; initial?: Tx; defaultType?: TxType; onClose: () => void }) {
  const { db, saveTx, deleteTx } = useStore();
  const [type, setType] = useState<TxType>(defaultType);
  const [amount, setAmount] = useState('');
  const [concept, setConcept] = useState('');
  const [category, setCategory] = useState('');
  const [date, setDate] = useState(todayStr());
  const [accountId, setAccountId] = useState<string | undefined>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    if (initial) {
      setType(initial.type);
      setAmount(String(initial.amount));
      setConcept(initial.concept);
      setCategory(initial.category);
      setDate(initial.date);
      setAccountId(initial.accountId);
    } else {
      setType(defaultType);
      setAmount('');
      setConcept('');
      setCategory('');
      setDate(todayStr());
      setAccountId(db.accounts.find((a) => a.kind !== 'credito')?.id ?? db.accounts[0]?.id);
    }
  }, [visible, initial, defaultType, db.accounts]);

  const accounts = type === 'ingreso' ? db.accounts.filter((a) => a.kind !== 'credito') : db.accounts;
  const account = db.accounts.find((a) => a.id === accountId);

  useEffect(() => {
    if (type === 'ingreso' && account?.kind === 'credito') setAccountId(accounts[0]?.id);
  }, [type]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = () => {
    const a = num(amount);
    if (!(a > 0)) return setError('Escribe un monto mayor a 0');
    if (!isValidDate(date)) return setError('La fecha no es válida');
    saveTx({
      id: initial?.id ?? uid(),
      type,
      amount: a,
      concept: concept.trim() || category || typeLabel[type],
      category: category || 'Otros',
      date,
      accountId,
    });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={initial ? 'Editar movimiento' : 'Nuevo movimiento'}
      onClose={onClose}
      footer={
        <>
          {initial ? (
            <Button
              kind="danger"
              label="Eliminar"
              onPress={() =>
                confirm('Eliminar movimiento', '¿Seguro que quieres eliminarlo?', () => {
                  deleteTx(initial.id);
                  onClose();
                })
              }
            />
          ) : null}
          <Button label="Guardar" onPress={save} style={{ flex: 1 }} />
        </>
      }
    >
      <View style={{ marginBottom: 14 }}>
        <Segmented
          value={type}
          onChange={(t) => {
            setType(t);
            setCategory('');
          }}
          options={(['ingreso', 'gasto', 'imprevisto'] as TxType[]).map((t) => ({ value: t, label: typeLabel[t] }))}
          colors={typeColor}
        />
      </View>
      <Field label="Monto" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" autoFocus={!initial} />
      <Field label="Concepto" value={concept} onChangeText={setConcept} placeholder={type === 'ingreso' ? 'Ej. Sueldo quincena' : 'Ej. Despensa'} />
      <View style={{ marginBottom: 14 }}>
        <Label>Categoría</Label>
        <Chips value={category} onChange={setCategory} options={CATEGORIAS[type].map((c) => ({ value: c, label: c, color: typeColor[type] }))} />
      </View>
      <View style={{ marginBottom: 14 }}>
        <Label>{type === 'ingreso' ? 'Entra a la cuenta' : 'Se paga con'}</Label>
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} none="Sin cuenta" />
        {account?.kind === 'credito' ? (
          <Text style={{ fontSize: 12, color: C.tarjeta, marginTop: 6 }}>
            Compra con tarjeta: se suma al estado de cuenta (corte día {account.cutDay ?? '?'}) y se paga hasta la fecha límite (día {account.dueDay ?? '?'}).
          </Text>
        ) : null}
      </View>
      <DateField label="Fecha" value={date} onChange={setDate} />
      {error ? <Text style={{ color: C.danger, marginBottom: 8 }}>{error}</Text> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Pago fijo                                                           */
/* ------------------------------------------------------------------ */

export function FixedForm({ visible, initial, onClose }: { visible: boolean; initial?: Fixed; onClose: () => void }) {
  const { db, saveFixed, deleteFixed } = useStore();
  const [kind, setKind] = useState<'gasto' | 'ingreso'>('gasto');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [freq, setFreq] = useState<Freq>('mensual');
  const [day, setDay] = useState('1');
  const [d1, setD1] = useState('15');
  const [d2, setD2] = useState('30');
  const [weekday, setWeekday] = useState('0');
  const [weekend, setWeekend] = useState<WeekendRule>('igual');
  const [accountId, setAccountId] = useState<string | undefined>();
  const [startDate, setStartDate] = useState(todayStr());
  const [error, setError] = useState('');

  const changeFreq = (f: Freq) => {
    setFreq(f);
    setWeekend(f === 'quincenal' ? 'viernes' : 'igual');
  };

  useEffect(() => {
    if (!visible) return;
    setError('');
    if (initial) {
      setWeekend(weekendRule(initial));
      setKind(initial.kind);
      setName(initial.name);
      setAmount(String(initial.amount));
      setFreq(initial.freq);
      setDay(String(initial.day ?? 1));
      setD1(String(initial.days?.[0] ?? 15));
      setD2(String(initial.days?.[1] ?? 30));
      setWeekday(String(initial.weekday ?? 0));
      setAccountId(initial.accountId);
      setStartDate(initial.startDate);
    } else {
      setKind('gasto');
      setName('');
      setAmount('');
      setFreq('mensual');
      setDay('1');
      setD1('15');
      setD2('30');
      setWeekday('0');
      setWeekend('igual');
      setAccountId(db.accounts.find((a) => a.kind !== 'credito')?.id);
      setStartDate(todayStr());
    }
  }, [visible, initial, db.accounts]);

  const accounts = kind === 'ingreso' ? db.accounts.filter((a) => a.kind !== 'credito') : db.accounts;

  const save = () => {
    const a = num(amount);
    if (!name.trim()) return setError('Ponle un nombre');
    if (!(a > 0)) return setError('Escribe un monto mayor a 0');
    if (freq === 'mensual' && !dayOk(day)) return setError('El día debe ser de 1 a 31');
    if (freq === 'quincenal' && !(dayOk(d1) && dayOk(d2))) return setError('Los días deben ser de 1 a 31');
    if (!isValidDate(startDate)) return setError('La fecha de inicio no es válida');
    saveFixed({
      id: initial?.id ?? uid(),
      name: name.trim(),
      amount: a,
      kind,
      freq,
      day: freq === 'mensual' ? +day : undefined,
      days: freq === 'quincenal' ? [+d1, +d2] : undefined,
      weekday: freq === 'semanal' ? +weekday : undefined,
      weekend: freq === 'semanal' ? undefined : weekend,
      accountId,
      startDate,
    });
    onClose();
  };

  // Vista previa de las próximas fechas con la regla elegida
  const previewOk = freq === 'semanal' || (freq === 'mensual' ? dayOk(day) : dayOk(d1) && dayOk(d2));
  const preview = previewOk
    ? fixedOccurrences(
        {
          id: 'preview',
          name: '',
          amount: 0,
          kind,
          freq,
          day: +day,
          days: [+d1, +d2],
          weekday: +weekday,
          weekend,
          startDate: isValidDate(startDate) ? startDate : todayStr(),
        },
        todayStr(),
        addDays(todayStr(), 100),
      ).slice(0, 4)
    : [];

  return (
    <Sheet
      visible={visible}
      title={initial ? 'Editar pago fijo' : 'Nuevo pago fijo'}
      onClose={onClose}
      footer={
        <>
          {initial ? (
            <Button
              kind="danger"
              label="Eliminar"
              onPress={() =>
                confirm('Eliminar pago fijo', 'Se dejarán de generar sus cobros futuros.', () => {
                  deleteFixed(initial.id);
                  onClose();
                })
              }
            />
          ) : null}
          <Button label="Guardar" onPress={save} style={{ flex: 1 }} />
        </>
      }
    >
      <View style={{ marginBottom: 14 }}>
        <Segmented value={kind} onChange={setKind} options={[{ value: 'gasto', label: 'Pago / gasto' }, { value: 'ingreso', label: 'Ingreso fijo' }]} colors={{ gasto: C.gasto, ingreso: C.ingreso }} />
      </View>
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej. Internet, Gasolina, Sueldo" />
      <Field label="Monto" value={amount} onChangeText={setAmount} keyboardType="decimal-pad" placeholder="0.00" />
      <View style={{ marginBottom: 14 }}>
        <Label>Frecuencia</Label>
        <Segmented value={freq} onChange={changeFreq} options={[{ value: 'mensual', label: 'Mensual' }, { value: 'quincenal', label: 'Quincenal' }, { value: 'semanal', label: 'Semanal' }]} />
      </View>
      {freq === 'mensual' ? <Field label="Día del mes" value={day} onChangeText={setDay} keyboardType="number-pad" hint="Si el mes es más corto se usa el último día." /> : null}
      {freq === 'quincenal' ? (
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Día en la 1ª quincena" value={d1} onChangeText={setD1} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Día en la 2ª quincena" value={d2} onChangeText={setD2} keyboardType="number-pad" />
          </View>
        </View>
      ) : null}
      {freq === 'semanal' ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Día de la semana</Label>
          <Chips value={weekday} onChange={setWeekday} options={DIAS_SEMANA.map((d, i) => ({ value: String(i), label: d }))} />
        </View>
      ) : null}
      {freq !== 'semanal' ? (
        <View style={{ marginBottom: 14 }}>
          <Label>Si cae en sábado o domingo</Label>
          <Chips
            value={weekend}
            onChange={setWeekend}
            options={[
              { value: 'viernes', label: 'Adelantar al viernes' },
              { value: 'lunes', label: 'Pasar al lunes' },
              { value: 'igual', label: 'Dejarlo igual' },
            ]}
          />
        </View>
      ) : null}
      {preview.length > 0 ? (
        <Text style={{ fontSize: 12, color: C.primary, marginBottom: 14 }}>Próximas fechas: {preview.map(formatLong).join('  ·  ')}</Text>
      ) : null}
      <View style={{ marginBottom: 14 }}>
        <Label>{kind === 'ingreso' ? 'Entra a la cuenta' : 'Se paga con'}</Label>
        <AccountPicker accounts={accounts} value={accountId} onChange={setAccountId} none="Sin cuenta" />
      </View>
      <DateField label="Empieza el" value={startDate} onChange={setStartDate} />
      {error ? <Text style={{ color: C.danger, marginBottom: 8 }}>{error}</Text> : null}
    </Sheet>
  );
}

/* ------------------------------------------------------------------ */
/* Cuenta                                                              */
/* ------------------------------------------------------------------ */

export function AccountForm({ visible, initial, onClose }: { visible: boolean; initial?: Account; onClose: () => void }) {
  const { db, saveAccount, deleteAccount, deletePlan } = useStore();
  const [kind, setKind] = useState<AccountKind>('debito');
  const [name, setName] = useState('');
  const [color, setColor] = useState(ACCOUNT_COLORS[0]);
  const [balance, setBalance] = useState('');
  const [limit, setLimit] = useState('');
  const [cutDay, setCutDay] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [payFromId, setPayFromId] = useState<string | undefined>();
  const [error, setError] = useState('');
  const [planOpen, setPlanOpen] = useState(false);
  const [editPlan, setEditPlan] = useState<Plan | undefined>();

  useEffect(() => {
    if (!visible) return;
    setError('');
    setKind(initial?.kind ?? 'debito');
    setName(initial?.name ?? '');
    setColor(initial?.color ?? ACCOUNT_COLORS[db.accounts.length % ACCOUNT_COLORS.length]);
    setBalance(initial?.initialBalance ? String(initial.initialBalance) : '');
    setLimit(initial?.creditLimit ? String(initial.creditLimit) : '');
    setCutDay(initial?.cutDay ? String(initial.cutDay) : '');
    setDueDay(initial?.dueDay ? String(initial.dueDay) : '');
    setPayFromId(initial?.payFromId);
  }, [visible, initial]); // eslint-disable-line react-hooks/exhaustive-deps

  const debits = db.accounts.filter((a) => a.kind !== 'credito' && a.id !== initial?.id);
  const plans = initial ? db.plans.filter((p) => p.accountId === initial.id) : [];

  const save = () => {
    if (!name.trim()) return setError('Ponle un nombre a la cuenta');
    if (kind === 'credito') {
      if (!dayOk(cutDay)) return setError('Escribe el día de corte (1 a 31)');
      if (!dayOk(dueDay)) return setError('Escribe el día límite de pago (1 a 31)');
    }
    const bal = balance.trim() ? num(balance) : 0;
    const lim = limit.trim() ? num(limit) : undefined;
    if (Number.isNaN(bal) || (lim !== undefined && Number.isNaN(lim))) return setError('Revisa los montos');
    saveAccount({
      id: initial?.id ?? uid(),
      name: name.trim(),
      kind,
      color,
      initialBalance: kind === 'credito' ? undefined : bal,
      creditLimit: kind === 'credito' ? lim : undefined,
      cutDay: kind === 'credito' ? +cutDay : undefined,
      dueDay: kind === 'credito' ? +dueDay : undefined,
      payFromId: kind === 'credito' ? payFromId : undefined,
    });
    onClose();
  };

  return (
    <>
      <Sheet
        visible={visible}
        title={initial ? 'Editar cuenta' : 'Nueva cuenta'}
        onClose={onClose}
        footer={
          <>
            {initial && db.accounts.length > 1 ? (
              <Button
                kind="danger"
                label="Eliminar"
                onPress={() =>
                  confirm('Eliminar cuenta', 'Sus movimientos se conservan pero quedarán sin cuenta; se borran sus planes a meses.', () => {
                    deleteAccount(initial.id);
                    onClose();
                  })
                }
              />
            ) : null}
            <Button label="Guardar" onPress={save} style={{ flex: 1 }} />
          </>
        }
      >
        <View style={{ marginBottom: 14 }}>
          <Segmented
            value={kind}
            onChange={setKind}
            options={[{ value: 'debito', label: 'Débito' }, { value: 'efectivo', label: 'Efectivo' }, { value: 'credito', label: 'Crédito' }]}
            colors={{ credito: C.tarjeta }}
          />
        </View>
        <Field label="Nombre" value={name} onChangeText={setName} placeholder={kind === 'credito' ? 'Ej. Nu, BBVA, Liverpool' : 'Ej. BBVA débito'} />
        <View style={{ marginBottom: 14 }}>
          <Label>Color</Label>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {ACCOUNT_COLORS.map((c) => (
              <Text key={c} onPress={() => setColor(c)} style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: c, borderWidth: 3, borderColor: color === c ? C.text : 'transparent', overflow: 'hidden' }}>
                {' '}
              </Text>
            ))}
          </View>
        </View>

        {kind !== 'credito' ? (
          <Field label="Saldo actual" value={balance} onChangeText={setBalance} keyboardType="decimal-pad" placeholder="0.00" hint="Con cuánto dinero cuenta hoy; a partir de ahí se calcula el saldo." />
        ) : (
          <>
            <Field label="Límite de crédito (opcional)" value={limit} onChangeText={setLimit} keyboardType="decimal-pad" placeholder="0.00" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Field label="Día de corte" value={cutDay} onChangeText={setCutDay} keyboardType="number-pad" placeholder="Ej. 26" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Día límite de pago" value={dueDay} onChangeText={setDueDay} keyboardType="number-pad" placeholder="Ej. 16" />
              </View>
            </View>
            <Text style={{ fontSize: 12, color: C.muted, marginTop: -6, marginBottom: 14 }}>
              Las compras hasta el día de corte se juntan en un estado de cuenta; su pago cae en el siguiente día límite que llegue después del corte.
            </Text>
            <View style={{ marginBottom: 14 }}>
              <Label>Normalmente la pago desde</Label>
              <AccountPicker accounts={debits} value={payFromId} onChange={setPayFromId} none="Ninguna" />
            </View>

            {initial ? (
              <>
                <SectionTitle right={<Button small kind="ghost" label="+ Agregar" onPress={() => { setEditPlan(undefined); setPlanOpen(true); }} />}>Compras a meses y saldos</SectionTitle>
                <Card>
                  {plans.length === 0 ? (
                    <Text style={{ color: C.muted, fontSize: 13 }}>
                      Agrega aquí una compra diferida a meses, o el saldo de un estado de cuenta que ya cortó (1 mes), para que se sume al pago de su fecha límite.
                    </Text>
                  ) : (
                    plans.map((p) => (
                      <Row
                        key={p.id}
                        onPress={() => { setEditPlan(p); setPlanOpen(true); }}
                        left={
                          <>
                            <Text style={{ fontWeight: '600', color: C.text }}>{p.name}</Text>
                            <Text style={{ fontSize: 12, color: C.muted }}>
                              {money(p.monthlyAmount)} × {p.months} {p.months === 1 ? 'mes' : 'meses'} · desde {p.firstDue.slice(0, 7)}
                            </Text>
                          </>
                        }
                        right={<Text style={{ fontWeight: '700', color: C.tarjeta }}>{money(p.monthlyAmount * p.months)}</Text>}
                      />
                    ))
                  )}
                </Card>
              </>
            ) : (
              <Text style={{ fontSize: 12, color: C.muted, marginBottom: 14 }}>Guarda la tarjeta para poder agregar compras a meses o saldos pendientes.</Text>
            )}
          </>
        )}
        {error ? <Text style={{ color: C.danger, marginBottom: 8 }}>{error}</Text> : null}
      </Sheet>
      {initial ? <PlanForm visible={planOpen} accountId={initial.id} initial={editPlan} onClose={() => setPlanOpen(false)} onDelete={deletePlan} /> : null}
    </>
  );
}

function PlanForm({ visible, accountId, initial, onClose, onDelete }: { visible: boolean; accountId: string; initial?: Plan; onClose: () => void; onDelete: (id: string) => void }) {
  const { savePlan } = useStore();
  const [name, setName] = useState('');
  const [monthly, setMonthly] = useState('');
  const [months, setMonths] = useState('1');
  const [firstDue, setFirstDue] = useState(todayStr());
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setError('');
    setName(initial?.name ?? '');
    setMonthly(initial ? String(initial.monthlyAmount) : '');
    setMonths(initial ? String(initial.months) : '1');
    setFirstDue(initial?.firstDue ?? todayStr());
  }, [visible, initial]);

  const save = () => {
    const m = num(monthly);
    if (!name.trim()) return setError('Ponle un nombre');
    if (!(m > 0)) return setError('Escribe la mensualidad');
    if (!/^\d+$/.test(months) || +months < 1) return setError('Los meses deben ser 1 o más');
    if (!isValidDate(firstDue)) return setError('La fecha no es válida');
    savePlan({ id: initial?.id ?? uid(), accountId, name: name.trim(), monthlyAmount: m, months: +months, firstDue });
    onClose();
  };

  return (
    <Sheet
      visible={visible}
      title={initial ? 'Editar plan' : 'Compra a meses / saldo'}
      onClose={onClose}
      footer={
        <>
          {initial ? <Button kind="danger" label="Eliminar" onPress={() => confirm('Eliminar', '¿Quitar este plan?', () => { onDelete(initial.id); onClose(); })} /> : null}
          <Button label="Guardar" onPress={save} style={{ flex: 1 }} />
        </>
      }
    >
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej. Taller diferido, Saldo del corte" />
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <View style={{ flex: 2 }}>
          <Field label="Mensualidad (con intereses)" value={monthly} onChangeText={setMonthly} keyboardType="decimal-pad" placeholder="0.00" />
        </View>
        <View style={{ flex: 1 }}>
          <Field label="Meses" value={months} onChangeText={setMonths} keyboardType="number-pad" />
        </View>
      </View>
      <DateField label="Fecha del primer pago" value={firstDue} onChange={setFirstDue} />
      <Text style={{ fontSize: 12, color: C.muted }}>
        Se suma al pago de la tarjeta de cada mes, empezando por el mes de esa fecha. Para un saldo que ya traes, usa 1 mes y la fecha límite de ese estado de cuenta.
      </Text>
      {error ? <Text style={{ color: C.danger, marginTop: 8 }}>{error}</Text> : null}
    </Sheet>
  );
}
