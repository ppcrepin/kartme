import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, ListRow, SkeletonCard } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { formatRaceDate } from '@/lib/datetime';
import { getRaceHistory, type HistoryEntry } from '@/lib/profile';

const fmtDelta = (d: number) => (d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—');
const deltaColor = (d: number) => (d > 0 ? colors.pos : d < 0 ? colors.accent : colors.inkDim);

/**
 * Historique complet des courses — écran dédié (décision PO 2026-07-30) :
 * le profil n'en montre que les 5 dernières pour tenir d'un seul coup,
 * l'intégralité se parcourt ici, où le défilement est le geste attendu.
 */
export default function HistoriqueScreen() {
  const router = useRouter();
  const [history, setHistory] = useState<HistoryEntry[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    getRaceHistory()
      .then(setHistory)
      .catch(() => {
        // Un échec réseau n'est PAS « aucune course » : le dire, et réessayer.
        setHistory([]);
        setError(true);
      });
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  return (
    <Screen
      title={t.profile.history}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/profil'))}>
      {history === null ? (
        <SkeletonCard />
      ) : error ? (
        <View style={styles.erreur}>
          <Muted>{t.inbox.error}</Muted>
          <Button label={t.inbox.retry} variant="ghost" onPress={load} />
        </View>
      ) : history.length === 0 ? (
        <Muted>{t.profile.historyEmpty}</Muted>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
          <Card>
            {history.map((h, i) => (
              <ListRow
                key={`${h.raceId}-${i}`}
                first={i === 0}
                onPress={h.raceId ? () => router.push(`/race/${h.raceId}`) : undefined}
                left={
                  <Body style={[styles.pos, h.dnf && styles.posDnf]}>
                    {h.dnf ? t.races.dnfShort : h.position}
                  </Body>
                }
                title={h.circuitName ?? t.races.noCircuit}
                sub={h.scheduledAt ? formatRaceDate(h.scheduledAt) : undefined}
                right={
                  <View style={styles.elo}>
                    <Body style={[styles.delta, { color: deltaColor(h.eloDelta) }]}>
                      {fmtDelta(h.eloDelta)}
                    </Body>
                    <Muted style={styles.after}>{h.eloAfter}</Muted>
                  </View>
                }
              />
            ))}
          </Card>
        </ScrollView>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl },
  erreur: { gap: spacing.sm, alignItems: 'flex-start' },
  pos: { fontFamily: fonts.serifBlack, fontSize: 16, minWidth: 22, textAlign: 'center', color: colors.ink },
  posDnf: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '800', color: colors.inkDim2 },
  elo: { alignItems: 'flex-end' },
  delta: { fontWeight: '800', fontSize: 13 },
  after: { fontSize: 11 },
});
