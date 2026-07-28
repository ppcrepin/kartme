import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Card, SkeletonCard } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { listNotifications, markAllRead, routeFor, type AppNotification } from '@/lib/notifications';

/** Depuis quand ? Formulation courte, sans dépendance de localisation. */
function ago(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t.inbox.now;
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.round(hours / 24);
  return days < 7 ? `${days} j` : `${Math.round(days / 7)} sem.`;
}

/**
 * N1 — boîte de réception in-app (A5).
 *
 * Tout est marqué comme lu à l'ouverture : la pastille signale « il s'est passé
 * quelque chose », pas « tu n'as pas cliqué sur chaque ligne ». Les notifications
 * restent listées et distinguées visuellement pendant la session.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState(false);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      listNotifications()
        .then((rows) => {
          if (!active) return;
          setItems(rows);
          setError(false);
          // Le marquage suit l'affichage : si la lecture échoue, on ne « brûle »
          // pas des notifications que le pilote n'a jamais vues.
          if (rows.some((n) => !n.readAt)) markAllRead().catch(() => {});
        })
        .catch(() => {
          if (!active) return;
          setItems([]);
          setError(true);
        });
      return () => {
        active = false;
      };
    }, []),
  );

  return (
    <Screen title={t.inbox.title}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {items === null ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <Muted>{t.inbox.error}</Muted>
        ) : items.length === 0 ? (
          <View style={styles.empty}>
            <Heading>{t.inbox.emptyTitle}</Heading>
            <Muted>{t.inbox.emptyBody}</Muted>
          </View>
        ) : (
          items.map((n) => {
            const route = routeFor(n);
            const row = (
              <Card>
                <View style={styles.row}>
                  {/* Point rouge : non lue à l'arrivée sur l'écran. */}
                  {!n.readAt ? <View style={styles.dot} /> : <View style={styles.dotSpacer} />}
                  <View style={styles.flex}>
                    <Body style={styles.title}>{n.title}</Body>
                    <Muted>{n.body}</Muted>
                  </View>
                  <Muted style={styles.ago}>{ago(n.createdAt)}</Muted>
                </View>
              </Card>
            );
            return route ? (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                onPress={() => router.push(route as never)}>
                {row}
              </Pressable>
            ) : (
              <View key={n.id}>{row}</View>
            );
          })
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.sm, paddingBottom: spacing.xl, paddingTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  flex: { flex: 1, gap: 2 },
  title: { fontWeight: '700' },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent, marginTop: 6 },
  dotSpacer: { width: 8 },
  ago: { fontSize: 11 },
  empty: { gap: spacing.xs, paddingTop: spacing.lg },
});
