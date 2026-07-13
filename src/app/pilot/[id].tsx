import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EloCurve } from '@/components/elo-curve';
import { Avatar, BadgeIcon, Button, Card, GradeMedal, Tag } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { listBadges, type BadgeKey, type UnlockedBadge } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';
import {
  getEloCurve,
  getRaceHistory,
  statsFromHistory,
  type EloPoint,
  type HistoryEntry,
} from '@/lib/profile';
import {
  acceptFriendRequest,
  blockPilot,
  deleteFriendship,
  faceToFace,
  getFriendshipWith,
  getPilot,
  reportPilot,
  sendFriendRequest,
  type FaceToFace,
  type FriendshipState,
  type Pilot,
  type ReportCategory,
} from '@/lib/friends';
import { gradeForElo } from '@/lib/grade';

const REPORT_CATEGORIES: ReportCategory[] = [
  'comportement',
  'fausse_course',
  'classement',
  'usurpation',
  'autre',
];

export default function PilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();

  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [friendship, setFriendship] = useState<FriendshipState>({ status: 'none', friendshipId: null });
  const [duel, setDuel] = useState<FaceToFace | null>(null);
  const [curve, setCurve] = useState<EloPoint[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [badges, setBadges] = useState<Map<BadgeKey, UnlockedBadge>>(new Map());
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!id) return;
    const [p, f, d] = await Promise.all([getPilot(id), getFriendshipWith(id), faceToFace(id)]);
    setPilot(p);
    setFriendship(f);
    setDuel(d);
    // Stats/courbe/historique : seulement si le profil est pleinement visible
    // (public ou ami) — sinon la confidentialité prime.
    if (p?.eloExact) {
      const [c, h, b] = await Promise.all([
        getEloCurve(id),
        getRaceHistory(id),
        listBadges(id).catch(() => new Map<BadgeKey, UnlockedBadge>()),
      ]);
      setCurve(c);
      setHistory(h);
      setBadges(b);
    } else {
      setCurve([]);
      setHistory([]);
      setBadges(new Map());
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      // Règle « si c'est moi → mon profil (R1) ».
      if (id && session?.user.id === id) {
        router.replace('/(tabs)/profil');
        return;
      }
      refresh().catch(() => {});
    }, [id, session?.user.id, router, refresh]),
  );

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onBlock() {
    setBusy(true);
    try {
      await blockPilot(id!);
      setBlocked(true);
    } finally {
      setBusy(false);
    }
  }

  async function onReport(category: ReportCategory) {
    setBusy(true);
    try {
      await reportPilot(id!, category);
      setReported(true);
      setReporting(false);
    } finally {
      setBusy(false);
    }
  }

  const grade = pilot ? gradeForElo(pilot.elo) : null;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" style={styles.back}>
          <Muted>←</Muted>
        </Pressable>

        {!pilot || !grade ? (
          <Muted>…</Muted>
        ) : blocked ? (
          <Muted>{t.friends.blocked}</Muted>
        ) : (
          <>
            {/* Identité */}
            <Card>
              <View style={styles.identity}>
                <Avatar name={pilot.username} size={52} />
                <View style={styles.flex}>
                  <Title style={styles.username}>{pilot.username}</Title>
                  <Muted style={{ color: grade.color }}>
                    {grade.name}
                    {pilot.eloExact ? ` · ${pilot.elo}` : ''}
                  </Muted>
                </View>
                <GradeMedal grade={grade} size={46} />
              </View>
              {pilot.isPrivate && !pilot.eloExact ? (
                <Muted style={styles.privateNote}>{t.friends.privateProfile}</Muted>
              ) : null}
            </Card>

            {/* Relation */}
            {friendship.status === 'none' ? (
              <Button label={t.friends.add} onPress={() => act(() => sendFriendRequest(id!))} disabled={busy} />
            ) : null}
            {friendship.status === 'pending_sent' ? (
              <View style={styles.pendingRow}>
                <Muted>{t.friends.pendingSent}</Muted>
                <Button
                  label={t.friends.cancel}
                  variant="ghost"
                  onPress={() => act(() => deleteFriendship(friendship.friendshipId!))}
                  disabled={busy}
                />
              </View>
            ) : null}
            {friendship.status === 'pending_received' ? (
              <View style={styles.actionsRow}>
                <View style={styles.flex}>
                  <Button
                    label={t.friends.accept}
                    onPress={() => act(() => acceptFriendRequest(friendship.friendshipId!))}
                    disabled={busy}
                  />
                </View>
                <View style={styles.flex}>
                  <Button
                    label={t.friends.decline}
                    variant="ghost"
                    onPress={() => act(() => deleteFriendship(friendship.friendshipId!))}
                    disabled={busy}
                  />
                </View>
              </View>
            ) : null}
            {friendship.status === 'accepted' ? (
              <View style={styles.pendingRow}>
                <Body style={styles.friendsBadge}>{t.friends.friendsBadge}</Body>
                <Button
                  label={t.friends.remove}
                  variant="ghost"
                  onPress={() => act(() => deleteFriendship(friendship.friendshipId!))}
                  disabled={busy}
                />
              </View>
            ) : null}

            {/* Face-à-face */}
            <Card>
              <Label>{t.friends.faceToFace}</Label>
              {duel && duel.races > 0 ? (
                <View style={styles.duelRow}>
                  <View style={styles.duelSide}>
                    <Body style={styles.duelScore}>{duel.myWins}</Body>
                    <Muted>{t.friends.you}</Muted>
                  </View>
                  <Body style={styles.duelDash}>—</Body>
                  <View style={styles.duelSide}>
                    <Body style={styles.duelScore}>{duel.theirWins}</Body>
                    <Muted numberOfLines={1}>{pilot.username}</Muted>
                  </View>
                </View>
              ) : (
                <Muted style={styles.duelEmpty}>{t.friends.faceToFaceEmpty}</Muted>
              )}
            </Card>

            {/* Stats, courbe & historique (profil public ou ami) */}
            {pilot.eloExact ? (
              <>
                {(() => {
                  const stats = statsFromHistory(history);
                  return (
                    <View style={styles.statsRow}>
                      <StatTile label={t.profile.races} value={stats.races} />
                      <StatTile label={t.profile.wins} value={stats.wins} />
                      <StatTile label={t.profile.podiums} value={stats.podiums} />
                    </View>
                  );
                })()}

                {curve.length > 0 ? (
                  <Card>
                    <Label>{t.profile.curve}</Label>
                    <EloCurve points={curve} />
                  </Card>
                ) : null}

                {badges.size > 0 ? (
                  <Card>
                    <Label>{t.profile.badges}</Label>
                    <View style={styles.badgesRow}>
                      {[...badges.keys()].map((key) => (
                        <View
                          key={key}
                          style={styles.badgeMedal}
                          accessibilityLabel={t.badges.items[key].name}>
                          <BadgeIcon badge={key} size={26} color={colors.accent} />
                        </View>
                      ))}
                    </View>
                  </Card>
                ) : null}

                {history.length === 0 ? (
                  <Muted>{t.profile.historyEmpty}</Muted>
                ) : (
                  <View style={styles.historySection}>
                    <Label>{t.profile.historyOther}</Label>
                    {history.map((h, i) => (
                      <Pressable
                        key={`${h.raceId}-${i}`}
                        onPress={() => h.raceId && router.push(`/race/${h.raceId}`)}
                        accessibilityRole="button">
                        <Card>
                          <View style={styles.historyRow}>
                            <Body style={styles.historyPos}>{h.position}</Body>
                            <View style={styles.flex}>
                              <Body>{h.circuitName ?? t.races.noCircuit}</Body>
                              {h.scheduledAt ? <Muted>{formatRaceDate(h.scheduledAt)}</Muted> : null}
                            </View>
                            <Body
                              style={[
                                styles.historyDelta,
                                { color: h.eloDelta > 0 ? colors.pos : h.eloDelta < 0 ? colors.accent : colors.inkDim },
                              ]}>
                              {h.eloDelta > 0 ? `▲ +${h.eloDelta}` : h.eloDelta < 0 ? `▼ ${h.eloDelta}` : '—'}
                            </Body>
                          </View>
                        </Card>
                      </Pressable>
                    ))}
                  </View>
                )}
              </>
            ) : null}

            {/* Signalement / blocage — bloquer reste possible après un signalement */}
            {reporting ? (
              <Card>
                <Label>{t.friends.reportTitle}</Label>
                <View style={styles.reportRow}>
                  {REPORT_CATEGORIES.map((c) => (
                    <Tag key={c} label={t.friends.reportCategories[c]} onPress={() => onReport(c)} />
                  ))}
                </View>
              </Card>
            ) : (
              <View style={styles.footCol}>
                {reported ? <Muted style={styles.center}>{t.friends.reportSent}</Muted> : null}
                <View style={styles.footRow}>
                  {!reported ? (
                    <Pressable onPress={() => setReporting(true)} accessibilityRole="button" style={styles.footBtn}>
                      <Muted>{t.friends.report}</Muted>
                    </Pressable>
                  ) : null}
                  <Pressable onPress={onBlock} accessibilityRole="button" style={styles.footBtn}>
                    <Muted>{t.friends.block}</Muted>
                  </Pressable>
                </View>
              </View>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card style={styles.stat}>
      <Body style={styles.statValue}>{value}</Body>
      <Muted style={styles.statLabel}>{label}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  flex: { flex: 1 },
  identity: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  username: { fontSize: 22, lineHeight: 26 },
  privateNote: { marginTop: spacing.md, fontSize: 12 },
  pendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md },
  actionsRow: { flexDirection: 'row', gap: spacing.sm },
  friendsBadge: { color: colors.pos, fontWeight: '800' },
  duelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: spacing.xl, marginTop: spacing.md },
  duelSide: { alignItems: 'center' },
  duelScore: { fontFamily: fonts.serifBlack, fontSize: 36, color: colors.ink },
  duelDash: { fontFamily: fonts.serifBlack, fontSize: 24, color: colors.inkDim2 },
  duelEmpty: { marginTop: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statValue: { fontFamily: fonts.serifBlack, fontSize: 24, color: colors.ink },
  statLabel: { fontSize: 11 },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  badgeMedal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySection: { gap: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyPos: { fontFamily: fonts.serifBlack, fontSize: 18, width: 22, textAlign: 'center', color: colors.ink },
  historyDelta: { fontWeight: '800' },
  reportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  footCol: { gap: spacing.sm },
  footRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  footBtn: { paddingVertical: spacing.sm },
  center: { textAlign: 'center' },
});
