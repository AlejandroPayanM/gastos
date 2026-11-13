import React, { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { useStore } from '../store';
import { C } from '../theme';
import { Button, Card, Field, Segmented, Sheet } from '../ui';
import { confirm } from '../forms';
import { useCloud } from './CloudProvider';
import { summaryOf, type SyncState } from './engine';

const pad = (n: number) => String(n).padStart(2, '0');

function when(iso?: string) {
  if (!iso) return '';
  const d = new Date(iso);
  const t = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return new Date().toDateString() === d.toDateString() ? `hoy ${t}` : `${pad(d.getDate())}/${pad(d.getMonth() + 1)} ${t}`;
}

export function statusText(s: SyncState): { text: string; color: string } {
  switch (s.status) {
    case 'synced':
      return { text: `Sincronizado ${when(s.lastSyncAt)}`, color: C.ingreso };
    case 'syncing':
      return { text: 'Sincronizando…', color: C.muted };
    case 'pending':
      return { text: 'Cambios por subir…', color: C.imprevisto };
    case 'conflict':
      return { text: 'Falta decidir qué datos usar', color: C.danger };
    case 'error':
      return { text: `Sin sincronizar: ${s.error ?? 'error'}`, color: C.danger };
    default:
      return { text: s.lastSyncAt ? `Última vez ${when(s.lastSyncAt)}` : 'Conectando…', color: C.muted };
  }
}

/** Tarjeta para la pestaña Cuentas: estado de la nube y acceso a iniciar sesión. */
export function CloudCard() {
  const cloud = useCloud();
  const [open, setOpen] = useState(false);
  const signed = !!cloud.email;
  const st = statusText(cloud.state);
  return (
    <>
      <Card>
        <Text style={{ fontSize: 15, fontWeight: '800', color: C.text }}>☁️ Cuenta en la nube</Text>
        {!cloud.enabled ? (
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Todavía no está configurada en esta versión. Tus datos se guardan solo en este dispositivo.</Text>
        ) : signed ? (
          <>
            <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>{cloud.email}</Text>
            <Text style={{ color: st.color, fontSize: 13, fontWeight: '700', marginTop: 2 }}>{st.text}</Text>
          </>
        ) : (
          <Text style={{ color: C.muted, fontSize: 13, marginTop: 4 }}>Inicia sesión para ver tus mismos datos en cualquier dispositivo y tener una copia en la nube.</Text>
        )}
        <Button kind="ghost" label={signed ? 'Ver cuenta y sincronizar' : cloud.enabled ? 'Iniciar sesión o crear cuenta' : 'Cómo activarla'} onPress={() => setOpen(true)} style={{ marginTop: 10 }} />
      </Card>
      <CloudSheet visible={open} onClose={() => setOpen(false)} />
    </>
  );
}

export function CloudSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const cloud = useCloud();
  const [mode, setMode] = useState<'entrar' | 'crear'>('entrar');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | undefined>();

  useEffect(() => {
    if (visible) setMsg(undefined);
  }, [visible]);

  // Al iniciar sesión se cierra solo
  useEffect(() => {
    if (cloud.email && visible && busy) {
      setBusy(false);
      setPassword('');
    }
  }, [cloud.email, visible, busy]);

  const submit = async () => {
    if (!email.trim() || !password) return setMsg({ text: 'Escribe tu correo y contraseña.' });
    setBusy(true);
    setMsg(undefined);
    if (mode === 'entrar') {
      const err = await cloud.signIn(email, password);
      if (err) setMsg({ text: err });
    } else {
      const r = await cloud.signUp(email, password);
      if (r.error) setMsg({ text: r.error });
      else if (r.confirm) {
        setMsg({ text: 'Cuenta creada. Te mandamos un correo para confirmarla; ábrelo y luego inicia sesión aquí.', ok: true });
        setMode('entrar');
      }
    }
    setBusy(false);
  };

  const forgot = async () => {
    if (!email.trim()) return setMsg({ text: 'Escribe tu correo arriba y vuelve a tocar "Olvidé mi contraseña".' });
    setBusy(true);
    const err = await cloud.resetPassword(email);
    setBusy(false);
    setMsg(err ? { text: err } : { text: 'Te mandamos un correo con un enlace para crear una contraseña nueva.', ok: true });
  };

  const st = statusText(cloud.state);

  return (
    <Sheet visible={visible} title="Cuenta en la nube" onClose={onClose}>
      {!cloud.enabled ? (
        <>
          <Text style={{ color: C.text, fontSize: 14, marginBottom: 10 }}>Esta versión de la app todavía no está conectada a una base de datos.</Text>
          <Text style={{ color: C.muted, fontSize: 13 }}>
            Para activarla se crea un proyecto gratuito en Supabase, se ejecuta el archivo supabase/schema.sql y se agregan las variables EXPO_PUBLIC_SUPABASE_URL y EXPO_PUBLIC_SUPABASE_ANON_KEY al compilar. Los pasos están en el README del proyecto.
          </Text>
        </>
      ) : cloud.email ? (
        <>
          <Card>
            <Text style={{ color: C.muted, fontSize: 12 }}>Sesión iniciada como</Text>
            <Text style={{ color: C.text, fontSize: 16, fontWeight: '800' }}>{cloud.email}</Text>
            <Text style={{ color: st.color, fontSize: 13, fontWeight: '700', marginTop: 6 }}>{st.text}</Text>
            {cloud.state.status === 'error' && cloud.state.error ? <Text style={{ color: C.muted, fontSize: 12, marginTop: 4 }}>Tus datos siguen guardados en este dispositivo y se reintentará solo.</Text> : null}
          </Card>
          <Text style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>
            Lo que captures se guarda aquí primero y se sube solo a tu cuenta. Al abrir la app en otro dispositivo con la misma cuenta verás los mismos datos.
          </Text>
          <Button label="Sincronizar ahora" onPress={cloud.syncNow} style={{ marginBottom: 8 }} />
          <Button
            kind="danger"
            label="Cerrar sesión"
            onPress={() =>
              confirm('Cerrar sesión', 'Tus datos se quedan en este dispositivo y en la nube. Para volver a sincronizar tendrás que iniciar sesión.', () => {
                cloud.signOut();
                onClose();
              })
            }
          />
        </>
      ) : (
        <>
          <View style={{ marginBottom: 14 }}>
            <Segmented
              value={mode}
              onChange={(m) => {
                setMode(m);
                setMsg(undefined);
              }}
              options={[
                { value: 'entrar', label: 'Entrar' },
                { value: 'crear', label: 'Crear cuenta' },
              ]}
            />
          </View>
          <Field label="Correo" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" placeholder="tu@correo.com" />
          <Field
            label="Contraseña"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
            autoComplete={mode === 'entrar' ? 'current-password' : 'new-password'}
            placeholder={mode === 'crear' ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
            onSubmitEditing={submit}
          />
          {msg ? <Text style={{ color: msg.ok ? C.ingreso : C.danger, marginBottom: 10, fontSize: 13 }}>{msg.text}</Text> : null}
          <Button label={busy ? 'Un momento…' : mode === 'entrar' ? 'Entrar' : 'Crear cuenta'} onPress={busy ? () => {} : submit} />
          {mode === 'entrar' ? <Button kind="ghost" label="Olvidé mi contraseña" onPress={forgot} style={{ marginTop: 8 }} /> : null}
          <Text style={{ color: C.muted, fontSize: 12, marginTop: 12 }}>
            Si ya tienes datos en este dispositivo, al entrar se subirán a tu cuenta (o te preguntaremos qué hacer si la cuenta ya tiene otros).
          </Text>
        </>
      )}
    </Sheet>
  );
}

/** Ventanas que pueden aparecer en cualquier pantalla: conflicto de datos y nueva contraseña. */
export function CloudGate() {
  const cloud = useCloud();
  const { db } = useStore();
  const [pw, setPw] = useState('');
  const [err, setErr] = useState('');
  const conflict = cloud.state.conflict;

  const line = (label: string, s: ReturnType<typeof summaryOf>) => `${label}: ${s.txs} movimientos, ${s.fixed} pagos fijos, ${s.accounts} cuentas, ${s.plans} planes`;

  return (
    <>
      <Sheet visible={!!conflict} title="¿Qué datos usar?" onClose={() => {}}>
        {conflict ? (
          <>
            <Text style={{ color: C.text, fontSize: 14, marginBottom: 10 }}>Tu cuenta ya tiene datos en la nube y este dispositivo tiene otros distintos.</Text>
            <Card>
              <Text style={{ color: C.text, fontSize: 13, marginBottom: 4 }}>{line('☁️ Nube', summaryOf(conflict.remote.data))}</Text>
              <Text style={{ color: C.text, fontSize: 13 }}>{line('📱 Este dispositivo', summaryOf(db))}</Text>
            </Card>
            <Button label="Combinar los dos" onPress={() => cloud.resolveConflict('combinar')} style={{ marginBottom: 6 }} />
            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Junta todo. Si algo está en los dos, se queda lo de este dispositivo. Ojo: puede repetir lo que hayas capturado en ambos lados.</Text>
            <Button kind="ghost" label="Usar los de la nube" onPress={() => cloud.resolveConflict('nube')} style={{ marginBottom: 6 }} />
            <Text style={{ color: C.muted, fontSize: 12, marginBottom: 12 }}>Reemplaza lo de este dispositivo con lo de tu cuenta.</Text>
            <Button
              kind="danger"
              label="Subir los de este dispositivo"
              onPress={() => confirm('Reemplazar la nube', 'Lo que hay en la nube se sustituirá por lo de este dispositivo.', () => cloud.resolveConflict('dispositivo'))}
              style={{ marginBottom: 6 }}
            />
            <Text style={{ color: C.muted, fontSize: 12 }}>Reemplaza lo de la nube con lo de este dispositivo.</Text>
          </>
        ) : null}
      </Sheet>

      <Sheet visible={cloud.recovery} title="Nueva contraseña" onClose={() => {}}>
        <Text style={{ color: C.muted, fontSize: 13, marginBottom: 12 }}>Escribe la contraseña nueva para tu cuenta.</Text>
        <Field label="Contraseña nueva" value={pw} onChangeText={setPw} secureTextEntry autoCapitalize="none" autoComplete="new-password" placeholder="Mínimo 6 caracteres" />
        {err ? <Text style={{ color: C.danger, marginBottom: 8 }}>{err}</Text> : null}
        <Button
          label="Guardar contraseña"
          onPress={async () => {
            if (pw.length < 6) return setErr('Debe tener al menos 6 caracteres.');
            const e = await cloud.updatePassword(pw);
            if (e) setErr(e);
            else {
              setErr('');
              setPw('');
            }
          }}
        />
      </Sheet>
    </>
  );
}
