import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BadgeIcon, BoutonRetour } from '@/components/ui';
import { Label, Muted, Title } from '@/components/ui/text';
import { colors, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { BADGE_KEYS, listBadges, type BadgeKey, type UnlockedBadge } from '@/lib/badges';
import { useExplications } from '@/lib/explications';

/**
 * R3 + R4 — catalogue des 12 badges ; taper un badge ouvre son détail.
 *
 * Le détail s'ouvre en FEUILLE et non plus dans une carte sous la grille :
 * celle-ci se dessinait au bas d'une grille de douze cellules, donc hors écran
 * dès qu'on tapait un badge des deux premières rangées. On tapait, il ne se
 * passait rien de visible. C'est le même défaut que la liste d'ajout de
 * pilotes, corrigé deux fois déjà : ce qui répond à un tap doit se voir sans
 * avoir à défiler.
 */
export default function BadgesScreen() {
  const router = useRouter();
  const explications = useExplications();
  const [unlocked, setUnlocked] = useState<Map<BadgeKey, UnlockedBadge> | null>(null);

  useEffect(() => {
    listBadges()
      .then(setUnlocked)
      .catch(() => setUnlocked(new Map()));
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BoutonRetour onPress={() => (router.canGoBack() ? router.back() : router.replace('/profil'))} />
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
            const got = unlocked?.get(key);
            const item = t.badges.items[key];
            return (
              <Pressable
                key={key}
                onPress={() => explications?.expliquerBadge(key, got?.unlockedAt ?? null)}
                accessibilityRole="button"
                accessibilityLabel={`${item.name}${got ? '' : ` — ${t.badges.locked}`}`}
                style={styles.cell}>
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
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  progress: { marginTop: spacing.xs },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
    justifyContent: 'flex-start',
  },
  cell: { width: 96, alignItems: 'center', gap: spacing.xs, padding: spacing.xs, borderRadius: radius.card },
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
});
