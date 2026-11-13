import React, { useEffect, useState } from 'react';
import { Text } from 'react-native';
import { money, parseAmount } from './money';
import { C } from './theme';
import { Button, Field, Sheet } from './ui';

export interface AdjustTarget {
  key: string;
  title: string;
  subtitle: string;
  /** Monto original (del pago fijo o calculado por la tarjeta) */
  original: number;
  /** Monto actual, ajustado o no */
  current: number;
  adjusted: boolean;
  paid: boolean;
}

/** Cambia el monto de un cobro solo para ese periodo (p. ej. el internet subió o el estado de cuenta salió distinto). */
export function AdjustSheet({
  target,
  onClose,
  onSave,
}: {
  target: AdjustTarget | undefined;
  onClose: () => void;
  onSave: (key: string, amount: number | null) => void;
}) {
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    setError('');
    setValue(target ? String(target.current) : '');
  }, [target]);

  const save = () => {
    if (!target) return;
    const n = parseAmount(value);
    if (!(n >= 0)) return setError('Escribe un monto válido');
    // Si coincide con el original, se quita el ajuste.
    onSave(target.key, Math.abs(n - target.original) < 0.005 ? null : n);
    onClose();
  };

  return (
    <Sheet
      visible={!!target}
      title="Ajustar monto"
      onClose={onClose}
      footer={
        <>
          {target?.adjusted ? (
            <Button
              kind="ghost"
              label="Restaurar original"
              onPress={() => {
                onSave(target.key, null);
                onClose();
              }}
            />
          ) : null}
          <Button label="Guardar" onPress={save} style={{ flex: 1 }} />
        </>
      }
    >
      {target ? (
        <>
          <Text style={{ fontSize: 17, fontWeight: '800', color: C.text }}>{target.title}</Text>
          <Text style={{ color: C.muted, marginBottom: 14 }}>{target.subtitle}</Text>
          <Field label="Monto para este periodo" value={value} onChangeText={setValue} keyboardType="decimal-pad" autoFocus />
          <Text style={{ fontSize: 12, color: C.muted }}>
            Monto original: {money(target.original)}. Solo cambia este periodo; los demás siguen igual.
            {target.paid ? ' Como ya está marcado como pagado, también se actualiza lo pagado.' : ''}
          </Text>
          {error ? <Text style={{ color: C.danger, marginTop: 8 }}>{error}</Text> : null}
        </>
      ) : null}
    </Sheet>
  );
}
