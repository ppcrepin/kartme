import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar, Button, Card, Field, GradeMedal } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import {
  acceptFriendRequest,
  deleteFriendship,
  listFriendships,
  searchPilots,
  type FriendEntry,
  type FriendLists,
  type Pilot,
} from '@/lib/friends';
import { gradeForElo } from '@/lib/grade';

const FRIENDS_CAP = 12; // liste d'amis plafonnée par défaut (perf + lisibilité à l'échelle)

export default function AmisScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Pilot[]>([]);
  const [searched, setSearched] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [lists, setLists] = useState<FriendLists>({ received: [], sent: [], friends: [] });

  const refresh = useCallback(() => {
    listFriendships()
      .then(setLists)
      .catch(() => {});
  }, []);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  // Recherche avec un léger débounce (les setState vivent dans le timeout).
  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      if (!active) return;
      if (query.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      try {
        const rows = await searchPilots(query);
        if (active) {
          setResults(rows);
          setSearched(true);
        }
      } catch {
        /* silencieux */
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(id);
    };
  }, [query]);

  async function onAccept(f: FriendEntry) {
    try {
      await acceptFriendRequest(f.friendshipId);
    } catch {
      /* réseau : la liste sera resynchronisée par le refresh */
    }
    refresh();
  }
  async function onDelete(f: FriendEntry) {
    try {
      await deleteFriendship(f.friendshipId);
    } catch {
      /* idem */
    }
    refresh();
  }

  const searching = query.trim().length >= 2;

  return (
    <Screen title={t.tabs.friends}>
      <Field label={t.friends.search} value={query} onChangeText={setQuery} autoCapitalize="none" />

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        {searching ? (
          /* ── F2 : résultats de recherche ── */
          <View style={styles.section}>
            {results.length === 0 && searched ? <Muted>{t.friends.searchEmpty}</Muted> : null}
            {results.map((p) => {
              const grade = gradeForElo(p.elo);
              return (
                <Pressable key={p.id} onPress={() => router.push(`/pilot/${p.id}`)} accessibilityRole="button">
                  <Card>
                    <View style={styles.row}>
                      <Avatar name={p.username} size={36} />
                      <View style={styles.flex}>
                        <Body>{p.username}</Body>
                        <Muted style={{ color: grade.color }}>
                          {grade.name}
                          {p.eloExact ? ` · ${p.elo}` : ''}
                        </Muted>
                      </View>
                      <GradeMedal grade={grade} size={28} />
                    </View>
                  </Card>
                </Pressable>
              );
            })}
          </View>
        ) : (
          /* ── F1 : reçues / envoyées / amis ── */
          <>
            {lists.received.length > 0 ? (
              <View style={styles.section}>
                <Label>{t.friends.received} · {lists.received.length}</Label>
                {lists.received.map((f) => (
                  <Card key={f.friendshipId}>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.row, styles.flex]}
                        onPress={() => router.push(`/pilot/${f.pilotId}`)}
                        accessibilityRole="button">
                        <Avatar name={f.username} size={36} />
                        <Body style={styles.flex}>{f.username}</Body>
                      </Pressable>
                      <Pressable onPress={() => onAccept(f)} accessibilityRole="button" style={styles.action}>
                        <Body style={styles.acceptTxt}>{t.friends.accept}</Body>
                      </Pressable>
                      <Pressable onPress={() => onDelete(f)} accessibilityRole="button" style={styles.action}>
                        <Muted>{t.friends.decline}</Muted>
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}

            {lists.sent.length > 0 ? (
              <View style={styles.section}>
                <Label>{t.friends.sent} · {lists.sent.length}</Label>
                {lists.sent.map((f) => (
                  <Card key={f.friendshipId}>
                    <View style={styles.row}>
                      <Pressable
                        style={[styles.row, styles.flex]}
                        onPress={() => router.push(`/pilot/${f.pilotId}`)}
                        accessibilityRole="button">
                        <Avatar name={f.username} size={36} />
                        <Body style={styles.flex}>{f.username}</Body>
                      </Pressable>
                      <Pressable onPress={() => onDelete(f)} accessibilityRole="button" style={styles.action}>
                        <Muted>{t.friends.cancel}</Muted>
                      </Pressable>
                    </View>
                  </Card>
                ))}
              </View>
            ) : null}

            <View style={styles.section}>
              <Label>{t.friends.list} · {lists.friends.length}</Label>
              {lists.friends.length === 0 ? (
                <Muted>{t.friends.listEmpty}</Muted>
              ) : (
                (showAllFriends ? lists.friends : lists.friends.slice(0, FRIENDS_CAP)).map((f) => {
                  const grade = gradeForElo(f.elo);
                  return (
                    <Pressable key={f.friendshipId} onPress={() => router.push(`/pilot/${f.pilotId}`)} accessibilityRole="button">
                      <Card>
                        <View style={styles.row}>
                          <Avatar name={f.username} size={36} />
                          <View style={styles.flex}>
                            <Body>{f.username}</Body>
                            <Muted style={{ color: grade.color }}>{grade.name} · {f.elo}</Muted>
                          </View>
                          <GradeMedal grade={grade} size={28} />
                        </View>
                      </Card>
                    </Pressable>
                  );
                })
              )}
              {lists.friends.length > FRIENDS_CAP && !showAllFriends ? (
                <Button
                  label={t.friends.seeAll.replace('%n', String(lists.friends.length))}
                  variant="ghost"
                  onPress={() => setShowAllFriends(true)}
                />
              ) : null}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.lg, paddingBottom: spacing.xxl * 2, paddingTop: spacing.sm },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  acceptTxt: { color: colors.pos, fontWeight: '800' },
});
