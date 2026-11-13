import * as Clipboard from 'expo-clipboard';
import React, { useState } from 'react';
import { Platform, Share, Text, TextInput, View } from 'react-native';
import { todayStr } from './dates';
import { confirm } from './forms';
import { useStore } from './store';
import { C } from './theme';
import { Button, Card, Label, Sheet, s } from './ui';

export function BackupSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const { db, restore } = useStore();
  const [text, setText] = useState('');
  const [msg, setMsg] = useState('');

  const json = () => JSON.stringify({ app: 'mis-gastos', version: 1, exportedAt: todayStr(), db });

  const copy = async () => {
    try {
      await Clipboard.setStringAsync(json());
      setMsg('✓ Respaldo copiado. Pégalo en Notas o en un mensaje a ti mismo para guardarlo.');
    } catch {
      setMsg('No se pudo copiar. Usa "Compartir / guardar".');
    }
  };

  const share = async () => {
    try {
      if (Platform.OS === 'web' && typeof navigator !== 'undefined' && !(navigator as any).share) {
        return copy();
      }
      await Share.share({ message: json(), title: `Respaldo Mis Gastos ${todayStr()}` });
    } catch {
      setMsg('No se pudo compartir.');
    }
  };

  const doRestore = () => {
    if (!text.trim()) return setMsg('Pega primero el texto del respaldo.');
    confirm('Restaurar respaldo', 'Esto reemplaza todos los datos actuales por los del respaldo.', () => {
      const err = restore(text);
      if (err) setMsg(err);
      else {
        setText('');
        setMsg('✓ Datos restaurados.');
      }
    });
  };

  return (
    <Sheet visible={visible} title="Respaldo de datos" onClose={onClose}>
      <Text style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>
        Tus datos viven solo en este dispositivo. Guarda un respaldo de vez en cuando (por ejemplo cada quincena) para no perderlos si se borra el navegador o cambias de teléfono.
      </Text>
      <Card>
        <Label>Guardar respaldo</Label>
        <View style={{ gap: 8 }}>
          <Button label="Compartir / guardar" onPress={share} />
          <Button kind="ghost" label="Copiar al portapapeles" onPress={copy} />
        </View>
      </Card>
      <Card>
        <Label>Restaurar desde un respaldo</Label>
        <TextInput
          value={text}
          onChangeText={setText}
          multiline
          placeholder="Pega aquí el texto del respaldo"
          placeholderTextColor="#9AA7A3"
          style={[s.input, { minHeight: 90, textAlignVertical: 'top', marginBottom: 10 }]}
        />
        <Button kind="danger" label="Restaurar (reemplaza lo actual)" onPress={doRestore} />
      </Card>
      {msg ? <Text style={{ color: msg.startsWith('✓') ? C.ingreso : C.danger, marginTop: 4 }}>{msg}</Text> : null}
    </Sheet>
  );
}
