import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Banner, Card } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { getMetrics, type Metrics } from '@/lib/analytics';

function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={styles.stat}>
      <Body style={styles.statValue}>{value}</Body>
      <Muted style={styles.statLabel}>{label}</Muted>
    </View>
  );
}

const pct = (v: number | null) => (v == null ? '—' : `${v}%`);

/** S6 — Tableau de bord (modérateur) : métriques maison (activation, rétention, K-factor). */
export default function StatsScreen() {
  const router = useRouter();
  const [m, setM] = useState<Metrics | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      getMetrics()
        .then((data) => {
          setM(data);
          setError(null);
        })
        .catch((e) => setError(e instanceof Error ? e.message : 'Erreur'));
    }, []),
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.stats.title}</Title>

        {error ? <Banner kind="err" title={error} /> : null}
        {!m ? (
          <Muted>…</Muted>
        ) : (
          <>
            <Label>{t.stats.overview}</Label>
            <Card>
              <View style={styles.grid}>
                <Stat value={m.users_total} label={t.stats.users} />
                <Stat value={m.active_7d} label={t.stats.active7} />
                <Stat value={m.races_completed} label={t.stats.races} />
                <Stat value={m.ghosts_total} label={t.stats.ghosts} />
              </View>
            </Card>

            <Label>{t.stats.viralityTitle}</Label>
            <Card>
              <View style={styles.grid}>
                <Stat value={m.k_factor == null ? '—' : m.k_factor.toFixed(2)} label={t.stats.kFactor} />
                <Stat value={m.referred_signups} label={t.stats.referred} />
                <Stat value={m.shares} label={t.stats.shares} />
                <Stat value={m.signups_tracked} label={t.stats.signups} />
                {/* Le lien d'ami (A19) : deux chiffres distincts, parce qu'un
                    tap entre habitués n'est pas de la croissance. */}
                <Stat value={m.invite_accepts} label={t.stats.inviteAccepts} />
                <Stat value={m.invite_signups} label={t.stats.inviteSignups} />
              </View>
              <Muted style={styles.note}>{t.stats.viralityNote}</Muted>
              <Muted style={styles.note}>{t.stats.inviteNote}</Muted>
            </Card>

            <Label>{t.stats.activationTitle}</Label>
            <Card>
              <View style={styles.grid}>
                <Stat value={pct(m.activation_rate)} label={t.stats.activationRate} />
                <Stat value={pct(m.raced_rate)} label={t.stats.racedRate} />
              </View>
            </Card>

            <Label>{t.stats.retentionTitle}</Label>
            <Card>
              <View style={styles.grid}>
                <Stat value={pct(m.retention_7d)} label={t.stats.retention7} />
                <Stat value={m.cohort_7d} label={t.stats.cohort7} />
              </View>
              <Muted style={styles.note}>{t.stats.retentionNote}</Muted>
            </Card>

            <Label>{t.stats.engagementTitle}</Label>
            <Card>
              <View style={styles.grid}>
                <Stat value={m.rematches} label={t.stats.rematches} />
                <Stat value={m.friends_accepted} label={t.stats.friends} />
                <Stat value={m.badges_unlocked} label={t.stats.badges} />
              </View>
            </Card>

            <Label>{t.stats.errorsTitle}</Label>
            <Card>
              <Stat value={m.errors_7d} label={t.stats.errors7} />
              {m.recent_errors.length > 0 ? (
                <View style={styles.errList}>
                  {m.recent_errors.map((e, i) => (
                    <View key={i} style={styles.errRow}>
                      <Muted style={styles.errMsg} numberOfLines={2}>
                        {e.message}
                      </Muted>
                      <Muted style={styles.errCtx}>{e.context ?? ''}</Muted>
                    </View>
                  ))}
                </View>
              ) : (
                <Muted style={styles.note}>{t.stats.noErrors}</Muted>
              )}
            </Card>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.lg },
  stat: { minWidth: 72, gap: 2 },
  statValue: { fontFamily: fonts.serifBlack, fontSize: 24, color: colors.ink },
  statLabel: { fontSize: 12 },
  note: { marginTop: spacing.sm },
  errList: { marginTop: spacing.sm, gap: spacing.sm },
  errRow: { borderTopColor: colors.line, borderTopWidth: 1, paddingTop: spacing.xs },
  errMsg: { color: colors.ink },
  errCtx: { fontSize: 11 },
});
