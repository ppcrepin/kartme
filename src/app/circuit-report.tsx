import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Banner, Button, Card, Field } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { suggestCircuit, type CircuitReportKind } from '@/lib/races';

/**
 * Signaler un karting manquant, fermé, ou dont la fiche est fausse.
 *
 * Deux entrées : le lien générique de l'onglet Kartings (pas de cible → on ne
 * peut signaler QU'un manquant), et la fiche d'un circuit (une cible → fermé
 * ou erreur ; « il manque » n'aurait aucun sens depuis une fiche qui existe).
 *
 * Nom + ville seulement, pas de commentaire libre — décision PO : un champ de
 * texte ouvert est une porte d'entrée pour les insultes.
 */
export default function CircuitReportScreen() {
  const router = useRouter();
  const { circuitId, circuitName } = useLocalSearchParams<{
    circuitId?: string;
    circuitName?: string;
  }>();
  const correction = !!circuitId;

  const [kind, setKind] = useState<CircuitReportKind>(correction ? 'ferme' : 'manquant');
  const [name, setName] = useState(correction ? (circuitName ?? '') : '');
  const [city, setCity] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  async function onSend() {
    if (name.trim().length < 2) {
      setError(t.races.reportNeedName);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await suggestCircuit(kind, name, city || null, correction ? circuitId! : null);
      setSent(true);
    } catch (e) {
      // Les messages du serveur (plafond, doublon, mot interdit) sont écrits
      // pour être montrés tels quels.
      setError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setBusy(false);
    }
  }

  const kinds: CircuitReportKind[] = correction ? ['ferme', 'erreur'] : ['manquant'];

  return (
    <Screen
      title={t.races.reportTitle}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/kartings'))}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {sent ? (
          <>
            <Banner kind="ok" title={t.races.reportDone} />
            <Button
              label={t.races.reportBack}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/kartings'))}
            />
          </>
        ) : (
          <>
            {correction ? (
              <Card>
                <Label>{t.races.reportTarget}</Label>
                <Body style={styles.target}>{circuitName ?? '—'}</Body>
              </Card>
            ) : null}

            {kinds.length > 1 ? (
              <View>
                <Label style={styles.kindLabel}>{t.races.reportKindLabel}</Label>
                <View style={styles.kindRow}>
                  {kinds.map((k) => (
                    <Pressable
                      key={k}
                      accessibilityRole="button"
                      accessibilityState={{ selected: kind === k }}
                      onPress={() => setKind(k)}
                      style={[styles.kindItem, kind === k && styles.kindItemOn]}>
                      <Body style={kind === k ? styles.kindTxtOn : styles.kindTxt}>
                        {t.races.reportKinds[k]}
                      </Body>
                    </Pressable>
                  ))}
                </View>
              </View>
            ) : null}

            <Field
              label={t.races.reportName}
              placeholder={t.races.reportNamePh}
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
            />
            <Field
              label={t.races.reportCity}
              placeholder={t.races.reportCityPh}
              value={city}
              onChangeText={setCity}
              autoCapitalize="words"
            />

            {error ? <Banner kind="err" title={error} /> : null}
            <Button label={t.races.reportSend} onPress={onSend} disabled={busy} />
            <Muted style={styles.hint}>{t.races.mapAttribution}</Muted>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xxl },
  target: { fontWeight: '700', marginTop: 2 },
  kindLabel: { marginBottom: spacing.xs },
  kindRow: { flexDirection: 'row', gap: 1, borderRadius: radius.sharp, overflow: 'hidden', alignSelf: 'flex-start' },
  kindItem: { paddingVertical: spacing.xs, paddingHorizontal: spacing.md, backgroundColor: colors.surface },
  kindItemOn: { backgroundColor: colors.accent },
  kindTxt: { color: colors.inkDim },
  kindTxtOn: { color: '#fff', fontWeight: '700' },
  hint: { fontSize: 11 },
});
