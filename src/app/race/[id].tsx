import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  AccessibilityInfo,
  Animated,
  Pressable,
  ScrollView,
  StyleSheet,
  useAnimatedValue,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CircuitPicker } from '@/components/circuit-picker';
import { DateTimeField } from '@/components/date-time-field';
import { Podium } from '@/components/podium';
import { ShareCard } from '@/components/share-card';
import { Avatar, Button, Card, Field, GradeMedal } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { formatRaceDate } from '@/lib/datetime';
import { pairwiseBreakdown } from '@/lib/elo';
import { listFriends, type FriendEntry } from '@/lib/friends';
import { gradeForElo } from '@/lib/grade';
import {
  addGhostParticipant,
  addProfileParticipant,
  addSelfParticipant,
  deleteRace,
  getRace,
  listParticipants,
  listResults,
  onRaceUpdate,
  removeParticipant,
  updateRace,
  type Circuit,
  type Participant,
  type Race,
  type RaceResult,
} from '@/lib/races';
import { appBaseUrl } from '@/lib/url';
import { validateGhostName } from '@/lib/username';

const MEDALS = ['🥇', '🥈', '🥉'];
const fmtDelta = (d: number) => (d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—');
const deltaColor = (d: number) => (d > 0 ? colors.pos : d < 0 ? colors.accent : colors.inkDim);

/** Drapeau d'attente, pulsation douce (statique si « réduire les animations »). */
function WaitingFlag() {
  const opacity = useAnimatedValue(1);

  useEffect(() => {
    let animation: Animated.CompositeAnimation | null = null;
    AccessibilityInfo.isReduceMotionEnabled?.()
      .then((reduced) => {
        if (reduced) return;
        animation = Animated.loop(
          Animated.sequence([
            Animated.timing(opacity, { toValue: 0.35, duration: 900, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 900, useNativeDriver: true }),
          ]),
        );
        animation.start();
      })
      .catch(() => {});
    return () => animation?.stop();
  }, [opacity]);

  return (
    <Card style={styles.waiting}>
      <Animated.Text style={[styles.flag, { opacity }]}>🏁</Animated.Text>
      <Body style={styles.waitingTitle}>{t.races.waitingTitle}</Body>
      <Muted style={styles.waitingHint}>{t.races.waitingHint}</Muted>
    </Card>
  );
}

export default function RaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  const selfId = session?.user.id;

  const [race, setRace] = useState<Race | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [results, setResults] = useState<RaceResult[]>([]);
  const [friends, setFriends] = useState<FriendEntry[]>([]);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editCircuit, setEditCircuit] = useState<Circuit | null>(null);
  const [editWhen, setEditWhen] = useState<Date>(() => new Date());

  const refresh = useCallback(async () => {
    if (!id) return;
    const [r, p, res, f] = await Promise.all([
      getRace(id),
      listParticipants(id, selfId),
      listResults(id, selfId),
      listFriends().catch(() => [] as FriendEntry[]),
    ]);
    setRace(r);
    setParticipants(p);
    setResults(res);
    setFriends(f);
  }, [id, selfId]);

  useFocusEffect(
    useCallback(() => {
      refresh().catch(() => {});
      // Temps réel : l'écran bascule tout seul quand l'admin valide.
      const unsubscribe = onRaceUpdate(id!, () => {
        refresh().catch(() => {});
      });
      return unsubscribe;
    }, [refresh, id]),
  );

  const isAdmin = !!race && race.admin_id === selfId;
  const completed = race?.status === 'completed';
  const selfParticipating = participants.some((p) => p.isSelf);

  async function onAddPilot() {
    const check = validateGhostName(name);
    if (!check.ok) {
      setNameError(t.auth.errors[check.error ?? 'generic']);
      return;
    }
    setNameError(null);
    setBusy(true);
    try {
      await addGhostParticipant(id!, check.value);
      setName('');
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(participationId: string) {
    await removeParticipant(participationId);
    await refresh();
  }

  async function onAddFriend(profileId: string) {
    setBusy(true);
    try {
      await addProfileParticipant(id!, profileId);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onToggleSelf() {
    const mine = participants.find((p) => p.isSelf);
    if (mine) await removeParticipant(mine.id);
    else await addSelfParticipant(id!);
    await refresh();
  }

  function startEdit() {
    if (!race) return;
    setEditCircuit(race.circuit);
    setEditWhen(new Date(race.scheduled_at));
    setEditing(true);
  }

  async function onSaveEdit() {
    if (!editCircuit) return;
    await updateRace(id!, editCircuit.id, editWhen);
    setEditing(false);
    await refresh();
  }

  async function onDelete() {
    await deleteRace(id!);
    router.replace('/(tabs)');
  }

  const shareUrl = `${appBaseUrl()}race/${id}`;

  // Résumé texte des résultats (podium) pour le partage.
  const resultsMessage = completed
    ? [
        `🏁 ${race?.circuit?.name ?? t.races.noCircuit} · ${formatRaceDate(race!.scheduled_at)}`,
        results
          .slice(0, 3)
          .map((r) => `${MEDALS[r.position - 1] ?? r.position} ${r.name} ${r.eloDelta > 0 ? '+' : ''}${r.eloDelta}`)
          .join(' · '),
      ].join('\n')
    : undefined;

  // Entrées pour le détail par paire (C10), recalculé à l'affichage.
  const pairInputs = results.map((r) => ({ name: r.name, eloBefore: r.eloBefore, position: r.position }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable onPress={() => router.replace('/(tabs)')} accessibilityRole="button" style={styles.back}>
          <Muted>← {t.tabs.races}</Muted>
        </Pressable>

        {!race ? (
          <Muted>…</Muted>
        ) : editing ? (
          <View style={styles.section}>
            <Title>{t.races.edit}</Title>
            <CircuitPicker value={editCircuit} onChange={setEditCircuit} />
            <DateTimeField label={t.races.date} value={editWhen} onChange={setEditWhen} />
            <Button label={t.races.save} onPress={onSaveEdit} />
            <Button label={t.common.cancel} variant="ghost" onPress={() => setEditing(false)} />
          </View>
        ) : (
          <>
            <View style={styles.head}>
              <View style={styles.flex}>
                <Title>{race.circuit?.name ?? t.races.noCircuit}</Title>
                <Muted>{formatRaceDate(race.scheduled_at)}</Muted>
              </View>
              {isAdmin && !completed ? (
                <Pressable onPress={startEdit} accessibilityRole="button">
                  <Muted style={styles.editLink}>{t.races.edit}</Muted>
                </Pressable>
              ) : null}
            </View>

            {completed ? (
              /* ── Résultats (C9) ── */
              <View style={styles.section}>
                <Label>{t.races.results}</Label>
                <Podium results={results} />

                {results.map((r) => {
                  const grade = gradeForElo(r.eloAfter);
                  const isOpen = expanded === r.position;
                  const self = pairInputs.find((p) => p.position === r.position);
                  const duels = isOpen && self ? pairwiseBreakdown(self, pairInputs) : [];
                  return (
                    <Pressable
                      key={r.position}
                      onPress={() => setExpanded(isOpen ? null : r.position)}
                      accessibilityRole="button">
                      <Card style={isOpen ? styles.cardOpen : undefined}>
                        <View style={styles.resultRow}>
                          <Body style={styles.posNum}>{r.position}</Body>
                          <Avatar name={r.name} size={34} />
                          <View style={styles.flex}>
                            <Body>
                              {r.name}
                              {r.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                            </Body>
                            <Muted style={{ color: grade.color }}>
                              {grade.name} · {r.eloAfter}
                            </Muted>
                          </View>
                          <Body style={[styles.delta, { color: deltaColor(r.eloDelta) }]}>
                            {fmtDelta(r.eloDelta)}
                          </Body>
                        </View>

                        {isOpen ? (
                          /* ── Détail par paire (C10) ── */
                          <View style={styles.pairBox}>
                            <Label>{t.races.pairTitle}</Label>
                            {duels.map((duel) => (
                              <View key={duel.opponent} style={styles.pairRow}>
                                <Muted style={styles.flex}>
                                  {duel.beat ? t.races.pairBeat : t.races.pairLost} {duel.opponent}
                                  {'  ·  '}
                                  {Math.round(duel.expected * 100)}%
                                </Muted>
                                <Body style={[styles.pairPts, { color: deltaColor(duel.points) }]}>
                                  {duel.points >= 0 ? '+' : ''}
                                  {duel.points.toFixed(1)}
                                </Body>
                              </View>
                            ))}
                            <Muted style={styles.pairClose}>{t.races.pairClose}</Muted>
                          </View>
                        ) : null}
                      </Card>
                    </Pressable>
                  );
                })}

                <ShareCard url={shareUrl} title={t.races.shareResults} message={resultsMessage} />
              </View>
            ) : (
              /* ── Course à venir ── */
              <>
                <View style={styles.section}>
                  <Label>
                    {t.races.participants} · {participants.length}
                  </Label>
                  {participants.map((p) => {
                    const grade = gradeForElo(p.elo);
                    return (
                      <Card key={p.id}>
                        <View style={styles.pilotRow}>
                          <Avatar name={p.name} size={36} />
                          <View style={styles.flex}>
                            <Body>
                              {p.name}
                              {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                            </Body>
                            <Muted style={{ color: grade.color }}>
                              {grade.name} · {p.elo}
                            </Muted>
                          </View>
                          <GradeMedal grade={grade} size={30} />
                          {isAdmin ? (
                            <Pressable onPress={() => onRemove(p.id)} accessibilityRole="button">
                              <Muted style={styles.remove}>{t.races.remove}</Muted>
                            </Pressable>
                          ) : null}
                        </View>
                      </Card>
                    );
                  })}

                  {isAdmin ? (
                    <>
                      <View style={styles.addRow}>
                        <View style={styles.flex}>
                          <Field
                            label={t.races.pilotName}
                            value={name}
                            onChangeText={setName}
                            error={nameError}
                            autoCapitalize="words"
                          />
                        </View>
                      </View>
                      <Button label={t.races.add} onPress={onAddPilot} disabled={busy} />

                      {/* Sélection parmi mes amis (lot 2.1) */}
                      {(() => {
                        const addable = friends.filter(
                          (f) => !participants.some((p) => p.profileId === f.pilotId),
                        );
                        if (friends.length === 0) return null;
                        return (
                          <View style={styles.friendPick}>
                            <Label>{t.friends.addToRace}</Label>
                            {addable.length === 0 ? (
                              <Muted>—</Muted>
                            ) : (
                              <View style={styles.friendChips}>
                                {addable.map((f) => (
                                  <Pressable
                                    key={f.pilotId}
                                    onPress={() => onAddFriend(f.pilotId)}
                                    accessibilityRole="button"
                                    style={styles.friendChip}>
                                    <Avatar name={f.username} size={24} />
                                    <Body style={styles.friendChipTxt}>+ {f.username}</Body>
                                  </Pressable>
                                ))}
                              </View>
                            )}
                          </View>
                        );
                      })()}

                      {!selfParticipating ? (
                        <Button label={t.races.rejoin} variant="ghost" onPress={onToggleSelf} />
                      ) : null}
                    </>
                  ) : null}
                </View>

                {isAdmin ? (
                  participants.length >= 2 ? (
                    <Button label={t.races.enterRanking} onPress={() => router.push(`/rank/${id}`)} />
                  ) : (
                    <Muted>{t.races.needTwoPilots}</Muted>
                  )
                ) : (
                  <WaitingFlag />
                )}

                <ShareCard url={shareUrl} />

                {isAdmin ? (
                  <Pressable onPress={onDelete} accessibilityRole="button" style={styles.deleteBtn}>
                    <Body style={styles.deleteTxt}>{t.races.delete}</Body>
                  </Pressable>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  flex: { flex: 1 },
  editLink: { color: colors.accent, fontWeight: '700' },
  section: { gap: spacing.sm },
  pilotRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  remove: { color: colors.inkDim2 },
  addRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.sm },
  friendPick: { gap: spacing.sm, marginTop: spacing.sm },
  friendChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  friendChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 4,
    paddingLeft: 4,
    paddingRight: spacing.md,
  },
  friendChipTxt: { fontSize: 13, fontWeight: '700' },
  resultRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  posNum: { fontFamily: fonts.serifBlack, fontSize: 18, width: 22, textAlign: 'center', color: colors.ink },
  delta: { fontWeight: '800' },
  cardOpen: { borderColor: colors.line2 },
  pairBox: {
    marginTop: spacing.md,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    paddingTop: spacing.md,
    gap: spacing.xs,
  },
  pairRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pairPts: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  pairClose: { textAlign: 'center', marginTop: spacing.sm, textDecorationLine: 'underline' },
  waiting: { alignItems: 'center', gap: spacing.xs, paddingVertical: spacing.xl },
  flag: { fontSize: 44 },
  waitingTitle: { fontFamily: fonts.serif, fontSize: 17 },
  waitingHint: { textAlign: 'center', maxWidth: 280 },
  deleteBtn: { alignItems: 'center', paddingVertical: spacing.md },
  deleteTxt: { color: colors.inkDim2 },
});
