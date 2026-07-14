import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { createCircuit, searchCircuits, type Circuit } from '@/lib/races';
import { validateCircuitName } from '@/lib/username';

export function CircuitPicker({
  value,
  onChange,
}: {
  value: Circuit | null;
  onChange: (c: Circuit) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    if (value) return;
    let active = true;
    const id = setTimeout(async () => {
      if (active) setLoading(true);
      try {
        const rows = await searchCircuits(query);
        if (active) setResults(rows);
      } finally {
        if (active) setLoading(false);
      }
    }, 250);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query, value]);

  if (value) {
    return (
      <View style={styles.selected}>
        <View style={styles.flex}>
          <Label>{t.races.circuit}</Label>
          <Body style={styles.selectedName}>{value.name}</Body>
          {value.city ? <Muted>{value.city}</Muted> : null}
        </View>
        <Pressable accessibilityRole="button" onPress={() => onChange(null as unknown as Circuit)}>
          <Muted style={styles.change}>{t.races.edit}</Muted>
        </Pressable>
      </View>
    );
  }

  const exact = results.some((r) => r.name.toLowerCase() === query.trim().toLowerCase());
  const nameCheck = validateCircuitName(query);
  const banned = query.trim().length >= 2 && nameCheck.error === 'banned';
  const canAdd = nameCheck.ok && !exact;

  async function onAdd() {
    setAdding(true);
    setAddError(null);
    try {
      const c = await createCircuit(query.trim());
      onChange(c);
    } catch (e) {
      // Le serveur peut refuser (mot interdit, limite de création) : on n'affiche
      // que ces messages métier ; toute autre erreur technique → message générique.
      const msg = e instanceof Error ? e.message : '';
      setAddError(/autoris|Trop de/i.test(msg) ? msg : t.races.circuitAddError);
    } finally {
      setAdding(false);
    }
  }

  return (
    <View style={styles.wrap}>
      <Field label={t.races.circuit} placeholder={t.races.circuitSearch} value={query} onChangeText={setQuery} autoCapitalize="words" />
      <View style={styles.list}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}
        {results.map((c) => (
          <Pressable key={c.id} style={styles.row} onPress={() => onChange(c)} accessibilityRole="button">
            <Body>{c.name}</Body>
            {c.city ? <Muted>{c.city}</Muted> : null}
          </Pressable>
        ))}
        {canAdd ? (
          <Pressable style={[styles.row, styles.addRow]} onPress={onAdd} disabled={adding} accessibilityRole="button">
            <Body style={styles.addTxt}>{t.races.circuitAdd.replace('%s', query.trim())}</Body>
          </Pressable>
        ) : null}
        {banned ? <Muted style={styles.err}>{t.races.circuitBanned}</Muted> : null}
        {addError ? <Muted style={styles.err}>{addError}</Muted> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  list: { gap: 1 },
  row: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  addRow: { backgroundColor: colors.surface2 },
  addTxt: { color: colors.accent, fontWeight: '700' },
  err: { color: colors.accent, paddingHorizontal: spacing.sm, paddingTop: spacing.xs },
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  selectedName: { fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
  change: { color: colors.accent, fontWeight: '700' },
});
