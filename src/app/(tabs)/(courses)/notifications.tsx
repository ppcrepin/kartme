import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Button, Card, SkeletonCard } from '@/components/ui';
import { Body, Heading, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { listNotifications, markRead, routeFor, type AppNotification } from '@/lib/notifications';

/** Taille d'une page côté serveur (list_notifications). */
const PAGE = 50;

/** Depuis quand ? Formulation courte, sans dépendance de localisation. */
function ago(iso: string): string {
  // Toujours ARRONDI À LA BAISSE : « 1 h » pour 90 minutes, jamais « 2 h ».
  // Annoncer une notification plus vieille qu'elle ne l'est fait douter de
  // la fraîcheur de toute la boîte.
  const mins = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return t.inbox.now;
  if (mins < 60) return `${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days} j` : `${Math.floor(days / 7)} sem.`;
}

/**
 * N1 — boîte de réception in-app (A5).
 *
 * Les notifications AFFICHÉES sont marquées lues : la pastille signale « il
 * s'est passé quelque chose », pas « tu n'as pas cliqué sur chaque ligne ».
 * Elles restent listées, et le point rouge de la session en cours les distingue.
 */
export default function NotificationsScreen() {
  const router = useRouter();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [error, setError] = useState(false);
  // Une page pleine signale qu'il y en a peut-être d'autres derrière.
  const [more, setMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const load = useCallback(async (alive: () => boolean = () => true) => {
    setError(false);
    try {
      const rows = await listNotifications();
      if (!alive()) return;
      setItems(rows);
      setMore(rows.length === PAGE);
      // On ne marque lues QUE les lignes affichées : un marquage global
      // toucherait aussi les pages non encore chargées — des notifications
      // jamais vues, et qui n'auraient plus rien pour les signaler.
      const unseen = rows.filter((n) => !n.readAt).map((n) => n.id);
      if (unseen.length > 0) markRead(unseen).catch(() => {});
    } catch {
      if (!alive()) return;
      setItems([]);
      setError(true);
    }
  }, []);

  /** Page suivante : on empile, on ne remplace pas. */
  async function loadMore() {
    const last = items?.[items.length - 1];
    if (!last) return;
    setLoadingMore(true);
    try {
      const rows = await listNotifications(last.createdAt);
      setItems((prev) => [...(prev ?? []), ...rows]);
      setMore(rows.length === PAGE);
      const unseen = rows.filter((n) => !n.readAt).map((n) => n.id);
      if (unseen.length > 0) markRead(unseen).catch(() => {});
    } catch {
      setMore(false);
    } finally {
      setLoadingMore(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      let active = true;
      void load(() => active);
      return () => {
        active = false;
      };
    }, [load]),
  );

  return (
    <Screen
      title={t.inbox.title}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}>
      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {items === null ? (
          <>
            <SkeletonCard />
            <SkeletonCard />
          </>
        ) : error ? (
          <View style={styles.empty}>
            <Muted>{t.inbox.error}</Muted>
            <Button label={t.inbox.retry} variant="ghost" onPress={() => void load()} />
          </View>
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
                  {/* Chevron : distingue au premier coup d'œil les lignes qui
                      mènent quelque part de celles qui sont purement informatives. */}
                  {route ? <Muted style={styles.chevron}>›</Muted> : null}
                </View>
              </Card>
            );
            return route ? (
              <Pressable
                key={n.id}
                accessibilityRole="button"
                style={({ pressed }) => (pressed ? styles.pressed : undefined)}
                onPress={() => router.push(route)}>
                {row}
              </Pressable>
            ) : (
              <View key={n.id}>{row}</View>
            );
          })
        )}

        {more && !error ? (
          <Button
            label={loadingMore ? t.inbox.loading : t.inbox.more}
            variant="ghost"
            onPress={() => void loadMore()}
            disabled={loadingMore}
          />
        ) : null}
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
  chevron: { fontSize: 18, lineHeight: 20 },
  pressed: { opacity: 0.7 },
  empty: { gap: spacing.xs, paddingTop: spacing.lg },
});
