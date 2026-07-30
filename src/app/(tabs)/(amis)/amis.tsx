import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { ShareCard } from '@/components/share-card';
import { Avatar, Button, Card, Field, GradeMedal, Sheet } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { signedAvatarUrls } from '@/lib/avatar';
import { useAuth } from '@/lib/auth';
import { appBaseUrl } from '@/lib/url';
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
  const { session } = useAuth();
  // Lien d'amitié (A19) : en feuille glissante, comme le partage d'une course
  // — l'écran Amis vient d'être désencombré, le QR n'y vit pas en permanence.
  const [inviteOpen, setInviteOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Pilot[]>([]);
  const [searched, setSearched] = useState(false);
  const [showAllFriends, setShowAllFriends] = useState(false);
  const [lists, setLists] = useState<FriendLists>({ received: [], sent: [], friends: [] });
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());

  // Miroir des résultats de recherche, lisible depuis `refresh` sans le faire
  // dépendre de `results` (ce qui relancerait un refresh à chaque frappe).
  const resultsRef = useRef<Pilot[]>([]);

  const refresh = useCallback(() => {
    let alive = true;
    listFriendships()
      .then(async (l) => {
        if (!alive) return;
        setLists(l);
        // UNE signature pour les trois listes ET les résultats de recherche
        // encore affichés : les remplacer sans eux effaçait leurs photos au
        // simple retour sur l'écran, et un lien signé expire de toute façon.
        const got = await signedAvatarUrls([
          ...[...l.received, ...l.sent, ...l.friends].map((f) => f.avatarPath),
          ...resultsRef.current.map((r) => r.avatarPath),
        ]);
        if (alive) setAvatars(got);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  // On rend la fonction d'annulation : deux allers-retours rapprochés ne
  // peuvent plus faire arriver l'ancienne réponse après la récente.
  useFocusEffect(useCallback(() => refresh(), [refresh]));

  // Recherche avec un léger débounce (les setState vivent dans le timeout).
  useEffect(() => {
    let active = true;
    const id = setTimeout(async () => {
      if (!active) return;
      if (query.trim().length < 2) {
        setResults([]);
        resultsRef.current = [];
        setSearched(false);
        return;
      }
      try {
        const rows = await searchPilots(query);
        if (active) {
          setResults(rows);
          resultsRef.current = rows;
          setSearched(true);
          const got = await signedAvatarUrls(rows.map((r) => r.avatarPath));
          if (active && got.size > 0) setAvatars((cur) => new Map([...cur, ...got]));
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

      {/* ── Inviter quelqu'un qui n'a PAS encore l'app (demande PO
          2026-07-30) : il s'inscrit par ce lien et vous êtes amis en un tap,
          sans demande à valider. La recherche par pseudo au-dessus ne sert
          qu'aux pilotes déjà inscrits — c'était le trou du parcours. ── */}
      <Pressable
        onPress={() => setInviteOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={t.invite.shareTitle}>
        <Card style={styles.inviteRow}>
          <View style={styles.flex}>
            <Body style={styles.inviteTitle}>{t.invite.shareTitle}</Body>
            <Muted style={styles.inviteHint}>{t.invite.shareHint}</Muted>
          </View>
          <Body style={styles.chevron}>›</Body>
        </Card>
      </Pressable>

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
                      <Avatar
                        name={p.username}
                        size={36}
                        uri={p.avatarPath ? (avatars.get(p.avatarPath) ?? null) : null}
                        cacheKey={p.avatarPath}
                      />
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
                        <Avatar
                          name={f.username}
                          size={36}
                          uri={f.avatarPath ? (avatars.get(f.avatarPath) ?? null) : null}
                          cacheKey={f.avatarPath}
                        />
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
                        <Avatar
                          name={f.username}
                          size={36}
                          uri={f.avatarPath ? (avatars.get(f.avatarPath) ?? null) : null}
                          cacheKey={f.avatarPath}
                        />
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
                          <Avatar
                          name={f.username}
                          size={36}
                          uri={f.avatarPath ? (avatars.get(f.avatarPath) ?? null) : null}
                          cacheKey={f.avatarPath}
                        />
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

      <Sheet open={inviteOpen} onClose={() => setInviteOpen(false)} title={t.invite.shareTitle}>
        {/* Une seule consigne : `ShareCard` porte déjà la sienne. Et PAS de
            `?ref=` ajouté — l'identifiant est déjà dans le chemin, le
            doubler faisait un lien de 106 caractères qu'on ne dicte pas au
            bord d'une piste. Le parrainage est mesuré à l'arrivée par
            l'événement `friend_invite_accepted`. */}
        <ShareCard
          url={`${appBaseUrl()}invite/${session?.user.id ?? ''}`}
          title={t.invite.shareCta}
          noRef
        />
      </Sheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inviteTitle: { fontWeight: '700' },
  inviteHint: { fontSize: 11, lineHeight: 15 },
  chevron: { color: colors.inkDim2, fontSize: 20 },
  content: { gap: spacing.lg, paddingBottom: spacing.xxl * 2, paddingTop: spacing.sm },
  section: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  action: { paddingHorizontal: spacing.xs, paddingVertical: spacing.sm },
  acceptTxt: { color: colors.pos, fontWeight: '800' },
});
