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
import { LapField } from '@/components/lap-field';
import { DateTimeField } from '@/components/date-time-field';
import { Podium } from '@/components/podium';
import { ShareCard } from '@/components/share-card';
import { Avatar, Banner, Button, Card, Field, GradeMedal } from '@/components/ui';
import { Body, Heading, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { track } from '@/lib/analytics';
import { useAuth } from '@/lib/auth';
import { badgesForRace, type BadgeKey } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';
import { pairwiseBreakdown } from '@/lib/elo';
import { digitsToMs, formatLap, msToDigits } from '@/lib/laptime';
import { listFriends, searchPilots, type FriendEntry, type Pilot } from '@/lib/friends';
import { gradeForElo, isCalibrating } from '@/lib/grade';
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
  setLapTimes,
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
// Nom affichable d'un résultat : jamais « — » cryptique pour un profil masqué.
const displayName = (r: RaceResult) => (r.hiddenProfile ? t.races.privatePilot : r.name);
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
  const [expanded, setExpanded] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rematchError, setRematchError] = useState<string | null>(null);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [myNewBadges, setMyNewBadges] = useState<BadgeKey[]>([]);
  const [pilotQuery, setPilotQuery] = useState('');
  const [pilotResults, setPilotResults] = useState<Pilot[]>([]);
  // Saisie à laquelle correspondent les résultats : évite d'afficher une liste
  // périmée (ou « aucun pilote » à tort) pendant l'anti-rebond / le réseau.
  const [pilotResultsFor, setPilotResultsFor] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const [circuitRecord, setCircuitRecord] = useState<{ ms: number; holder: string } | null>(null);
  const [lapEditId, setLapEditId] = useState<string | null>(null);
  const [lapInput, setLapInput] = useState('');   // chiffres bruts (pavé numérique)
  const [lapError, setLapError] = useState<string | null>(null);
  // Saisie GROUPÉE (A9) : l'admin d'une course de huit pilotes ouvrait huit
  // fois le même champ. `null` = mode désactivé.
  const [lapBulk, setLapBulk] = useState<Record<string, string> | null>(null);

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
  // Aucune amitié requise. Ne dépend QUE de la saisie : le filtrage (déjà sur
  // la grille, profil illisible) se fait au rendu — pas de RPC superflue à
  // chaque événement temps réel, pas de résultats périmés affichés.
  useEffect(() => {
    const q = pilotQuery.trim();
    if (q.length < 2) return; // rien à chercher ; l'affichage masque (voir visiblePilots)
    let active = true;
    const timer = setTimeout(() => {
      searchPilots(q)
        .then((rows) => {
          if (!active) return;
          setPilotResults(rows);
          setPilotResultsFor(q);
        })
        .catch(() => {
          if (!active) return;
          setPilotResults([]);
          setPilotResultsFor(q);
        });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [pilotQuery]);

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
    setActionError(null);
    setBusy(true);
    try {
      await addGhostParticipant(id!, check.value);
      setName('');
      await refresh();
    } catch (e) {
      // Sans ce catch, un refus serveur (grille figée entre-temps, RLS, réseau)
      // ne produisait AUCUN retour : le champ gardait le nom, rien n'apparaissait.
      setActionError(e instanceof Error ? e.message : t.races.actionError);
    } finally {
      setBusy(false);
    }
  }

  async function onRemove(participationId: string) {
    setActionError(null);
    try {
      await removeParticipant(participationId);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.races.actionError);
    }
  }

  async function onAddFriend(profileId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await addProfileParticipant(id!, profileId);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.races.actionError);
    } finally {
      setBusy(false);
    }
  }

  /** Ajoute un pilote trouvé par pseudo (aucune amitié requise). */
  async function onAddPilotById(profileId: string) {
    setBusy(true);
    setActionError(null);
    try {
      await addProfileParticipant(id!, profileId);
      setPilotQuery('');
      setPilotResults([]);
      setPilotResultsFor('');
      await refresh();
    } catch (e) {
      // Cas réels : blocage apparu entre-temps, compte suspendu, grille figée
      // par le temps réel… L'échec doit se voir, pas rester muet.
      setActionError(e instanceof Error ? e.message : t.races.actionError);
    } finally {
      setBusy(false);
    }
  }

  async function onToggleSelf() {
    setActionError(null);
    try {
      const mine = participants.find((p) => p.isSelf);
      if (mine) await removeParticipant(mine.id);
      else await addSelfParticipant(id!);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.races.actionError);
    }
  }

  /** Un pilote inscrit d'office quitte la course lui-même (non-admin). */
  async function onLeave() {
    setBusy(true);
    setJoinError(null);
    try {
      const mine = participants.find((p) => p.isSelf);
      if (mine) await removeParticipant(mine.id);
      await refresh();
    } catch (e) {
      setJoinError(e instanceof Error ? e.message : t.races.actionError);
    } finally {
      setBusy(false);
    }
  }

  function startEdit() {
    if (!race) return;
    setEditCircuit(race.circuit);
    setEditWhen(new Date(race.scheduled_at));
    setEditing(true);
  }

  async function onSaveEdit() {
    if (!editCircuit) return;
    setActionError(null);
    try {
      await updateRace(id!, editCircuit.id, editWhen);
      setEditing(false);
      await refresh();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t.races.actionError);
    }
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
    setLapInput(msToDigits(r.bestLapMs));
    setLapError(null);
  }

  async function onSaveLap(participationId: string) {
    // Champ vidé = effacement du temps ; sinon on convertit les chiffres.
    const cleared = lapInput.trim() === '';
    const ms = cleared ? null : digitsToMs(lapInput);
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

  /** Ouvre la saisie groupée, pré-remplie avec les temps déjà connus. */
  function startBulkLaps() {
    setLapEditId(null);
    setLapError(null);
    setLapBulk(
      Object.fromEntries(results.map((r) => [r.participationId, msToDigits(r.bestLapMs)])),
    );
  }

  async function onSaveBulkLaps() {
    if (!lapBulk) return;
    const entries: { participationId: string; ms: number | null }[] = [];
    for (const [pid, raw] of Object.entries(lapBulk)) {
      const cleared = raw.trim() === '';
      const ms = cleared ? null : digitsToMs(raw);
      if (!cleared && ms === null) {
        // Sur huit champs, « temps invalide » sans nom oblige à chercher.
        const who = results.find((r) => r.participationId === pid);
        setLapError(`${who ? displayName(who) + ' — ' : ''}${t.races.lapInvalid}`);
        return;
      }
      // On n'envoie que ce qui a CHANGÉ : un enregistrement ne doit pas
      // réécrire les temps que l'admin n'a pas touchés.
      const before = results.find((r) => r.participationId === pid)?.bestLapMs ?? null;
      if (ms !== before) entries.push({ participationId: pid, ms });
    }
    setLapError(null);
    setBusy(true);
    try {
      await setLapTimes(id!, entries);
      setLapBulk(null);
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

  // Résultats de recherche dérivés, calculés au rendu :
  //  · masqués tant que la saisie est trop courte ou que la réponse ne
  //    correspond pas à la saisie courante (fraîcheur garantie) ;
  //  · sans les pilotes déjà sur la grille ;
  //  · sans les profils PRIVÉS illisibles (eloExact faux) : la RLS masquerait
  //    leur ligne une fois ajoutés → l'écran fabriquerait un faux « Rookie ».
  const searchingPilot = pilotQuery.trim().length >= 2;
  const pilotSearchReady = searchingPilot && pilotResultsFor === pilotQuery.trim();
  const visiblePilots = pilotSearchReady
    ? pilotResults.filter(
        (r) => r.eloExact && !participants.some((p) => p.profileId === r.id),
      )
    : [];
  // Le pilote existe bien, il est simplement DÉJÀ inscrit : lui répondre
  // « aucun pilote trouvé » serait un mensonge sur une action qu'on vient de faire.
  const alreadyOnGrid =
    pilotSearchReady &&
    visiblePilots.length === 0 &&
    pilotResults.some((r) => participants.some((p) => p.profileId === r.id));

  // Amis pas encore sur la grille — la 1re marche du bloc « ajouter ».
  const addableFriends = friends.filter(
    (f) => !participants.some((p) => p.profileId === f.pilotId),
  );
  // Un admin qui n'a aucun ami n'a pas besoin d'une marche « Tes amis » vide :
  // elle ne lui dirait que d'aller chercher un pseudo — ce que fait la marche
  // suivante. On la retire, et on renumérote au rendu.
  const addSteps: ('friends' | 'search' | 'guest')[] = friends.length
    ? ['friends', 'search', 'guest']
    : ['search', 'guest'];
  const stepNo = (k: 'friends' | 'search' | 'guest') => addSteps.indexOf(k) + 1;

  const shareUrl = `${appBaseUrl()}race/${id}`;

  // Résumé texte des résultats (podium) pour le partage.
  const resultsMessage = completed
    ? [
        `🏁 ${race?.circuit?.name ?? t.races.noCircuit} · ${formatRaceDate(race!.scheduled_at)}`,
        results
          .slice(0, 3)
          // Invité : pas de delta partagé (son Elo est gelé, « 0 » serait trompeur).
          .map((r) =>
            r.isGuest
              ? `${r.dnf ? t.races.dnfShort : (MEDALS[r.position - 1] ?? r.position)} ${displayName(r)}`
              : `${r.dnf ? t.races.dnfShort : (MEDALS[r.position - 1] ?? r.position)} ${displayName(r)} ${r.eloDelta > 0 ? '+' : ''}${r.eloDelta}`,
          )
          .join(' · '),
      ].join('\n')
    : undefined;

  // Entrées pour le détail par paire (C10), recalculé à l'affichage. Les invités
  // sont exclus : l'Elo ne s'échange qu'entre inscrits (anti-triche), afficher un
  // duel contre eux laisserait croire à des points qui n'existent pas.
  const pairInputs = results
    .filter((r) => !r.isGuest)
    // Rang EFFECTIF : les abandons sont ex æquo derrière tout le monde, comme
    // côté serveur. Avec leur position d'affichage, l'explication prétendrait
    // qu'un abandon en a battu un autre.
    .map((r) => ({
      participationId: r.participationId,
      name: r.name,
      eloBefore: r.eloBefore,
      position: r.dnf ? results.filter((x) => !x.dnf).length + 1 : r.position,
    }));

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
            {actionError ? <Muted style={styles.rematchErr}>{actionError}</Muted> : null}
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
                  // Invité : aucun duel (Elo gelé) → ligne non dépliable, pas de
                  // panneau vide « d'où viennent tes points ».
                  const isOpen = expanded === r.participationId && !r.isGuest;
                  // Indexé sur la PARTICIPATION : deux abandons partagent le
                  // même rang effectif, chercher par position renverrait le
                  // voisin — et son panneau se contredirait lui-même.
                  const self = pairInputs.find((p) => p.participationId === r.participationId);
                  const duels = isOpen && self ? pairwiseBreakdown(self, pairInputs) : [];
                  return (
                    <Pressable
                      key={r.participationId}
                      onPress={() => setExpanded(isOpen ? null : r.participationId)}
                      disabled={r.isGuest}
                      accessibilityRole="button">
                      <Card style={isOpen ? styles.cardOpen : undefined}>
                        <View style={styles.resultRow}>
                          {/* Un abandon n'a pas de place à l'arrivée : afficher
                              son rang laisserait croire qu'il a fini là. */}
                          <Body style={[styles.posNum, r.dnf && styles.posNumDnf]}>
                            {r.dnf ? t.races.dnfShort : r.position}
                          </Body>
                          <Avatar name={r.hiddenProfile ? '?' : r.name} size={34} />
                          <View style={styles.flex}>
                            <Body>
                              {r.hiddenProfile ? t.races.privatePilot : r.name}
                              {r.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                            </Body>
                            {r.isGuest ? (
                              <Muted>{t.races.guest}</Muted>
                            ) : r.dnf ? (
                              <Muted>
                                {t.races.dnf} ·{' '}
                                <Muted style={{ color: grade.color }}>
                                  {grade.name} · {r.eloAfter}
                                </Muted>
                              </Muted>
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
                                  {duel.tied
                                    ? t.races.pairTied
                                    : duel.beat
                                      ? t.races.pairBeat
                                      : t.races.pairLost}{' '}
                                  {duel.opponent}
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
                  {/* Mode groupé : réservé à l'admin, seul à pouvoir écrire
                      pour tout le monde. Un pilote garde sa saisie unitaire. */}
                  {isAdmin && lapBulk === null ? (
                    <Button label={t.races.lapBulk} variant="ghost" onPress={startBulkLaps} />
                  ) : null}

                  {lapBulk !== null ? (
                    <View style={styles.lapEditBox}>
                      <Muted>{t.races.lapBulkHint}</Muted>
                      {[...results].sort(lapSort).map((r) => (
                        <LapField
                          key={r.participationId}
                          label={displayName(r)}
                          digits={lapBulk[r.participationId] ?? ''}
                          onChangeDigits={(v) =>
                            setLapBulk((prev) => ({ ...(prev ?? {}), [r.participationId]: v }))
                          }
                        />
                      ))}
                      {lapError ? <Muted style={styles.rematchErr}>{lapError}</Muted> : null}
                      <View style={styles.actions}>
                        <Button
                          label={t.common.cancel}
                          variant="ghost"
                          onPress={() => {
                            setLapBulk(null);
                            setLapError(null);
                          }}
                        />
                        <Button label={t.races.lapSave} onPress={onSaveBulkLaps} disabled={busy} />
                      </View>
                    </View>
                  ) : null}

                  {(lapBulk === null ? [...results].sort(lapSort) : []).map((r) => {
                    const editable = r.isSelf || isAdmin;
                    const editing = lapEditId === r.participationId;
                    return (
                      <Card key={r.participationId}>
                        <View style={styles.lapRow}>
                          <Body style={styles.flex}>
                            {displayName(r)}
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
                            <LapField
                              label={t.races.lapLabel}
                              digits={lapInput}
                              onChangeDigits={setLapInput}
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
                    // Profil illisible (privé non-ami…) : ne rien inventer.
                    const hidden = p.hiddenProfile;
                    // Nouveau pilote : niveau encore en calibration, pas de grade figé.
                    const calibrating = !isGuest && !hidden && isCalibrating(p.races);
                    return (
                      <Card key={p.id}>
                        <View style={styles.pilotRow}>
                          <Avatar name={hidden ? '?' : p.name} size={36} />
                          <View style={styles.flex}>
                            <Body>
                              {hidden ? t.races.privatePilot : p.name}
                              {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                            </Body>
                            {isGuest ? (
                              <Muted>{t.races.guest}</Muted>
                            ) : hidden ? (
                              <Muted>{t.races.privateProfileHint}</Muted>
                            ) : calibrating ? (
                              <Muted>
                                {t.profile.calibrating} · {p.elo}
                              </Muted>
                            ) : (
                              <Muted style={{ color: grade.color }}>
                                {grade.name} · {p.elo}
                              </Muted>
                            )}
                          </View>
                          {!isGuest && !hidden && !calibrating ? (
                            <GradeMedal grade={grade} size={30} />
                          ) : null}
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
                      {/* ── Remplir la grille, en trois marches ──────────────
                          L'ordre n'est pas cosmétique : chaque marche est plus
                          coûteuse et moins « bonne » que la précédente.
                          1. Mes amis, en un tap — zéro friction, Elo réel.
                          2. Un inscrit par pseudo — l'amitié n'est pas requise
                             (la RLS autorise déjà l'admin à ajouter tout pilote
                             non bloqué), mais il faut connaître le pseudo.
                          3. Un invité sans compte — dernier recours : il court,
                             mais n'échange aucun point. On le DIT, sinon
                             l'admin croit avoir inscrit un vrai pilote. */}

                      {/* 1 · Mes amis (masquée si le pilote n'a aucun ami) */}
                      {addSteps.includes('friends') ? (
                      <View style={styles.addStep}>
                        <Heading>{`${stepNo('friends')} · ${t.races.addStep1}`}</Heading>
                        {addableFriends.length > 0 ? (
                          <>
                            <Muted>{t.races.addStep1Hint}</Muted>
                            <View style={styles.friendChips}>
                              {addableFriends.map((f) => (
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
                        ) : (
                          <Muted>{t.races.addStep1Empty}</Muted>
                        )}
                      </View>
                      ) : null}

                      {/* 2 · Un autre pilote inscrit, par pseudo */}
                      <View style={styles.addStep}>
                        <Heading>{`${stepNo('search')} · ${t.races.addStep2}`}</Heading>
                        <Muted>{t.races.invitePilotHint}</Muted>
                        <Field
                          label={t.races.invitePilotLabel}
                          value={pilotQuery}
                          onChangeText={setPilotQuery}
                          autoCapitalize="none"
                          placeholder={t.races.invitePilotPlaceholder}
                        />
                        {searchingPilot && !pilotSearchReady ? <Muted>…</Muted> : null}
                        {pilotSearchReady && visiblePilots.length === 0 ? (
                          <Muted>
                            {alreadyOnGrid ? t.races.invitePilotAlready : t.races.invitePilotNone}
                          </Muted>
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
                      </View>

                      {/* 3 · Un invité sans compte (hors Elo) */}
                      <View style={styles.addStep}>
                        <Heading>{`${stepNo('guest')} · ${t.races.addStep3}`}</Heading>
                        <Muted>{t.races.guestHint}</Muted>
                        <Field
                          label={t.races.guestName}
                          value={name}
                          onChangeText={setName}
                          error={nameError}
                          autoCapitalize="words"
                        />
                        <Button
                          label={t.races.addGuest}
                          variant="ghost"
                          onPress={onAddPilot}
                          disabled={busy}
                        />
                        <Muted style={styles.guestNudge}>{t.races.guestNudge}</Muted>
                      </View>

                      {!selfParticipating ? (
                        <Button label={t.races.rejoin} variant="ghost" onPress={onToggleSelf} />
                      ) : null}
                    </>
                  ) : null}

                  {/* Échec d'une action sur la grille : toujours visible. */}
                  {actionError ? <Muted style={styles.rematchErr}>{actionError}</Muted> : null}
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
                  <View style={styles.section}>
                    <WaitingFlag />
                    {/* Inscrit d'office ? Tant que la grille est ouverte, chacun
                        peut se retirer lui-même (consentement, Reviewer A2). */}
                    {selfParticipating && !locked ? (
                      <Button
                        label={t.races.leaveRace}
                        variant="ghost"
                        onPress={onLeave}
                        disabled={busy}
                      />
                    ) : null}
                    {joinError ? <Muted style={styles.rematchErr}>{joinError}</Muted> : null}
                  </View>
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
  // Une « marche » du bloc d'ajout : léger encart pour que les trois options
  // se lisent comme une descente d'escalier, pas comme trois champs en vrac.
  addStep: {
    gap: spacing.xs,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  guestNudge: { fontStyle: 'italic' },
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
  posNumDnf: { fontSize: 11, fontWeight: '800', color: colors.inkDim2 },
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
