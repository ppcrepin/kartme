import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgeIcon, Card } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { BADGE_KEYS, listBadges, type BadgeKey, type UnlockedBadge } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';

/** R3 + R4 — catalogue des 12 badges ; taper un badge ouvre son détail. */
export default function BadgesScreen() {
  const router = useRouter();
  const [unlocked, setUnlocked] = useState<Map<BadgeKey, UnlockedBadge> | null>(null);
  const [selected, setSelected] = useState<BadgeKey | null>(null);

  useEffect(() => {
    listBadges()
      .then(setUnlocked)
      .catch(() => setUnlocked(new Map()));
  }, []);

  const detail = selected
    ? { key: selected, item: t.badges.items[selected], got: unlocked?.get(selected) }
    : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profil'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={10}
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.badges.title}</Title>
        <Muted>{t.badges.subtitle}</Muted>
        {unlocked ? (
          <Label style={styles.progress}>
            {t.badges.progress
              .replace('%u', String(unlocked.size))
              .replace('%t', String(BADGE_KEYS.length))}
          </Label>
        ) : null}

        <View style={styles.grid}>
          {BADGE_KEYS.map((key) => {
            const got = unlocked?.has(key) ?? false;
            const item = t.badges.items[key];
            return (
              <Pressable
                key={key}
                onPress={() => setSelected(key)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}${got ? '' : ` — ${t.badges.locked}`}`}
                style={[styles.cell, selected === key && styles.cellSelected]}>
                <View style={[styles.medal, got ? styles.medalOn : styles.medalOff]}>
                  <BadgeIcon badge={key} size={34} color={got ? colors.accent : colors.inkDim} />
                </View>
                <Muted style={[styles.cellName, got && styles.cellNameOn]} numberOfLines={2}>
                  {item.name}
                </Muted>
              </Pressable>
            );
          })}
        </View>

        {detail ? (
          <Card style={detail.got ? styles.detailOn : undefined}>
            <View style={styles.detailRow}>
              <BadgeIcon
                badge={detail.key}
                size={44}
                color={detail.got ? colors.accent : colors.inkDim}
              />
              <View style={styles.flex}>
                <Body style={[styles.detailName, detail.got && { color: colors.accent }]}>
                  {detail.item.name}
                </Body>
                <Muted>{detail.item.condition}</Muted>
                <Muted style={styles.detailDate}>
                  {detail.got
                    ? t.badges.unlockedOn.replace('%d', formatRaceDate(detail.got.unlockedAt))
                    : t.badges.locked}
                </Muted>
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  progress: { marginTop: spacing.xs },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-start',
  },
  cell: { width: 96, alignItems: 'center', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.card },
  cellSelected: { backgroundColor: colors.surface },
  medal: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
  },
  medalOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  medalOff: { borderColor: colors.line2, backgroundColor: colors.surface2, opacity: 0.7 },
  cellName: { fontSize: 11, textAlign: 'center' },
  cellNameOn: { color: colors.ink },
  detailOn: { borderColor: colors.accent },
  detailRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  detailName: { fontWeight: '800' },
  detailDate: { marginTop: spacing.xs, fontSize: 12 },
  flex: { flex: 1 },
});
