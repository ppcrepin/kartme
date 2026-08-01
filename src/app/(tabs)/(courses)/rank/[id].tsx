import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { DragList } from '@/components/drag-list';
import { Avatar, Banner, Button, Card } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
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
  const { id, correct } = useLocalSearchParams<{ id: string; correct?: string }>();
  const isCorrect = correct === '1'; // mode correction (lot 2.6) : roster figé, on ré-ordonne
  // Seule la CORRECTION fige le roster : on re-classe des pilotes qui ont déjà
  // couru. Une grille clôturée passait aussi par ici et faisait sauter l'étape
  // « Qui était présent ? » — or depuis C11 la clôture est obligatoire, donc
  // l'étape n'était plus jamais atteinte, et un invité qui ne s'est pas
  // présenté ne pouvait plus être retiré.
  const rosterFinal = isCorrect;
  const router = useRouter();
  const { session } = useAuth();

  const [step, setStep] = useState<Step>(rosterFinal ? 'order' : 'presents');
  // ⚠️ « glisser » par DÉFAUT depuis l'arbitrage PO du 2026-08-01 : c'est le
  // geste qui RACONTE un classement — on déplace un pilote parce qu'il est
  // arrivé devant un autre. Le toucher reste à un tap, en retrait, et le choix
  // est MÉMORISÉ : on ne repose pas la question à quelqu'un qui a tranché.
  // (Le défaut inverse valait jusque-là, sur l'argument qu'un appui long ne
  //  s'annonce pas — c'est le mode d'emploi affiché au-dessus de la liste qui
  //  y répond désormais.)
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
  const defilement = useRef<ScrollView>(null);
  // Le plancher du mode d'emploi se MESURE au lieu d'être codé à 38 px : les
  // trois consignes ne font pas la même longueur, et un plancher en pixels ne
  // suit pas l'agrandissement de police du navigateur — à 150 %, la consigne du
  // glisser passait à trois lignes quand celle du toucher restait à deux, et le
  // décalage sous le doigt revenait. On retient la plus haute vue.
  const [plancherEmploi, setPlancherEmploi] = useState(0);

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
          }
        })
        .catch(() => {});
      return () => {
        alive = false;
      };
    }, [id, session?.user.id, isCorrect]),
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

  /**
   * Remonte en haut de l'écran au changement d'étape.
   *
   * Sans cela, la position de défilement de la liste des « présents » était
   * reportée telle quelle sur l'étape de l'ordre : à six pilotes sur un petit
   * écran, on atterrissait au MILIEU de la liste — ni titre, ni mode d'emploi,
   * ni lien vers le mode toucher, qu'il fallait aller rechercher 350 px plus
   * haut. C'est le défaut qui avait bloqué un testeur en juillet, revenu par la
   * porte du défilement (mesuré à l'audit navigateur du 2026-08-01 : le lien
   * tombait jusqu'à 180 px au-dessus du bord).
   */
  function remonter() {
    defilement.current?.scrollTo({ y: 0, animated: false });
  }

  function onConfirmPresents() {
    // Rien n'est écrit en base ici : le retrait effectif des absents se fait
    // à la validation finale (revenir en arrière n'a donc aucun effet).
    const present = participants.filter((p) => !absents.has(p.id));
    setOrdered(present);
    setTapOrder([]);
    setStep('order');
    remonter();
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
    remonter();
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

  /**
   * Le glisser est ouvert, mais personne n'a encore bougé un pilote : la liste
   * n'est qu'un listing dans l'ordre des inscriptions. Le mode d'emploi porte
   * alors le rappel, à la place de la consigne générale.
   */
  const enAttenteDeGeste = mode === 'drag' && !ordreEtabli && !isCorrect;

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
      <ScrollView ref={defilement} contentContainerStyle={styles.content} scrollEnabled={!dragging}>
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

            {/* Le mode d'emploi du geste EN COURS, juste au-dessus de la liste
                qu'il décrit. UN seul bloc, et c'est voulu : tant que rien n'a
                été glissé, il porte le rappel qui explique le « Valider »
                grisé — les deux disaient la même chose l'un sous l'autre, et
                le second n'apparaissait qu'en glisser, ce qui faisait remonter
                de 50 px tout ce qui suivait au moment du changement de geste.

                Sa hauteur est PLANCHÉE à deux lignes : le texte du glisser en
                fait deux là où celui du toucher n'en fait qu'une, et sans ce
                plancher, changer de geste faisait remonter tout ce qui suit —
                y compris le lien qu'on venait de toucher. C'est le défaut que
                le PO avait relevé sur les anciennes pastilles (« ça décale vers
                le bas »), et le déplacer sous le mode d'emploi le ramenait tel
                quel. */}
            <View style={[styles.modeEmploi, { minHeight: plancherEmploi }]}>
              {/* Pas de rouge : c'est l'état d'OUVERTURE de tout le monde, pas
                  une erreur. Le « Valider » grisé juste dessous suffit à dire
                  qu'il manque un geste. */}
              <Muted
                onLayout={(e) =>
                  setPlancherEmploi((h) => Math.max(h, e.nativeEvent.layout.height))
                }>
                {isCorrect
                  ? t.races.correctHint
                  : enAttenteDeGeste
                    ? t.races.dragUntouched
                    : mode === 'drag'
                      ? t.races.dragHint
                      : t.races.tapHint}
              </Muted>
            </View>

            {/* Le geste de SECOURS. Un lien discret, en retrait, et un seul —
                plus deux grandes pastilles qui demandaient de choisir entre
                deux gestes avant même d'avoir vu la liste (décision PO
                2026-08-01). Il reste au-dessus des pilotes : sous eux, il
                tombait hors écran à six noms.

                `aria-label` explicite : « 👆 Plutôt toucher… » se lit mal à
                voix haute, et le rôle « bouton » ne dit pas qu'on change de
                mode de saisie. */}
            {!isCorrect ? (
              <Pressable
                onPress={() => onSetMode(mode === 'drag' ? 'tap' : 'drag')}
                accessibilityRole="button"
                // Le libellé dit d'où l'on part ET où l'on va : les pastilles
                // portaient un `aria-checked` qui annonçait le mode COURANT, et
                // un lien seul ne dirait que ce qu'il fera.
                accessibilityLabel={
                  mode === 'drag' ? t.races.modeVersTapAria : t.races.modeVersDragAria
                }
                style={styles.modeLien}>
                <Muted style={styles.modeLienTxt}>
                  {mode === 'drag' ? t.races.modeVersTap : t.races.modeVersDrag}
                </Muted>
              </Pressable>
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
  dnfChipTxtOn: { color: colors.accentTexte, fontWeight: '700' },
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
  // Le plancher réel vient de la mesure (`plancherEmploi`) : voir sa
  // déclaration. Ici, seulement ce qui ne dépend pas du texte.
  modeEmploi: { justifyContent: 'center' },
  // 44 px de haut réels : `hitSlop` est inerte sur `Pressable` en
  // react-native-web, et un lien de 17 px se rate au pouce.
  modeLien: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center', paddingRight: spacing.sm },
  modeLienTxt: { textDecorationLine: 'underline' },
  error: { color: colors.accentTexte },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
});
