import React from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';
import { addDays, formatLong, isValidDate, todayStr } from './dates';
import { C } from './theme';
import type { Account } from './types';

export function Card({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[s.card, style]}>{children}</View>;
}

export function SectionTitle({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <View style={s.sectionRow}>
      <Text style={s.sectionTitle}>{children}</Text>
      {right}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = 'primary',
  small,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'danger';
  small?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const bg = kind === 'primary' ? C.primary : kind === 'danger' ? '#FEE2E2' : C.primarySoft;
  const fg = kind === 'primary' ? '#fff' : kind === 'danger' ? C.danger : C.primary;
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.btn, small && s.btnSmall, { backgroundColor: bg, opacity: pressed ? 0.8 : 1 }, style]}>
      <Text style={[s.btnText, { color: fg }, small && { fontSize: 13 }]}>{label}</Text>
    </Pressable>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  colors,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  colors?: Partial<Record<T, string>>;
}) {
  return (
    <View style={s.seg}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.segItem, on && { backgroundColor: colors?.[o.value] ?? C.primary }]}>
            <Text style={[s.segText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Chips<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string; color?: string }[];
  value: T | undefined;
  onChange: (v: T) => void;
}) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = o.value === value;
        const col = o.color ?? C.primary;
        return (
          <Pressable key={o.value} onPress={() => onChange(o.value)} style={[s.chip, on && { backgroundColor: col, borderColor: col }]}>
            <Text style={[s.chipText, on && { color: '#fff' }]}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function Field({ label, hint, ...props }: { label: string; hint?: string } & TextInputProps) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput placeholderTextColor="#9AA7A3" {...props} style={[s.input, props.style]} />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <Text style={s.label}>{children}</Text>;
}

export function DateField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const valid = isValidDate(value);
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pressable style={s.step} onPress={() => valid && onChange(addDays(value, -1))}>
          <Text style={s.stepText}>‹</Text>
        </Pressable>
        <TextInput
          value={value}
          onChangeText={onChange}
          placeholder="AAAA-MM-DD"
          placeholderTextColor="#9AA7A3"
          style={[s.input, { flex: 1, textAlign: 'center' }, !valid && { borderColor: C.danger }]}
        />
        <Pressable style={s.step} onPress={() => valid && onChange(addDays(value, 1))}>
          <Text style={s.stepText}>›</Text>
        </Pressable>
        <Pressable style={[s.step, { width: 56 }]} onPress={() => onChange(todayStr())}>
          <Text style={[s.stepText, { fontSize: 13 }]}>Hoy</Text>
        </Pressable>
      </View>
      <Text style={s.hint}>{valid ? formatLong(value) : 'Formato: AAAA-MM-DD'}</Text>
    </View>
  );
}

/** Selector de cuenta. `none` permite dejarlo sin cuenta. */
export function AccountPicker({
  accounts,
  value,
  onChange,
  none,
}: {
  accounts: Account[];
  value: string | undefined;
  onChange: (id: string | undefined) => void;
  none?: string;
}) {
  const opts = [...(none ? [{ value: '', label: none }] : []), ...accounts.map((a) => ({ value: a.id, label: `${a.kind === 'credito' ? '💳 ' : ''}${a.name}`, color: a.color }))];
  return <Chips options={opts} value={value ?? (none ? '' : undefined)} onChange={(v) => onChange(v || undefined)} />;
}

export function Sheet({
  visible,
  title,
  onClose,
  children,
  footer,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.backdrop}>
        <Pressable style={{ flex: 1 }} onPress={onClose} />
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={{ fontSize: 22, color: C.muted }}>✕</Text>
            </Pressable>
          </View>
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 12 }}>
            {children}
          </ScrollView>
          {footer ? <View style={s.footer}>{footer}</View> : null}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function Row({ left, right, onPress, onLongPress }: { left: React.ReactNode; right?: React.ReactNode; onPress?: () => void; onLongPress?: () => void }) {
  return (
    <Pressable onPress={onPress} onLongPress={onLongPress} style={({ pressed }) => [s.row, pressed && onPress ? { backgroundColor: '#F7FAF9' } : null]}>
      <View style={{ flex: 1 }}>{left}</View>
      {right}
    </Pressable>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <Text style={s.empty}>{children}</Text>;
}

export const s = StyleSheet.create({
  card: { backgroundColor: C.card, borderRadius: 16, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.line },
  sectionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, marginBottom: 8 },
  sectionTitle: { fontSize: 13, fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.6 },
  btn: { paddingVertical: 13, paddingHorizontal: 18, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 },
  btnText: { fontSize: 15, fontWeight: '700' },
  seg: { flexDirection: 'row', backgroundColor: '#E6ECEA', borderRadius: 12, padding: 3 },
  segItem: { flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center' },
  segText: { fontSize: 14, fontWeight: '600', color: C.muted },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingVertical: 7, paddingHorizontal: 12, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: '#fff' },
  chipText: { fontSize: 13, fontWeight: '600', color: C.text },
  field: { marginBottom: 14 },
  label: { fontSize: 13, fontWeight: '600', color: C.muted, marginBottom: 6 },
  hint: { fontSize: 12, color: C.muted, marginTop: 4 },
  input: { borderWidth: 1, borderColor: C.line, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 11, fontSize: 16, color: C.text, backgroundColor: '#fff' },
  step: { width: 42, height: 44, borderRadius: 12, backgroundColor: C.primarySoft, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 22, fontWeight: '700', color: C.primary },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 18, maxHeight: '92%', width: '100%', maxWidth: 560, alignSelf: 'center' },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sheetTitle: { fontSize: 20, fontWeight: '800', color: C.text },
  footer: { flexDirection: 'row', gap: 10, paddingTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 11, gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: C.line },
  empty: { color: C.muted, textAlign: 'center', paddingVertical: 18, fontSize: 14 },
});
