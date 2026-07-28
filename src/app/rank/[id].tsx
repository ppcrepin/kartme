import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DragList } from '@/components/drag-list';
import { Avatar, Banner, Button, Card } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import {
  correctRaceResults,
  listParticipants,
  removeParticipant,
  resultOrder,
  submitRaceResults,
  type Participant,
} from '@/lib/races';
import { clearDraft, isMeaningful, loadDraft, saveDraft } from '@/lib/rank-draft';

type Step = 'presents' | 'order';
type Mode = 'drag' | 'tap';

export default function RankScreen() {
  const { id, correct, locked } = useLocalSearchParams<{ id: string; correct?: string; locked?: string }>();
  const isCorrect = correct === '1'; // mode correction (lot 2.6) : roster figé, on ré-ordonne
  const isLocked = locked === '1'; // course clôturée : grille figée → tous présents (pas d'étape « présents »)
  const rosterFinal = isCorrect || isLocked; // roster définitif : on saute l'étape « présents »
  const router = useRouter();
  const { session } = useAuth();

  const [step, setStep] = useState<Step>(rosterFinal ? 'order' : 'presents');
  const [mode, setMode] = useState<Mode>('drag');
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [absents, setAbsents] = useState<Set<string>>(new Set());
  const [ordered, setOrdered] = useState<Participant[]>([]);
  const [tapOrder, setTapOrder] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);

  useFocusEffect(
    useCallback(() => {
      listParticipants(id!, session?.user.id)
        .then(async (parts) => {
          setParticipants(parts);
          const byId = new Map(parts.map((p) => [p.id, p]));

          // Brouillon local (A10) : au circuit, une coupure réseau ou un
          // rechargement ne doit pas effacer un ordre saisi à la main. En
          // correction, on repart TOUJOURS du classement enregistré — c'est
          // lui la référence, pas un brouillon oublié.
          const draft = isCorrect ? null : loadDraft(id!, parts.map((p) => p.id));
          if (draft && isMeaningful(draft)) {
            setAbsents(new Set(draft.absentIds));
            setOrdered(draft.orderedIds.map((pid) => byId.get(pid)!).filter(Boolean));
            setTapOrder(draft.tapOrder);
            setMode(draft.mode);
            setStep(draft.step);
            setRestored(true);
            return;
          }

          if (isCorrect) {
            // Correction : pré-remplir dans l'ordre du classement enregistré.
            const order = await resultOrder(id!).catch(() => [] as string[]);
            const ord = order.map((pid) => byId.get(pid)).filter(Boolean) as Participant[];
            setOrdered(ord.length ? ord : parts);
          } else if (isLocked) {
            // Course clôturée : roster figé → tous présents, ordre à saisir.
            setOrdered(parts);
          }
        })
        .catch(() => {});
    }, [id, session?.user.id, isCorrect, isLocked]),
  );

  /**
   * Enregistre le brouillon à chaque modification. Appelé depuis les gestes
   * (et non depuis un effet) : l'état à écrire est celui qu'on vient de
   * calculer, sans passer par un rendu intermédiaire.
   */
  const persist = useCallback(
    (patch: Partial<{ step: Step; mode: Mode; absentIds: string[]; orderedIds: string[]; tapOrder: string[] }>) => {
      if (isCorrect || !id) return; // la correction ne se brouillonne pas
      saveDraft(id, {
        step,
        mode,
        absentIds: [...absents],
        orderedIds: ordered.map((p) => p.id),
        tapOrder,
        ...patch,
      });
    },
    [id, isCorrect, step, mode, absents, ordered, tapOrder],
  );

  function toggleAbsent(pid: string) {
    const next = new Set(absents);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setAbsents(next);
    persist({ absentIds: [...next] });
  }

  function onConfirmPresents() {
    // Rien n'est écrit en base ici : le retrait effectif des absents se fait
    // à la validation finale (revenir en arrière n'a donc aucun effet).
    const present = participants.filter((p) => !absents.has(p.id));
    setOrdered(present);
    setTapOrder([]);
    setStep('order');
    persist({ step: 'order', orderedIds: present.map((p) => p.id), tapOrder: [] });
  }

  /** Repartir d'une feuille blanche (le brouillon repris n'était pas le bon). */
  function onDiscardDraft() {
    clearDraft(id!);
    setRestored(false);
    setAbsents(new Set());
    setTapOrder([]);
    setOrdered(rosterFinal ? participants : []);
    setStep(rosterFinal ? 'order' : 'presents');
  }

  function onReorder(next: Participant[]) {
    setOrdered(next);
    persist({ orderedIds: next.map((p) => p.id) });
  }

  function onSetMode(next: Mode) {
    setMode(next);
    persist({ mode: next });
  }

  function toggleTap(pid: string) {
    const next = tapOrder.includes(pid) ? tapOrder.filter((x) => x !== pid) : [...tapOrder, pid];
    setTapOrder(next);
    persist({ tapOrder: next });
  }

  async function onValidate() {
    const order = mode === 'drag' ? ordered.map((p) => p.id) : tapOrder;
    setBusy(true);
    setError(null);
    try {
      if (isCorrect) {
        // Correction : roster figé, on ne fait que réordonner.
        await correctRaceResults(id!, order);
      } else {
        // Les absents n'ont pas couru : retirés seulement maintenant, juste
        // avant le calcul (le moteur exige l'ensemble exact des participants).
        for (const pid of absents) {
          await removeParticipant(pid);
        }
        await submitRaceResults(id!, order);
      }
      // Le classement est en base : le brouillon n'a plus de raison d'être.
      clearDraft(id!);
      router.replace(`/race/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Erreur');
      setBusy(false);
    }
  }

  const present = participants.filter((p) => !absents.has(p.id));
  const presentCount = present.length;
  const tapComplete = tapOrder.length === present.length && present.length >= 2;
  const canValidate = mode === 'drag' ? ordered.length >= 2 : tapComplete;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!dragging}>
        <Pressable
          onPress={() => router.back()}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={10}
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>

        {/* Brouillon repris : on le DIT, sinon l'admin croit que l'app a
            inventé un ordre — et il peut toujours repartir de zéro. */}
        {restored ? (
          <View style={styles.draft}>
            <Banner kind="info" title={t.races.draftRestored} message={t.races.draftRestoredHint} />
            <Button label={t.races.draftDiscard} variant="ghost" onPress={onDiscardDraft} />
          </View>
        ) : null}

        {step === 'presents' ? (
          <>
            <Title>{t.races.presentsTitle}</Title>
            <Muted>{t.races.presentsHint}</Muted>

            <View style={styles.list}>
              {participants.map((p) => {
                const absent = absents.has(p.id);
                return (
                  <Pressable key={p.id} onPress={() => toggleAbsent(p.id)} accessibilityRole="button">
                    <Card style={[styles.pilot, absent && styles.pilotAbsent]}>
                      <View style={[styles.check, !absent && styles.checkOn]}>
                        <Body style={styles.checkTxt}>{absent ? '' : '✓'}</Body>
                      </View>
                      <Avatar name={p.name} size={36} />
                      <Body style={[styles.flex, absent && styles.nameAbsent]}>
                        {p.name}
                        {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                      </Body>
                      <Muted>{absent ? t.races.absent : t.races.present}</Muted>
                    </Card>
                  </Pressable>
                );
              })}
            </View>

            {error ? <Body style={styles.error}>{error}</Body> : null}
            <Button
              label={t.races.continue}
              onPress={onConfirmPresents}
              disabled={busy || presentCount < 2}
            />
            {presentCount < 2 ? <Muted>{t.races.needTwoPilots}</Muted> : null}
          </>
        ) : (
          <>
            <Title>{isCorrect ? t.races.correctTitle : t.races.rankingTitle}</Title>
            <Muted>
              {isCorrect ? t.races.correctHint : mode === 'drag' ? t.races.dragHint : t.races.tapHint}
            </Muted>
            {isLocked && !isCorrect ? <Muted>{t.races.lockedRankHint}</Muted> : null}

            {mode === 'drag' ? (
              <DragList
                items={ordered}
                keyOf={(p) => p.id}
                onReorder={onReorder}
                onDraggingChange={setDragging}
                renderItem={(p, index) => (
                  <View style={styles.dragRow}>
                    <View style={[styles.pos, styles.posOn]}>
                      <Body style={styles.posTxtOn}>{index + 1}</Body>
                    </View>
                    <Avatar name={p.name} size={34} />
                    <Body style={styles.flex} numberOfLines={1}>
                      {p.name}
                      {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                    </Body>
                  </View>
                )}
              />
            ) : (
              <View style={styles.list}>
                {present.map((p) => {
                  const pos = tapOrder.indexOf(p.id);
                  const ranked = pos >= 0;
                  return (
                    <Pressable key={p.id} onPress={() => toggleTap(p.id)} accessibilityRole="button">
                      <Card style={[styles.pilot, ranked && styles.pilotRanked]}>
                        <View style={[styles.pos, ranked && styles.posOn]}>
                          <Body style={[styles.posTxt, ranked && styles.posTxtOn]}>
                            {ranked ? pos + 1 : '·'}
                          </Body>
                        </View>
                        <Avatar name={p.name} size={36} />
                        <Body style={styles.flex}>
                          {p.name}
                          {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                        </Body>
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Pressable
              onPress={() => onSetMode(mode === 'drag' ? 'tap' : 'drag')}
              accessibilityRole="button"
              style={styles.modeSwitch}>
              <Muted style={styles.modeSwitchTxt}>
                {mode === 'drag' ? t.races.switchToTap : t.races.switchToDrag}
              </Muted>
            </Pressable>

            {error ? <Body style={styles.error}>{error}</Body> : null}

            <View style={styles.actions}>
              {mode === 'tap' && tapOrder.length > 0 ? (
                <Button label={t.races.reset} variant="ghost" onPress={() => {
                    setTapOrder([]);
                    persist({ tapOrder: [] });
                  }} />
              ) : null}
              <Button
                label={isCorrect ? t.races.confirmCorrection : t.races.validateRanking}
                onPress={onValidate}
                disabled={!canValidate || busy}
              />
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  draft: { gap: spacing.xs },
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  list: { gap: spacing.sm, marginTop: spacing.sm },
  pilot: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md },
  pilotRanked: { borderColor: colors.accent },
  pilotAbsent: { opacity: 0.55 },
  nameAbsent: { textDecorationLine: 'line-through' },
  check: {
    width: 26,
    height: 26,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.line2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: colors.pos, borderColor: colors.pos },
  checkTxt: { color: colors.bg, fontWeight: '800', fontSize: 14 },
  dragRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pos: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.line2,
  },
  posOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  posTxt: { fontFamily: fonts.serifBlack, color: colors.inkDim2 },
  posTxtOn: { fontFamily: fonts.serifBlack, color: '#fff' },
  flex: { flex: 1 },
  modeSwitch: { alignSelf: 'center', paddingVertical: spacing.sm },
  modeSwitchTxt: { textDecorationLine: 'underline' },
  error: { color: colors.accent },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
