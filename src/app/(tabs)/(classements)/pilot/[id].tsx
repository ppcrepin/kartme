import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { EloCurve } from '@/components/elo-curve';
import { Avatar, BadgeIcon, Button, Card, GradeMedal, ListRow, SkeletonCard, Tag, RangNum } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { pluriel } from '@/lib/nombre';
import { useAuth } from '@/lib/auth';
import { useExplications } from '@/lib/explications';
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
import { signedAvatarUrls } from '@/lib/avatar';
import { gradeForElo, isCalibrating } from '@/lib/grade';

const REPORT_CATEGORIES: ReportCategory[] = [
  'comportement',
  'fausse_course',
  'classement',
  'usurpation',
  'photo',
  'autre',
];

export default function PilotScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAuth();
  // `null` hors du fournisseur (galerie de composants, test unitaire) : la
  // vitrine reste alors un simple aplat, sans se présenter comme tapable.
  const explications = useExplications();

  const [pilot, setPilot] = useState<Pilot | null>(null);
  const [friendship, setFriendship] = useState<FriendshipState>({ status: 'none', friendshipId: null });
  const [duel, setDuel] = useState<FaceToFace | null>(null);
  const [curve, setCurve] = useState<EloPoint[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [badges, setBadges] = useState<Map<BadgeKey, UnlockedBadge>>(new Map());
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  // `panne` ≠ `introuvable` : sans cette distinction, l'écran restait sur un
  // squelette gris SANS AUCUN TEXTE, indéfiniment — `refresh().catch(() => {})`
  // avalait l'erreur et il n'existait pas d'état terminal. Or on arrive ici
  // d'un tap sur « Voir son profil » juste après avoir accepté un lien d'ami :
  // le geste qui suit immédiatement la conversion du canal d'acquisition n°1.
  const [etat, setEtat] = useState<'chargement' | 'pret' | 'introuvable' | 'panne'>('chargement');
  const [essai, setEssai] = useState(0);

  // MA propre fiche. Le classement y mène désormais comme vers n'importe quel
  // pilote (décision PO 2026-08-01) : la ligne « moi » n'était pas cliquable du
  // tout, ce qui se lisait comme une panne — on tape sa ligne, il ne se passe
  // rien. Elle renvoyait auparavant sur l'onglet Profil, une RACINE d'onglet :
  // téléportation sans marche arrière. Ici, on reste dans la pile du classement
  // et le « ← » ramène au classement.
  const cestMoi = !!id && session?.user.id === id;

  const refresh = useCallback(async () => {
    if (!id) return;
    // Amitié et face-à-face avec SOI-MÊME n'ont pas de sens : on ne les
    // demande pas (deux requêtes en moins, et pas de réponse à interpréter).
    const [p, f, d] = cestMoi
      ? [await getPilot(id), { status: 'none' as const, friendshipId: null }, null]
      : await Promise.all([getPilot(id), getFriendshipWith(id), faceToFace(id)]);
    setEtat(p ? 'pret' : 'introuvable');
    setPilot(p);
    setFriendship(f);
    setDuel(d);
    // Lien signé : la policy de lecture décide. Un profil privé non-ami ou un
    // pilote bloqué n'en obtient aucun → on retombe sur les initiales.
    const urls = await signedAvatarUrls([p?.avatarPath]);
    setAvatarUrl(p?.avatarPath ? (urls.get(p.avatarPath) ?? null) : null);
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
  }, [id, cestMoi]);

  useFocusEffect(
    useCallback(() => {
      // `essai` (incrémenté par « Réessayer ») est dans les dépendances : c'est
      // ce qui relance le chargement sans appeler de setState hors gestionnaire.
      void essai;
      refresh().catch(() => setEtat('panne'));
    }, [refresh, essai]),
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
  const calibrating = pilot ? isCalibrating(pilot.races) : false;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/classements'))}
          accessibilityRole="button"
          accessibilityLabel="Retour"
          hitSlop={10}
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>

        {etat === 'panne' ? (
          <View style={styles.etatBloc}>
            <Muted>{t.friends.loadError}</Muted>
            <Button label={t.inbox.retry} onPress={() => setEssai((n) => n + 1)} />
            <Button
              label={t.invite.toFriends}
              variant="ghost"
              onPress={() => router.replace('/classements')}
            />
          </View>
        ) : etat === 'introuvable' ? (
          <View style={styles.etatBloc}>
            <Muted>{t.friends.notFound}</Muted>
            <Button
              label={t.invite.toFriends}
              variant="ghost"
              onPress={() => router.replace('/classements')}
            />
          </View>
        ) : !pilot || !grade ? (
          <SkeletonCard />
        ) : blocked ? (
          <Muted>{t.friends.blocked}</Muted>
        ) : (
          <>
            {/* Identité */}
            <Card>
              <View style={styles.identity}>
                <Avatar name={pilot.username} size={52} uri={avatarUrl} />
                <View style={styles.flex}>
                  <Title style={styles.username}>{pilot.username}</Title>
                  {/* Sous 5 courses, le grade ne veut encore rien dire : on
                      annonce la calibration, comme sur la grille et les
                      classements (sinon deux écrans se contredisent). */}
                  {calibrating ? (
                    <Muted>
                      {t.profile.calibrating}
                      {pilot.eloExact ? ` · ${pilot.elo}` : ''}
                    </Muted>
                  ) : (
                    <Muted style={{ color: grade.colorTexte }}>
                      {grade.name}
                      {pilot.eloExact ? ` · ${pilot.elo}` : ''}
                    </Muted>
                  )}
                </View>
                {/* Tapable : le grade d'un AUTRE pilote est celui qu'on
                    comprend le moins — c'est là qu'on se demande « ça vaut
                    quoi, Missile des Stands ? ». L'Elo n'est passé que s'il
                    est exact (profil privé : on ne situe pas dans le grade). */}
                {calibrating ? null : (
                  <GradeMedal
                    grade={grade}
                    size={46}
                    explicable
                    sujet={{ elo: pilot.eloExact ? pilot.elo : null, pseudo: pilot.username }}
                  />
                )}
              </View>
              {pilot.isPrivate && !pilot.eloExact ? (
                <Muted style={styles.privateNote}>{t.friends.privateProfile}</Muted>
              ) : null}
            </Card>

            {/* Relation — rien de tout cela sur MA fiche : on ne s'ajoute pas
                soi-même en ami, on ne se signale pas, on ne se bloque pas. */}
            {!cestMoi && friendship.status === 'none' ? (
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

            {/* Face-à-face — sans objet contre soi-même. */}
            {cestMoi ? null : (
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
              {/* Courses où aucun des deux n'a fini : ni victoire, ni défaite. */}
              {duel && duel.draws > 0 ? (
                <Muted style={styles.duelEmpty}>
                  {t.friends.faceToFaceDraws.replace('%c', pluriel(duel.draws, 'course'))}
                </Muted>
              ) : null}
            </Card>
            )}

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
                      {/* TAPABLE (demande PO 2026-08-01 : « quand je clique
                          sur le badge de quelqu'un, je veux voir à quoi il
                          correspond »). La vitrine montrait des pictogrammes
                          muets : on voyait qu'il avait décroché quelque chose,
                          jamais quoi. Le canal existe depuis C2 et servait
                          déjà sur MA vitrine — il manquait ici.

                          Le pseudo est passé à la fiche : sans lui, « Décroché
                          le 12 juil. » se lirait comme sa propre date. */}
                      {[...badges.entries()].map(([key, obtenu]) => (
                        <Pressable
                          key={key}
                          onPress={() =>
                            explications?.expliquerBadge(
                              key,
                              obtenu.unlockedAt,
                              cestMoi ? null : (pilot.username ?? null),
                            )
                          }
                          accessibilityRole={explications ? 'button' : 'none'}
                          accessibilityLabel={t.badges.items[key]?.name ?? key}
                          style={styles.badgeMedal}>
                          <BadgeIcon badge={key} size={26} color={colors.accent} />
                        </Pressable>
                      ))}
                    </View>
                  </Card>
                ) : null}

                {history.length === 0 ? (
                  <Muted>{t.profile.historyEmpty}</Muted>
                ) : (
                  <View style={styles.historySection}>
                    <Label>{t.profile.historyOther}</Label>
                    <Card>
                      {(showAllHistory ? history : history.slice(0, 10)).map((h, i) => (
                        <ListRow
                          key={`${h.raceId}-${i}`}
                          first={i === 0}
                          onPress={h.raceId ? () => router.push(`/race/${h.raceId}`) : undefined}
                          left={
                            /* Un abandon a une position en base (l'index l'exige),
                               mais l'afficher laisserait croire qu'il a fini là. */
                            <RangNum
                      rang={h.position}
                      dnf={!!h.dnf}
                      dnfLabel={t.races.dnfShort}
                      style={styles.historyPos}
                      dnfStyle={styles.historyPosDnf}
                    />
                          }
                          title={h.circuitName ?? t.races.noCircuit}
                          sub={h.scheduledAt ? formatRaceDate(h.scheduledAt) : undefined}
                          right={
                            <Body
                              style={[
                                styles.historyDelta,
                                { color: h.eloDelta > 0 ? colors.pos : h.eloDelta < 0 ? colors.accentTexte : colors.inkDim },
                              ]}>
                              {h.eloDelta > 0 ? `▲ +${h.eloDelta}` : h.eloDelta < 0 ? `▼ ${h.eloDelta}` : '—'}
                            </Body>
                          }
                        />
                      ))}
                    </Card>
                    {history.length > 10 && !showAllHistory ? (
                      <Button
                        label={t.profile.historySeeAll.replace('%n', String(history.length))}
                        variant="ghost"
                        onPress={() => setShowAllHistory(true)}
                      />
                    ) : null}
                  </View>
                )}
              </>
            ) : null}

            {/* Signalement / blocage — bloquer reste possible après un signalement */}
            {cestMoi ? null : reporting ? (
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
  // 44 px RÉELS. `hitSlop` était censé agrandir la cible, mais
  // react-native-web ne l'implémente pas sur `Pressable` : la zone mesurait
  // 13 × 27 px et un clic 8 px sous le glyphe ne déclenchait rien.
  back: {
    alignSelf: 'flex-start',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    marginLeft: -spacing.sm,
  },
  etatBloc: { gap: spacing.md, paddingTop: spacing.md },
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
    // 44 px : c'est une COMMANDE depuis qu'elle ouvre la fiche du badge, et
    // `hitSlop` n'est pas implémenté sur `Pressable` par react-native-web —
    // la taille réelle est le seul levier.
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: colors.accent,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  historySection: { gap: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  historyPos: { fontFamily: fonts.serifBlack, fontSize: 18, minWidth: 22, textAlign: 'center', color: colors.ink },
  historyPosDnf: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '800', color: colors.inkDim2 },
  historyDelta: { fontWeight: '800' },
  reportRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  footCol: { gap: spacing.sm },
  footRow: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xl },
  footBtn: { paddingVertical: spacing.sm },
  center: { textAlign: 'center' },
});
