import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { CircuitsExplorer } from '@/components/circuits-explorer';
import { Screen } from '@/components/screen';
import { Button, Card } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { formatKm } from '@/lib/geo';
import { type Circuit } from '@/lib/races';

/**
 * Onglet Kartings — la carte des pistes de France, mode EXPLORATION.
 *
 * Toute la mécanique (carte, recherche, « près de moi », liste, récents) vit
 * dans CircuitsExplorer, partagé avec le choix sur carte de la création de
 * course. Ici on ne décide que de ce qu'un tap déclenche : la fiche du
 * circuit, avec « Créer une course ici » et le signalement.
 */
export default function KartingsScreen() {
  const router = useRouter();
  const [selected, setSelected] = useState<Circuit | null>(null);

  return (
    <Screen title={t.races.mapTitle}>
      <CircuitsExplorer
        selectedId={selected?.id ?? null}
        onSelect={setSelected}
        extra={
          selected ? (
            <Card>
              <View style={styles.sel}>
                <View style={styles.flex}>
                  <Body style={styles.selName}>{selected.name}</Body>
                  <Muted>
                    {selected.city ?? ''}
                    {/* La distance n'a de sens que si on connaît MA position —
                        l'explorateur ne la renvoie qu'à cette condition. */}
                    {typeof selected.km === 'number' ? ` · ${formatKm(selected.km)}` : ''}
                  </Muted>
                </View>
                <Button
                  label={t.races.mapCreateHere}
                  onPress={() =>
                    router.push({ pathname: '/race/create', params: { circuitId: selected.id } })
                  }
                />
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/circuit-report',
                    params: { circuitId: selected.id, circuitName: selected.name },
                  })
                }>
                <Muted style={styles.reportLink}>{t.races.reportCircuitFor}</Muted>
              </Pressable>
            </Card>
          ) : null
        }
        footer={
          <Pressable accessibilityRole="button" onPress={() => router.push('/circuit-report')}>
            <Body style={styles.reportBtn}>{t.races.reportCircuitLink}</Body>
          </Pressable>
        }
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  sel: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  selName: { fontWeight: '700' },
  reportLink: { marginTop: spacing.sm, color: colors.accent, fontWeight: '700' },
  reportBtn: { marginTop: spacing.lg, color: colors.accent, fontWeight: '700' },
  flex: { flex: 1, gap: 2 },
});
