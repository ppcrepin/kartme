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
import { Avatar, Banner, Button, Card, Field, GradeMedal } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { badgesForRace, type BadgeKey } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';
import { pairwiseBreakdown } from '@/lib/elo';
import { formatLap, parseLap } from '@/lib/laptime';
import { listFriends, searchPilots, type FriendEntry, type Pilot } from '@/lib/friends';
import { gradeForElo } from '@/lib/grade';
import {
  addGhostParticipant,
  addProfileParticipant,
  addSelfParticipant,
  deleteRace,
  getCircuitRecord,
  getRace,
  joinRace,
  listParticipants,
  listResults,
  lockRace,
  setLapTime,
  onRaceUpdate,
  rematch,
  removeParticipant,
  reopenRace,
  updateRace,
  withinCorrectionWindow,
  type Circuit,
  type Participant,
  type Race,
  type RaceResult,
} from '@/lib/races';
import { appBaseUrl } from '@/lib/url';
import { validateGhostName } from '@/lib/username';

const MEDALS = ['🥇', '🥈', '🥉'];
// Tri des meilleurs tours : le plus rapide d'abord, les temps absents en dernier.
const lapSort = (a: RaceResult, b: RaceResult) => {
  if (a.bestLapMs == null && b.bestLapMs == null) return a.position - b.position;
  if (a.bestLapMs == null) return 1;
  if (b.bestLapMs == null) return -1;
  return a.bestLapMs - b.bestLapMs;
};
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
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [myNewBadges, setMyNewBadges] = useState<BadgeKey[]>([]);
  const [pilotQuery, setPilotQuery] = useState('');
  const [pilotResults, setPilotResults] = useState<Pilot[]>([]);
  const [circuitRecord, setCircuitRecord] = useState<{ ms: number; holder: string } | null>(null);
  const [lapEditId, setLapEditId] = useState<string | null>(null);
  const [lapInput, setLapInput] = useState('');
  const [lapError, setLapError] = useState<string | null>(null);

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
  const locked = race?.status === 'locked';
  const canCorrect = !!race && withinCorrectionWindow(race);
  const selfParticipating = participants.some((p) => p.isSelf);

  // Recherche de pilote par pseudo (anti-rebond 300 ms, min 2 caractères).
  // Exclut ceux déjà sur la grille. Aucune amitié requise.
  useEffect(() => {
    if (pilotQuery.trim().length < 2) return; // résultats masqués à l'affichage (voir visiblePilots)
    let active = true;
    const timer = setTimeout(() => {
      searchPilots(pilotQuery)
        .then((rows) => {
          if (!active) return;
          setPilotResults(rows.filter((r) => !participants.some((p) => p.profileId === r.id)));
        })
        .catch(() => active && setPilotResults([]));
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pilotQuery, participants]);

  // Record du circuit (temps au tour) — chargé une fois la course terminée.
  useEffect(() => {
    if (!completed || !race?.circuit_id) return;
    let active = true;
    getCircuitRecord(race.circuit_id)
      .then((r) => active && setCircuitRecord(r))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [completed, race?.circuit_id]);

  // Badges gagnés par MOI sur cette course (bandeau sous le podium).
  useEffect(() => {
    if (!completed || !id) return;
    let active = true;
    badgesForRace(id)
      .then((b) => active && setMyNewBadges(b))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [completed, id]);

  async function onAddPilot() {
    const check = validateGhostName(name);
    if (!check.ok) {
      setNameError(t.races.nameErrors[check.error ?? 'generic']);
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

  /** Ajoute un pilote trouvé par pseudo (aucune amitié requise). */
  async function onAddPilotById(profileId: string) {
    setBusy(true);
    try {
      await addProfileParticipant(id!, profileId);
      setPilotQuery('');
      setPilotResults([]);
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
    setBusy(true);
    setJoinError(null);
    try {
      await deleteRace(id!);
      router.replace('/(tabs)');
    } catch {
      setJoinError(t.races.deleteError);
      setConfirmDelete(false);
      setBusy(false);
    }
  }

  async function onJoin() {
    setBusy(true);
    setJoinError(null);
    try {
      await joinRace(id!);
      await refresh();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : t.races.joinError);
    } finally {
      setBusy(false);
    }
  }

  function startLapEdit(r: RaceResult) {
    setLapEditId(r.participationId);
    setLapInput(r.bestLapMs != null ? formatLap(r.bestLapMs) : '');
    setLapError(null);
  }

  async function onSaveLap(participationId: string) {
    // Champ vidé = effacement du temps ; sinon on parse.
    const cleared = lapInput.trim() === '';
    const ms = cleared ? null : parseLap(lapInput);
    if (!cleared && ms === null) {
      setLapError(t.races.lapInvalid);
      return;
    }
    setLapError(null);
    setBusy(true);
    try {
      await setLapTime(participationId, ms);
      setLapEditId(null);
      setLapInput('');
      await refresh();
      if (race?.circuit_id) setCircuitRecord(await getCircuitRecord(race.circuit_id).catch(() => null));
    } catch (e) {
      setLapError(e instanceof Error ? e.message : t.races.lapInvalid);
    } finally {
      setBusy(false);
    }
  }

  async function onRematch() {
    setBusy(true);
    setRematchError(null);
    try {
      const newId = await rematch(id!);
      track('rematch').catch(() => {});
      router.replace(`/race/${newId}`);
    } catch {
      setRematchError(t.races.rematchError);
      setBusy(false);
    }
  }

  async function onLock() {
    setBusy(true);
    try {
      await lockRace(id!);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  async function onReopen() {
    setBusy(true);
    try {
      await reopenRace(id!);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  // Résultats de recherche dérivés : masqués tant que la saisie est trop courte
  // (évite de vider l'état dans l'effet, et donc un rendu en cascade).
  const searchingPilot = pilotQuery.trim().length >= 2;
  const visiblePilots = searchingPilot ? pilotResults : [];

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

  // Entrées pour le détail par paire (C10), recalculé à l'affichage. Les invités
  // sont exclus : l'Elo ne s'échange qu'entre inscrits (anti-triche), afficher un
  // duel contre eux laisserait croire à des points qui n'existent pas.
  const pairInputs = results
    .filter((r) => !r.isGuest)
    .map((r) => ({ name: r.name, eloBefore: r.eloBefore, position: r.position }));

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={10}
          style={styles.back}>
          <Muted>←</Muted>
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
              {isAdmin && !completed && !locked ? (
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

                {myNewBadges.length > 0 ? (
                  <Banner
                    kind="ok"
                    title={(myNewBadges.length > 1
                      ? t.badges.unlockedBannerMany
                      : t.badges.unlockedBanner
                    ).replace('%s', myNewBadges.map((k) => t.badges.items[k].name).join(' · '))}
                  />
                ) : null}

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
                            {r.isGuest ? (
                              <Muted>{t.races.guest}</Muted>
                            ) : (
                              <Muted style={{ color: grade.color }}>
                                {grade.name} · {r.eloAfter}
                              </Muted>
                            )}
                          </View>
                          {!r.isGuest ? (
                            <Body style={[styles.delta, { color: deltaColor(r.eloDelta) }]}>
                              {fmtDelta(r.eloDelta)}
                            </Body>
                          ) : null}
                        </View>

                        {isOpen ? (
                          /* ── Détail par paire (C10) ── */
                          <View style={styles.pairBox}>
                            <Label>{t.races.pairTitle}</Label>
                            {duels.map((duel) => (
                              <View key={duel.opponent} style={styles.pairRow}>
                                <Muted style={styles.flex}>
                                  {duel.beat ? t.races.pairBeat : t.races.pairLost} {duel.opponent}
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

                {/* ── Meilleurs tours ⏱ (informatif, hors Elo) ── */}
                <View style={styles.section}>
                  <Label>{t.races.lapTimes}</Label>
                  {circuitRecord ? (
                    <Muted style={styles.lapRecord}>
                      {t.races.circuitRecord
                        .replace('%t', formatLap(circuitRecord.ms))
                        .replace('%n', circuitRecord.holder)}
                    </Muted>
                  ) : null}
                  {[...results].sort(lapSort).map((r) => {
                    const editable = r.isSelf || isAdmin;
                    const editing = lapEditId === r.participationId;
                    return (
                      <Card key={r.participationId}>
                        <View style={styles.lapRow}>
                          <Body style={styles.flex}>
                            {r.name}
                            {r.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                          </Body>
                          {!editing ? (
                            <Body style={styles.lapTime}>
                              {r.bestLapMs != null ? formatLap(r.bestLapMs) : '—'}
                            </Body>
                          ) : null}
                          {editable && !editing ? (
                            <Pressable onPress={() => startLapEdit(r)} accessibilityRole="button">
                              <Muted style={styles.lapEdit}>
                                {r.bestLapMs != null
                                  ? t.races.lapEdit
                                  : r.isSelf
                                    ? t.races.lapAdd
                                    : t.races.lapAddOther}
                              </Muted>
                            </Pressable>
                          ) : null}
                        </View>
                        {editing ? (
                          <View style={styles.lapEditBox}>
                            <Field
                              label={t.races.lapLabel}
                              value={lapInput}
                              onChangeText={setLapInput}
                              placeholder="0:52.348"
                            />
                            {lapError ? <Muted style={styles.rematchErr}>{lapError}</Muted> : null}
                            <View style={styles.actions}>
                              <Button
                                label={t.common.cancel}
                                variant="ghost"
                                onPress={() => {
                                  setLapEditId(null);
                                  setLapError(null);
                                }}
                              />
                              <Button
                                label={t.races.lapSave}
                                onPress={() => onSaveLap(r.participationId)}
                                disabled={busy}
                              />
                            </View>
                          </View>
                        ) : null}
                      </Card>
                    );
                  })}
                </View>

                <ShareCard url={shareUrl} title={t.races.shareResults} message={resultsMessage} />

                {/* Revanche : reprendre le même circuit + les mêmes pilotes */}
                {isAdmin || results.some((r) => r.isSelf) ? (
                  <>
                    <Button label={t.races.rematch} onPress={onRematch} disabled={busy} />
                    {rematchError ? <Muted style={styles.rematchErr}>{rematchError}</Muted> : null}
                  </>
                ) : null}

                {/* Correction du classement — fenêtre 24 h (lot 2.6) */}
                {isAdmin && canCorrect ? (
                  <View style={styles.correctBox}>
                    <Button
                      label={t.races.correctRanking}
                      variant="ghost"
                      onPress={() => router.push(`/rank/${id}?correct=1`)}
                      disabled={busy}
                    />
                    <Muted style={styles.correctHint}>{t.races.correctWindowHint}</Muted>
                  </View>
                ) : null}
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
                    // Invité (sans compte) : Elo gelé et hors classement → pas de score affiché.
                    const isGuest = !p.profileId;
                    return (
                      <Card key={p.id}>
                        <View style={styles.pilotRow}>
                          <Avatar name={p.name} size={36} />
                          <View style={styles.flex}>
                            <Body>
                              {p.name}
                              {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                            </Body>
                            {isGuest ? (
                              <Muted>{t.races.guest}</Muted>
                            ) : (
                              <Muted style={{ color: grade.color }}>
                                {grade.name} · {p.elo}
                              </Muted>
                            )}
                          </View>
                          {!isGuest ? <GradeMedal grade={grade} size={30} /> : null}
                          {isAdmin && !locked ? (
                            <Pressable onPress={() => onRemove(p.id)} accessibilityRole="button">
                              <Muted style={styles.remove}>{t.races.remove}</Muted>
                            </Pressable>
                          ) : null}
                        </View>
                      </Card>
                    );
                  })}

                  {locked ? <Banner kind="info" title={t.races.lockedBanner} /> : null}

                  {isAdmin && !locked ? (
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

                      {/* Inviter un pilote inscrit — par pseudo, SANS exiger l'amitié.
                          (La RLS autorise déjà l'admin à ajouter tout pilote non bloqué.) */}
                      <View style={styles.friendPick}>
                        <Label>{t.races.invitePilot}</Label>
                        <Field
                          label={t.races.invitePilotLabel}
                          value={pilotQuery}
                          onChangeText={setPilotQuery}
                          autoCapitalize="none"
                          placeholder={t.races.invitePilotPlaceholder}
                        />
                        {searchingPilot && visiblePilots.length === 0 ? (
                          <Muted>{t.races.invitePilotNone}</Muted>
                        ) : null}
                        {visiblePilots.length > 0 ? (
                          <View style={styles.friendChips}>
                            {visiblePilots.map((p) => (
                              <Pressable
                                key={p.id}
                                onPress={() => onAddPilotById(p.id)}
                                accessibilityRole="button"
                                disabled={busy}
                                style={styles.friendChip}>
                                <Avatar name={p.username} size={24} />
                                <Body style={styles.friendChipTxt}>+ {p.username}</Body>
                              </Pressable>
                            ))}
                          </View>
                        ) : null}

                        {/* Raccourci : mes amis, en un tap */}
                        {(() => {
                          const addable = friends.filter(
                            (f) => !participants.some((p) => p.profileId === f.pilotId),
                          );
                          if (addable.length === 0) return null;
                          return (
                            <>
                              <Label style={styles.friendsShortcut}>{t.friends.addToRace}</Label>
                              <View style={styles.friendChips}>
                                {addable.map((f) => (
                                  <Pressable
                                    key={f.pilotId}
                                    onPress={() => onAddFriend(f.pilotId)}
                                    accessibilityRole="button"
                                    disabled={busy}
                                    style={styles.friendChip}>
                                    <Avatar name={f.username} size={24} />
                                    <Body style={styles.friendChipTxt}>+ {f.username}</Body>
                                  </Pressable>
                                ))}
                              </View>
                            </>
                          );
                        })()}
                      </View>

                      {!selfParticipating ? (
                        <Button label={t.races.rejoin} variant="ghost" onPress={onToggleSelf} />
                      ) : null}
                    </>
                  ) : null}
                </View>

                {isAdmin ? (
                  participants.length >= 2 ? (
                    <View style={styles.actions}>
                      {locked ? (
                        <Button
                          label={t.races.reopen}
                          variant="ghost"
                          onPress={onReopen}
                          disabled={busy}
                        />
                      ) : (
                        <Button
                          label={t.races.lock}
                          variant="ghost"
                          onPress={onLock}
                          disabled={busy}
                        />
                      )}
                      <Button
                        label={t.races.enterRanking}
                        onPress={() => router.push(`/rank/${id}${locked ? '?locked=1' : ''}`)}
                      />
                    </View>
                  ) : (
                    <Muted>{t.races.needTwoPilots}</Muted>
                  )
                ) : !selfParticipating && !locked ? (
                  /* Invité : rejoindre soi-même une course ouverte */
                  <View style={styles.section}>
                    <Button label={t.races.joinRace} onPress={onJoin} disabled={busy} />
                    {joinError ? <Muted style={styles.rematchErr}>{joinError}</Muted> : null}
                  </View>
                ) : (
                  <WaitingFlag />
                )}

                <ShareCard url={shareUrl} />

                {isAdmin ? (
                  confirmDelete ? (
                    <View style={styles.deleteConfirm}>
                      <Muted>{t.races.deleteConfirm}</Muted>
                      <Button label={t.races.deleteConfirmBtn} onPress={onDelete} disabled={busy} />
                      <Button label={t.common.cancel} variant="ghost" onPress={() => setConfirmDelete(false)} />
                    </View>
                  ) : (
                    <Pressable
                      onPress={() => setConfirmDelete(true)}
                      accessibilityRole="button"
                      style={styles.deleteBtn}>
                      <Body style={styles.deleteTxt}>{t.races.delete}</Body>
                    </Pressable>
                  )
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
  friendsShortcut: { marginTop: spacing.sm },
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
  deleteConfirm: { gap: spacing.sm, alignItems: 'center', marginTop: spacing.sm },
  rematchErr: { color: colors.accent, textAlign: 'center' },
  actions: { gap: spacing.sm },
  correctBox: { gap: spacing.xs, marginTop: spacing.sm },
  correctHint: { textAlign: 'center' },
  lapRecord: { color: colors.accent, marginBottom: spacing.xs },
  lapRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  lapTime: { fontVariant: ['tabular-nums'], fontWeight: '800' },
  lapEdit: { color: colors.accent, fontWeight: '700' },
  lapEditBox: { marginTop: spacing.sm, gap: spacing.sm },
});
