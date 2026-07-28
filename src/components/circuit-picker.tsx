import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Field } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { listRecentCircuits, searchCircuits, type Circuit } from '@/lib/races';

/**
 * Sélecteur de circuit — référentiel MAÎTRISÉ (pas d'ajout libre, décision PO :
 * évite les doublons). « Tes circuits » (pistes déjà courues) proposés d'emblée ;
 * recherche tolérante (accents/casse) sur le nom ET la ville, côté serveur.
 */
export function CircuitPicker({
  value,
  onChange,
}: {
  value: Circuit | null;
  onChange: (c: Circuit) => void;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Circuit[]>([]);
  const [recents, setRecents] = useState<Circuit[]>([]);
  const [loading, setLoading] = useState(false);
  // Saisie à laquelle correspondent les résultats : pas de « Aucun circuit »
  // périmé pendant l'anti-rebond.
  const [resultsFor, setResultsFor] = useState<string | null>(null);

  // « Tes circuits » : chargés une fois (l'historique ne bouge pas pendant la saisie).
  useEffect(() => {
    let active = true;
    listRecentCircuits()
      .then((rows) => active && setRecents(rows))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (value) return;
    let active = true;
    const id = setTimeout(async () => {
      if (active) setLoading(true);
      try {
        const rows = await searchCircuits(query);
        if (active) {
          setResults(rows);
          setResultsFor(query);
        }
      } catch {
        // Réseau en carafe : liste vide plutôt qu'une rejection silencieuse.
        if (active) {
          setResults([]);
          setResultsFor(query);
        }
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

  const searching = query.trim().length > 0;
  // Hors recherche, on retire des suggestions générales les circuits déjà
  // proposés dans « Tes circuits » (pas de doublon visuel).
  const generalResults = searching
    ? results
    : results.filter((c) => !recents.some((r) => r.id === c.id));

  const Row = ({ c }: { c: Circuit }) => (
    <Pressable key={c.id} style={styles.row} onPress={() => onChange(c)} accessibilityRole="button">
      <Body>{c.name}</Body>
      {c.city ? <Muted>{c.city}</Muted> : null}
    </Pressable>
  );

  return (
    <View style={styles.wrap}>
      <Field
        label={t.races.circuit}
        placeholder={t.races.circuitSearch}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="words"
      />
      <View style={styles.list}>
        {loading ? <ActivityIndicator color={colors.accent} /> : null}

        {!searching && recents.length > 0 ? (
          <>
            <Label style={styles.sectionLabel}>{t.races.circuitRecents}</Label>
            {recents.map((c) => (
              <Row key={c.id} c={c} />
            ))}
            {generalResults.length > 0 ? (
              <Label style={styles.sectionLabel}>{t.races.circuitAll}</Label>
            ) : null}
          </>
        ) : null}

        {generalResults.map((c) => (
          <Row key={c.id} c={c} />
        ))}

        {searching && resultsFor === query && !loading && results.length === 0 ? (
          <Muted style={styles.empty}>{t.races.circuitEmpty}</Muted>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  list: { gap: 1 },
  sectionLabel: { marginTop: spacing.sm, marginBottom: spacing.xs },
  row: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm, borderRadius: radius.sharp, backgroundColor: colors.surface },
  empty: { paddingVertical: spacing.sm, paddingHorizontal: spacing.sm },
  selected: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, borderColor: colors.line, borderWidth: 1, borderRadius: radius.card, padding: spacing.md },
  selectedName: { fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
  change: { color: colors.accent, fontWeight: '700' },
});
