import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { countOpenReports } from '@/lib/moderation';
import { getMyProfile } from '@/lib/profile';

/** S1 — hub des réglages : Compte, Notifications, Aide & légal (+ Modération si modérateur). */
export default function SettingsScreen() {
  const router = useRouter();
  const [isModerator, setIsModerator] = useState(false);
  const [openReports, setOpenReports] = useState(0);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      getMyProfile()
        .then(async (p) => {
          if (!active || !p?.isModerator) return;
          setIsModerator(true);
          setOpenReports(await countOpenReports().catch(() => 0));
        })
        .catch(() => {});
      return () => {
        active = false;
      };
    }, []),
  );

  const rows: { key: string; label: string; sub: string; onPress?: () => void; soon?: boolean }[] = [
    {
      key: 'account',
      label: t.settings.account,
      sub: t.settings.accountSub,
      onPress: () => router.push('/settings/compte'),
    },
    {
      key: 'notifications',
      label: t.settings.notifications,
      sub: t.settings.notificationsSub,
      onPress: () => router.push('/settings/notifications'),
    },
    {
      key: 'help',
      label: t.settings.help,
      sub: t.settings.helpSub,
      onPress: () => router.push('/settings/aide'),
    },
  ];

  if (isModerator) {
    rows.push({
      key: 'moderation',
      label: openReports > 0 ? `${t.settings.moderation} (${openReports})` : t.settings.moderation,
      sub: t.settings.moderationSub,
      onPress: () => router.push('/settings/moderation'),
    });
    rows.push({
      key: 'stats',
      label: t.settings.stats,
      sub: t.settings.statsSub,
      onPress: () => router.push('/settings/stats'),
    });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/profil'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.settings.title}</Title>

        <View style={styles.list}>
          {rows.map((row) => (
            <Pressable
              key={row.key}
              onPress={row.onPress}
              disabled={row.soon}
              accessibilityRole="button"
              accessibilityState={{ disabled: !!row.soon }}>
              <Card style={row.soon ? styles.soonCard : undefined}>
                <View style={styles.row}>
                  <View style={styles.flex}>
                    <Body>{row.label}</Body>
                    <Muted>{row.sub}</Muted>
                  </View>
                  {!row.soon ? <Muted style={styles.chevron}>›</Muted> : null}
                </View>
              </Card>
            </Pressable>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  list: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  chevron: { fontSize: 20, color: colors.inkDim },
  soonCard: { opacity: 0.5 },
});
