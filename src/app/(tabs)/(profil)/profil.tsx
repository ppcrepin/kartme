import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EloCurve } from '@/components/elo-curve';
import { Screen } from '@/components/screen';
import { ShareCard } from '@/components/share-card';
import { Avatar, Button, Card, Gauge, GradeMedal, ListRow, Sheet, SkeletonCard } from '@/components/ui';
import { appBaseUrl } from '@/lib/url';
import { signedAvatarUrls } from '@/lib/avatar';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing, couleurRang } from '@/constants/theme';
import { t } from '@/i18n';
import { pluriel } from '@/lib/nombre';
import { BADGE_KEYS, listBadges, type BadgeKey, type UnlockedBadge } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';
import { CALIBRATION_RACES, gradeProgress, isCalibrating } from '@/lib/grade';
import {
  getEloCurve,
  getMyProfile,
  getRaceHistory,
  statsFromHistory,
  type EloPoint,
  type HistoryEntry,
  type MyProfile,
} from '@/lib/profile';

const fmtDelta = (d: number) => (d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—');
const deltaColor = (d: number) => (d > 0 ? colors.pos : d < 0 ? colors.accentTexte : colors.inkDim);
// 5 dernières courses (décision PO 2026-07-30) : le profil complet tient d'un
// coup ; l'historique entier vit sur son propre écran.
const HISTORY_CAP = 5;

export default function ProfilScreen() {
  const router = useRouter();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [curve, setCurve] = useState<EloPoint[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [badges, setBadges] = useState<Map<BadgeKey, UnlockedBadge>>(new Map());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [inviteOuvert, setInviteOuvert] = useState(false);

  const load = useCallback(async (alive: () => boolean = () => true) => {
    const [p, c, h, b] = await Promise.all([
      getMyProfile(),
      getEloCurve(),
      getRaceHistory(),
      listBadges(),
    ]);
    if (!alive()) return;
    setProfile(p);
    setCurve(c);
    setHistory(h);
    setBadges(b);
    // Le lien signé se demande APRÈS le profil : il expire, il ne se met pas
    // en cache avec le reste.
    const urls = await signedAvatarUrls([p?.avatarPath]);
    if (alive()) setAvatarUrl(p?.avatarPath ? (urls.get(p.avatarPath) ?? null) : null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      load(() => active).catch(() => {});
      return () => {
        active = false;
      };
    }, [load]),
  );

  if (!profile) {
    return (
      <Screen title={t.tabs.profile}>
        <SkeletonCard />
        <SkeletonCard />
      </Screen>
    );
  }

  const gp = gradeProgress(profile.elo);
  const stats = statsFromHistory(history);

  return (
    <Screen
      title={t.tabs.profile}
      headerAction={
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          // Pas de `hitSlop` : inerte sur `Pressable` en react-native-web.
          // La zone vient de `gear`, qui mesurait 20 × 21 px — quatre fois
          // moins que le minimum, pour la porte de tous les réglages.
          accessibilityLabel={t.settings.title}>
          <Body style={styles.gear}>⚙︎</Body>
        </Pressable>
      }>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* ── Carte d'identité FUSIONNÉE (A17, levier L5) : identité + Elo +
            grade + jauge + courbe en un bloc. L'e-mail, la photo et la
            déconnexion ont déménagé dans Réglages → Compte : des actions
            « une fois dans la vie » occupaient le premier écran à chaque
            visite. ── */}
        <Card>
          <View style={styles.identityRow}>
            <Avatar name={profile.username} size={48} uri={avatarUrl} cacheKey={profile.avatarPath} />
            <View style={styles.flex}>
              <Title style={styles.username}>{profile.username}</Title>
              <Body style={[styles.gradeName, { color: gp.current.colorTexte }]}>
                {gp.current.name} · {profile.elo}
              </Body>
            </View>
            <GradeMedal
              grade={gp.current}
              size={42}
              explicable
              sujet={{ elo: profile.elo, courses: stats.races }}
            />
          </View>

          {/* La part vide prend la teinte du grade VISÉ, et son nom s'écrit
              dans la même couleur juste dessous : la jauge montait vers rien
              qu'on puisse nommer (retour de test 2026-08-01). */}
          <Gauge
            value={gp.progress}
            color={gp.current.color}
            couleurSuivante={gp.next?.color}
          />
          <Muted style={styles.nextGrade}>
            {gp.next ? (
              (() => {
                const [avant, apres] = t.profile.nextGrade
                  .replace('%n', String(gp.remaining))
                  .replace('%s', String(gp.next.min))
                  .split('%g');
                return (
                  <>
                    {avant}
                    {/* `styles.nextGrade` aussi sur le texte IMBRIQUÉ : sans
                        lui, le nom du grade retombait sur la taille par défaut
                        de `Muted` (13 px) au milieu d'une phrase en 12 px. */}
                    <Muted style={[styles.nextGrade, { color: gp.next.colorTexte }]}>
                      {gp.next.name}
                    </Muted>
                    {apres}
                  </>
                );
              })()
            ) : (
              t.profile.maxGrade
            )}
          </Muted>
          {isCalibrating(stats.races) ? (
            <Muted style={styles.nextGrade}>
              {t.profile.calibratingHint.replace('%c', pluriel(CALIBRATION_RACES - stats.races, 'course'))}
            </Muted>
          ) : null}

          {curve.length > 0 ? (
            <EloCurve
              points={curve}
              height={72}
              seuil={gp.next ? { valeur: gp.next.min, couleur: gp.next.color } : null}
            />
          ) : null}
        </Card>

        {/* ── Stats en 4 colonnes — les badges rejoignent la rangée (L6) : le
            catalogue reste à un tap, la grille d'icônes ne coûte plus 120 px. ── */}
        <View style={styles.statsRow}>
          <Stat label={t.profile.races} value={stats.races} />
          <Stat label={t.profile.wins} value={stats.wins} />
          <Stat label={t.profile.podiums} value={stats.podiums} />
          <Pressable
            onPress={() => router.push('/badges')}
            accessibilityRole="button"
            accessibilityLabel={t.badges.seeAll}
            style={styles.flex}>
            <Card style={styles.stat}>
              <Body style={styles.statValue}>
                {badges.size}
                <Body style={styles.statTotal}>/{BADGE_KEYS.length}</Body>
              </Body>
              <Muted style={styles.statLabel}>{t.profile.badges} ›</Muted>
            </Card>
          </Pressable>
        </View>

        {/* Échelle des grades */}
        <Button label={t.profile.gradesLadder} variant="ghost" onPress={() => router.push('/grades')} />

        {/* ── Inviter un ami : déménagé de l'onglet Amis, supprimé le
            2026-08-01. C'est le canal d'acquisition n°1 — quelqu'un qui n'a PAS
            l'application s'inscrit par ce lien et vous êtes amis en un tap,
            sans demande à valider. Il atterrit sur le profil et non sur le
            classement : c'est un geste qui part de SOI, et c'est là qu'on va
            chercher son propre lien. ── */}
        <Pressable
          onPress={() => setInviteOuvert(true)}
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

        {/* ── Historique : 5 dernières + écran dédié (décision PO) — le
            profil complet tient d'un coup, la tendance récente reste. ── */}
        <View style={styles.section}>
          <Label>{t.profile.history}</Label>
          {history.length === 0 ? (
            <Muted>{t.profile.historyEmpty}</Muted>
          ) : (
            <Card>
              {history.slice(0, HISTORY_CAP).map((h, i) => (
                <ListRow
                  key={`${h.raceId}-${i}`}
                  first={i === 0}
                  onPress={h.raceId ? () => router.push(`/race/${h.raceId}`) : undefined}
                  left={
                    <Body
                    style={[
                      [styles.historyPos, h.dnf && styles.historyPosDnf],
                      !h.dnf && couleurRang(h.position) ? { color: couleurRang(h.position)! } : null,
                    ]}
                  >
                      {h.dnf ? t.races.dnfShort : h.position}
                    </Body>
                  }
                  title={h.circuitName ?? t.races.noCircuit}
                  sub={h.scheduledAt ? formatRaceDate(h.scheduledAt) : undefined}
                  right={
                    <View style={styles.historyElo}>
                      <Body style={[styles.historyDelta, { color: deltaColor(h.eloDelta) }]}>
                        {fmtDelta(h.eloDelta)}
                      </Body>
                      <Muted style={styles.historyAfter}>{h.eloAfter}</Muted>
                    </View>
                  }
                />
              ))}
            </Card>
          )}
          {history.length > HISTORY_CAP ? (
            <Button
              label={t.profile.historySeeAll.replace('%n', String(history.length))}
              variant="ghost"
              onPress={() => router.push('/historique')}
            />
          ) : null}
        </View>
        <Sheet
          open={inviteOuvert}
          onClose={() => setInviteOuvert(false)}
          title={t.invite.shareTitle}>
          {/* PAS de `?ref=` ajouté : l'identifiant est déjà dans le chemin, le
              doubler faisait un lien de 106 caractères qu'on ne dicte pas au
              bord d'une piste. Le parrainage se mesure à l'arrivée. */}
          <ShareCard
            url={`${appBaseUrl()}invite/${profile.id}`}
            title={t.invite.shareCta}
            noRef
          />
        </Sheet>
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Card style={styles.stat}>
      <Body style={styles.statValue}>{value}</Body>
      <Muted style={styles.statLabel}>{label}</Muted>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { gap: spacing.md, paddingBottom: spacing.xl },
  flex: { flex: 1 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginBottom: spacing.sm },
  username: { fontSize: 20, lineHeight: 24 },
  gradeName: { fontWeight: '800' },
  nextGrade: { marginTop: spacing.xs, fontSize: 12, marginBottom: spacing.sm },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.sm, paddingHorizontal: spacing.xs },
  statValue: { fontFamily: fonts.serifBlack, fontSize: 22, color: colors.ink },
  statTotal: { fontFamily: fonts.sans, fontSize: 12, color: colors.inkDim },
  statLabel: { fontSize: 11 },
  section: { gap: spacing.sm },
  historyPos: { fontFamily: fonts.serifBlack, fontSize: 16, minWidth: 22, textAlign: 'center', color: colors.ink },
  historyPosDnf: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '800', color: colors.inkDim2 },
  historyElo: { alignItems: 'flex-end' },
  historyDelta: { fontWeight: '800', fontSize: 13 },
  historyAfter: { fontSize: 11 },
  inviteRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inviteTitle: { fontWeight: '700' },
  inviteHint: { fontSize: 11, lineHeight: 15 },
  chevron: { color: colors.inkDim2, fontSize: 20 },
  gear: {
    fontSize: 22,
    color: colors.ink,
    minWidth: 44,
    minHeight: 44,
    lineHeight: 44,
    textAlign: 'center',
    marginRight: -spacing.sm,
  },
});
