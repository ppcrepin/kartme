import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Avatar, Button, Card } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { listParticipants, submitRaceResults, type Participant } from '@/lib/races';
import { t } from '@/i18n';

export default function RankScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listParticipants(id!, session?.user.id)
        .then(setParticipants)
        .catch(() => {});
    }, [id, session?.user.id]),
  );

  function toggle(pid: string) {
    setOrder((prev) => (prev.includes(pid) ? prev.filter((x) => x !== pid) : [...prev, pid]));
  }

  async function onValidate() {
    setBusy(true);
    setError(null);
    try {
      await submitRaceResults(id!, order);
      router.replace(`/race/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setBusy(false);
    }
  }

  const complete = order.length === participants.length && participants.length >= 2;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.races.rankingTitle}</Title>
        <Muted>{t.races.rankingHint}</Muted>

        <View style={styles.list}>
          {participants.map((p) => {
            const pos = order.indexOf(p.id);
            const ranked = pos >= 0;
            return (
              <Pressable key={p.id} onPress={() => toggle(p.id)} accessibilityRole="button">
                <Card style={[styles.pilot, ranked && styles.pilotRanked]}>
                  <View style={[styles.pos, ranked && styles.posOn]}>
                    <Body style={[styles.posTxt, ranked && styles.posTxtOn]}>{ranked ? pos + 1 : '·'}</Body>
                  </View>
                  <Avatar name={p.name} size={36} />
                  <Body style={styles.flex}>
                    {p.name}
                    {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                  </Body>
                </Card>
              </Pressable>
            );
          })}
        </View>

        {error ? <Body style={styles.error}>{error}</Body> : null}

        <View style={styles.actions}>
          {order.length > 0 ? <Button label={t.races.reset} variant="ghost" onPress={() => setOrder([])} /> : null}
          <Button label={t.races.validateRanking} onPress={onValidate} disabled={!complete || busy} />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  list: { gap: spacing.sm, marginTop: spacing.sm },
  pilot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  pilotRanked: { borderColor: colors.accent },
  pos: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line2 },
  posOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  posTxt: { fontFamily: fonts.serifBlack, color: colors.inkDim2 },
  posTxtOn: { color: '#fff' },
  flex: { flex: 1 },
  error: { color: colors.accent },
  actions: { gap: spacing.sm, marginTop: spacing.md },
});
