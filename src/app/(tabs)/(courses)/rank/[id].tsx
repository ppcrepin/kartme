import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DragList } from '@/components/drag-list';
import { Avatar, Banner, Button, Card } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, fonts, radius, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
import { signedAvatarUrls } from '@/lib/avatar';
import { memoriserMode, modePrefere } from '@/lib/preferences';
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
  // ⚠️ « toucher » par DÉFAUT depuis le retour de test du 2026-07-30 : le
  // glisser-déposer sur une liste tactile est un piège connu — il faut un appui
  // long, et rien ne le dit. « Touche les pilotes dans l'ordre d'arrivée » est
  // auto-explicatif, avec un numéro qui apparaît à chaque tap. Le glisser reste
  // à un tap pour ceux qui le préfèrent, et le choix est MÉMORISÉ : on ne
  // repose pas la question à quelqu'un qui a déjà tranché.
  const [mode, setMode] = useState<Mode>(() => modePrefere());
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [absents, setAbsents] = useState<Set<string>>(new Set());
  const [ordered, setOrdered] = useState<Participant[]>([]);
  const [tapOrder, setTapOrder] = useState<string[]>([]);
  // Abandons (A6) : ids de participation. Ils sont classés DERNIERS — ex æquo
  // entre eux — et l'ordre dans lequel on les marque n'a aucune importance.
  const [dnfs, setDnfs] = useState<Set<string>>(new Set());
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restored, setRestored] = useState(false);
  // Le glisser part d'une liste PRÉ-REMPLIE dans l'ordre des inscriptions.
  // Tant que personne n'a bougé un pilote, cet ordre ne veut rien dire — et
  // valider dessus déplacerait l'Elo de tout le monde. Ce drapeau dit si
  // `ordered` est un classement voulu ou un simple listing.
  const [ordreEtabli, setOrdreEtabli] = useState(false);
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());

  useFocusEffect(
    useCallback(() => {
      // `alive` : deux entrées rapprochées sur l'écran (retour arrière rapide
      // au bord de la piste) ne doivent pas laisser l'ancienne réponse écraser
      // la récente — `setAvatars` remplace la table entière.
      let alive = true;
      listParticipants(id!, session?.user.id)
        .then(async (parts) => {
          if (!alive) return;
          setParticipants(parts);
          void signedAvatarUrls(parts.map((x) => x.avatarPath)).then((got) => {
            if (alive) setAvatars(got);
          });
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
            setDnfs(new Set(draft.dnfIds ?? []));
            setMode(draft.mode);
            setStep(draft.step);
            // Absent des brouillons d'avant : faux, donc on redemande un geste.
            setOrdreEtabli(draft.ordreEtabli === true);
            setRestored(true);
            return;
          }

          if (isCorrect) {
            // Correction : pré-remplir l'ordre ENREGISTRÉ, abandons compris —
            // sinon corriger une place effacerait tous les abandons sans le dire.
            const saved = await resultOrder(id!).catch(() => ({ order: [], dnf: [] }));
            const ord = saved.order.map((pid) => byId.get(pid)).filter(Boolean) as Participant[];
            // Le classement ENREGISTRÉ est un ordre voulu : corriger une
            // seule place ne doit pas obliger à tout reglisser.
            setOrdered(ord.length ? ord : parts);
            setOrdreEtabli(ord.length > 0);
            setDnfs(new Set(saved.dnf));
          } else if (isLocked) {
            // Course clôturée : roster figé → tous présents, ordre à saisir.
            setOrdered(parts);
          }
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [id, session?.user.id, isCorrect, isLocked]),
  );

  /**
   * Enregistre le brouillon à chaque modification. Appelé depuis les gestes
   * (et non depuis un effet) : l'état à écrire est celui qu'on vient de
   * calculer, sans passer par un rendu intermédiaire.
   */
  const persist = useCallback(
    (patch: Partial<{
      step: Step; mode: Mode; absentIds: string[]; orderedIds: string[];
      tapOrder: string[]; dnfIds: string[]; ordreEtabli: boolean;
    }>) => {
      if (isCorrect || !id) return; // la correction ne se brouillonne pas
      saveDraft(id, {
        step,
        mode,
        absentIds: [...absents],
        orderedIds: ordered.map((p) => p.id),
        tapOrder,
        dnfIds: [...dnfs],
        ordreEtabli,
        ...patch,
      });
    },
    [id, isCorrect, step, mode, absents, ordered, tapOrder, dnfs, ordreEtabli],
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
    persist({ step: 'order', orderedIds: present.map((p) => p.id), tapOrder: [], ordreEtabli: false });
  }

  /** Repartir d'une feuille blanche (le brouillon repris n'était pas le bon). */
  function onDiscardDraft() {
    clearDraft(id!);
    setRestored(false);
    setAbsents(new Set());
    setTapOrder([]);
    setDnfs(new Set());
    setOrdered(rosterFinal ? participants : []);
    setOrdreEtabli(false);
    setStep(rosterFinal ? 'order' : 'presents');
  }

  function toggleDnf(pid: string) {
    const next = new Set(dnfs);
    if (next.has(pid)) next.delete(pid);
    else next.add(pid);
    setDnfs(next);
    // En mode tap, un pilote marqué « abandon » n'a plus à être pointé : on le
    // retire de l'ordre, sinon la saisie ne pourrait jamais se compléter.
    const tap = tapOrder.filter((x) => !next.has(x));
    setTapOrder(tap);
    persist({ dnfIds: [...next], tapOrder: tap });
  }

  function onReorder(next: Participant[]) {
    setOrdered(next);
    setOrdreEtabli(true);
    persist({ orderedIds: next.map((p) => p.id), ordreEtabli: true });
  }

  function onSetMode(next: Mode) {
    // Re-toucher la pastille DÉJÀ choisie ne doit rien faire. Tant que le mode
    // se changeait par une bascule, ce cas était inatteignable ; deux pastilles
    // côte à côte le mettent à un tap — et le report ci-dessous, rejoué sur un
    // `tapOrder` périmé, écrasait SILENCIEUSEMENT un ordre qu'on venait de
    // glisser (et l'écrivait tel quel dans le brouillon local).
    if (next === mode) return;

    // Passer du tap au glisser-déposer sans reporter l'ordre pointé le perdait
    // en silence. Le bloc « abandons » vit sous la liste dans les deux modes et
    // invite justement à faire l'aller-retour.
    if (next === 'drag' && tapOrder.length > 0) {
      const byId = new Map(present.map((p) => [p.id, p]));
      const picked = tapOrder.map((pid) => byId.get(pid)).filter(Boolean) as Participant[];
      const rest = present.filter((p) => !tapOrder.includes(p.id));
      const merged = [...picked, ...rest];
      setOrdered(merged);
      // L'ordre vient d'un geste délibéré (les pilotes ont été pointés) : il
      // vaut classement, la validation peut s'ouvrir.
      setOrdreEtabli(true);
      // Le report est CONSOMMÉ : le garder rejouerait des numéros qui
      // contrediraient l'ordre glissé au prochain aller-retour.
      setTapOrder([]);
      setMode(next);
      memoriserMode(next);
      persist({ mode: next, orderedIds: merged.map((p) => p.id), tapOrder: [], ordreEtabli: true });
      return;
    }
    setMode(next);
    memoriserMode(next);
    persist({ mode: next });
  }

  function toggleTap(pid: string) {
    const next = tapOrder.includes(pid) ? tapOrder.filter((x) => x !== pid) : [...tapOrder, pid];
    setTapOrder(next);
    persist({ tapOrder: next });
  }

  async function onValidate() {
    const base = mode === 'drag' ? ordered.map((p) => p.id) : tapOrder;
    // Les abandons ferment la marche : le serveur les égalise entre eux, mais
    // leur position d'AFFICHAGE vient de leur rang dans ce tableau.
    const finishers = base.filter((pid) => !dnfs.has(pid));
    const retired = present.map((p) => p.id).filter((pid) => dnfs.has(pid));
    const order = [...finishers, ...retired];
    const dnfList = [...retired];
    setBusy(true);
    setError(null);
    try {
      if (isCorrect) {
        // Correction : roster figé, on ne fait que réordonner.
        await correctRaceResults(id!, order, dnfList);
      } else {
        // Les absents n'ont pas couru : retirés seulement maintenant, juste
        // avant le calcul (le moteur exige l'ensemble exact des participants).
        for (const pid of absents) {
          await removeParticipant(pid);
        }
        await submitRaceResults(id!, order, dnfList);
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
  /** Place à l'arrivée d'une ligne de la liste ordonnée (les abandons ne comptent pas). */
  const finishRank = (index: number) =>
    ordered.slice(0, index + 1).filter((p) => !dnfs.has(p.id)).length;
  // Une course sans arrivée ne classe rien : le serveur la refuse, l'interface
  // ne doit pas laisser croire l'inverse.
  const finishersCount = present.filter((p) => !dnfs.has(p.id)).length;
  const tapComplete = tapOrder.length === finishersCount && finishersCount >= 1;
  const canValidate =
    finishersCount >= 1 &&
    present.length >= 2 &&
    // En glisser, `ordered.length >= 2` suffisait — or la liste arrive
    // pré-remplie dans l'ORDRE SERVEUR (celui des inscriptions). Deux taps
    // — « ✥ Glisser » puis « Valider » — enregistraient donc un classement
    // arbitraire qui déplace l'Elo de tout le monde, sans qu'un seul pilote
    // ait été bougé. Le mode toucher, lui, exigeait depuis toujours que tous
    // les arrivants soient pointés : on rétablit la symétrie.
    (mode === 'drag' ? ordered.length >= 2 && ordreEtabli : tapComplete);

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} scrollEnabled={!dragging}>
        <Pressable
          onPress={() =>
            // Sans historique (PWA relancée en plein classement), le retour
            // naturel est LA COURSE que l'on classait, pas la liste.
            router.canGoBack() ? router.back() : router.replace(`/race/${id}`)
          }
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
                      <Avatar
                        name={p.name}
                        size={36}
                        uri={p.avatarPath ? (avatars.get(p.avatarPath) ?? null) : null}
                        cacheKey={p.avatarPath}
                      />
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

            {/* Le choix du geste vit AU-DESSUS de la liste. Il était un lien
                gris SOUS les pilotes : avec six ou huit noms, il tombait hors
                écran au moment précis où l'on galère. Un testeur est resté
                bloqué sur le glisser sans savoir que l'autre mode existait.

                Et il vient AVANT le mode d'emploi, pas après : le texte du
                glisser fait deux lignes là où celui du toucher n'en fait
                qu'une, si bien que choisir un mode faisait DESCENDRE les deux
                pastilles — le bouton fuyait sous le doigt qui venait de le
                toucher. Ancrées sous le titre, elles ne bougent plus, et le
                mode d'emploi peut respirer autant qu'il veut. */}
            {!isCorrect ? (
              <View style={styles.modeRow} accessibilityRole="radiogroup">
                {(['tap', 'drag'] as const).map((m) => (
                  <Pressable
                    key={m}
                    onPress={() => onSetMode(m)}
                    // `radio` et non `button` : `aria-selected` / `aria-checked`
                    // ne sont pas supportés sur `role="button"` et y sont
                    // ignorés — le mode actif n'aurait été signalé que par la
                    // couleur, donc invisible au lecteur d'écran ET à qui
                    // distingue mal le rouge.
                    accessibilityRole="radio"
                    aria-checked={mode === m}
                    style={[styles.modeChip, mode === m && styles.modeChipOn]}>
                    <Body style={[styles.modeChipTxt, mode === m && styles.modeChipTxtOn]}>
                      {m === 'tap' ? t.races.modeTap : t.races.modeDrag}
                    </Body>
                  </Pressable>
                ))}
              </View>
            ) : null}

            {/* Le mode d'emploi du geste choisi, juste au-dessus de la liste
                qu'il décrit. C'est LUI qui change de hauteur d'un mode à
                l'autre : il est donc placé sous ce qui ne doit pas bouger. */}
            <Muted>
              {isCorrect ? t.races.correctHint : mode === 'drag' ? t.races.dragHint : t.races.tapHint}
            </Muted>
            {isLocked && !isCorrect ? <Muted>{t.races.lockedRankHint}</Muted> : null}
            {/* Le rappel vit ICI, pas sous le bouton : sous le bouton il
                tombait hors écran, et l'on ne voyait qu'un « Valider » grisé
                sans savoir ce qu'il attendait. */}
            {mode === 'drag' && !ordreEtabli && !isCorrect ? (
              <Muted style={styles.dragAttente}>{t.races.dragUntouched}</Muted>
            ) : null}

            {mode === 'drag' ? (
              <DragList
                items={ordered}
                keyOf={(p) => p.id}
                onReorder={onReorder}
                onDraggingChange={setDragging}
                renderItem={(p, index) => {
                  const out = dnfs.has(p.id);
                  return (
                    <View style={styles.dragRow}>
                      <View
                        style={[
                          styles.pos,
                          out ? styles.posOut : ordreEtabli ? styles.posOn : styles.posEnAttente,
                        ]}>
                        <Body style={out ? styles.posTxtOut : styles.posTxtOn}>
                          {out ? t.races.dnfShort : finishRank(index)}
                        </Body>
                      </View>
                      <Avatar
                        name={p.name}
                        size={34}
                        uri={p.avatarPath ? (avatars.get(p.avatarPath) ?? null) : null}
                        cacheKey={p.avatarPath}
                      />
                      <Body style={[styles.flex, out && styles.nameAbsent]} numberOfLines={1}>
                        {p.name}
                        {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                      </Body>
                    </View>
                  );
                }}
              />
            ) : (
              <View style={styles.list}>
                {present.map((p) => {
                  const out = dnfs.has(p.id);
                  const pos = tapOrder.indexOf(p.id);
                  const ranked = pos >= 0;
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => (out ? undefined : toggleTap(p.id))}
                      disabled={out}
                      accessibilityRole="button">
                      <Card style={[styles.pilot, ranked && styles.pilotRanked, out && styles.pilotAbsent]}>
                        <View style={[styles.pos, ranked && styles.posOn, out && styles.posOut]}>
                          <Body style={[styles.posTxt, ranked && styles.posTxtOn, out && styles.posTxtOut]}>
                            {out ? t.races.dnfShort : ranked ? pos + 1 : '·'}
                          </Body>
                        </View>
                        <Avatar
                        name={p.name}
                        size={36}
                        uri={p.avatarPath ? (avatars.get(p.avatarPath) ?? null) : null}
                        cacheKey={p.avatarPath}
                      />
                        <Body style={[styles.flex, out && styles.nameAbsent]}>
                          {p.name}
                          {p.isSelf ? <Muted> ({t.races.you})</Muted> : null}
                        </Body>
                      </Card>
                    </Pressable>
                  );
                })}
              </View>
            )}

            {/* Abandons (A6) — section à part plutôt qu'un bouton dans chaque
                ligne : en mode glisser-déposer, un appui dans la ligne entrerait
                en conflit avec le geste de déplacement. */}
            <View style={styles.dnfBlock}>
              <Muted style={styles.dnfTitle}>{t.races.dnfTitle}</Muted>
              <Muted>{t.races.dnfHint}</Muted>
              <View style={styles.dnfChips}>
                {present.map((p) => {
                  const out = dnfs.has(p.id);
                  return (
                    <Pressable
                      key={p.id}
                      onPress={() => toggleDnf(p.id)}
                      accessibilityRole="button"
                      aria-pressed={out}
                      style={[styles.dnfChip, out && styles.dnfChipOn]}>
                      <Body style={[styles.dnfChipTxt, out && styles.dnfChipTxtOn]}>
                        {out ? '✕ ' : ''}{p.name}
                      </Body>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {error ? <Body style={styles.error}>{error}</Body> : null}

            <View style={styles.actions}>
              {mode === 'tap' && tapOrder.length > 0 ? (
                <Button label={t.races.reset} variant="ghost" onPress={() => {
                    setTapOrder([]);
                    persist({ tapOrder: [] });
                  }} />
              ) : null}
              {/* Sans ce mot, le bouton grisé n'explique rien : l'admin qui a
                  tout marqué en abandon ne comprend pas pourquoi ça bloque. */}
              <Button
                label={isCorrect ? t.races.confirmCorrection : t.races.validateRanking}
                onPress={onValidate}
                disabled={!canValidate || busy}
              />
            </View>
            {finishersCount < 1 ? <Muted>{t.races.needOneFinisher}</Muted> : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  draft: { gap: spacing.xs },
  posOut: { backgroundColor: 'transparent', borderColor: colors.line, borderWidth: 1 },
  // Ordre pas encore établi : le chiffre reste, en gris — il dit la position
  // dans la liste, pas un classement. Le rouge plein est réservé à ce qui a
  // été VOULU, comme les numéros du mode toucher.
  posEnAttente: { backgroundColor: 'transparent', borderColor: colors.line2, borderWidth: 1 },
  dragAttente: { color: colors.accent },
  posTxtOut: { color: colors.inkDim2, fontSize: 10, fontWeight: '800' },
  dnfBlock: { gap: spacing.xs, marginTop: spacing.md, paddingTop: spacing.sm, borderTopWidth: 1, borderTopColor: colors.line },
  dnfTitle: { color: colors.ink, fontWeight: '700' },
  dnfChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.xs },
  // 44 px : marquer un abandon change le résultat d'un pilote, et à huit
  // pilotes les pastilles se touchent sur deux rangs. À 31 px on visait la
  // voisine.
  dnfChip: {
    minHeight: 44,
    justifyContent: 'center',
    paddingVertical: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  dnfChipOn: { borderColor: colors.accent },
  dnfChipTxt: { fontSize: 13, color: colors.inkDim },
  dnfChipTxtOn: { color: colors.accent, fontWeight: '700' },
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  // 44 px, et une marge négative pour que la flèche reste optiquement collée
  // au bord malgré sa zone élargie. `Screen` a la même parade ; ces deux écrans
  // ont leur propre `back` et l'avaient ratée — 13 × 27 px mesurés en
  // navigateur, alors que `hitSlop` n'existe pas sur `Pressable` en web. Sur
  // l'écran de saisie, c'est la SEULE sortie.
  back: {
    alignSelf: 'flex-start',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
    paddingHorizontal: spacing.sm,
  },
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
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeChip: {
    flex: 1,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1.5,
    borderColor: colors.line2,
  },
  modeChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeChipTxt: { color: colors.inkDim, fontWeight: '700' },
  modeChipTxtOn: { color: colors.ink },
  error: { color: colors.accent },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
