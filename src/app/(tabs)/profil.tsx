import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { EloCurve } from '@/components/elo-curve';
import { Screen } from '@/components/screen';
import { Avatar, BadgeIcon, Button, Card, Gauge, GradeMedal, SkeletonCard } from '@/components/ui';
import {
  avatarPickSupported,
  pickImage,
  removeMyAvatar,
  signedAvatarUrls,
  uploadAvatar,
} from '@/lib/avatar';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';
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
const deltaColor = (d: number) => (d > 0 ? colors.pos : d < 0 ? colors.accent : colors.inkDim);
const HISTORY_CAP = 10; // on n'affiche que les 10 dernières courses par défaut (perf + accès au pied de page)

export default function ProfilScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  const [profile, setProfile] = useState<MyProfile | null>(null);
  const [curve, setCurve] = useState<EloPoint[]>([]);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showAllHistory, setShowAllHistory] = useState(false);
  const [badges, setBadges] = useState<Map<BadgeKey, UnlockedBadge>>(new Map());
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoError, setPhotoError] = useState<string | null>(null);

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

  async function onPickPhoto() {
    setPhotoError(null);
    const file = await pickImage();
    if (!file) return;
    setPhotoBusy(true);
    try {
      await uploadAvatar(file);
      await load();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t.profile.photoError);
    } finally {
      setPhotoBusy(false);
    }
  }

  async function onRemovePhoto() {
    setPhotoError(null);
    setPhotoBusy(true);
    try {
      await removeMyAvatar();
      await load();
    } catch (e) {
      setPhotoError(e instanceof Error ? e.message : t.profile.photoError);
    } finally {
      setPhotoBusy(false);
    }
  }

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

  const shownHistory = showAllHistory ? history : history.slice(0, HISTORY_CAP);

  return (
    <Screen
      title={t.tabs.profile}
      headerAction={
        <Pressable
          onPress={() => router.push('/settings')}
          accessibilityRole="button"
          accessibilityLabel={t.settings.title}
          hitSlop={10}>
          <Body style={styles.gear}>⚙︎</Body>
        </Pressable>
      }>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Identité + Elo + grade */}
        <Card>
          <View style={styles.identityRow}>
            <Avatar name={profile.username} size={52} uri={avatarUrl} />
            <View style={styles.flex}>
              <Title style={styles.username}>{profile.username}</Title>
              {session?.user.email ? <Muted>{session.user.email}</Muted> : null}
              {/* Photo : proposée seulement là où on sait la choisir (web/PWA).
                  Sur natif, le sélecteur viendra avec les builds iOS/Android. */}
              {avatarPickSupported() ? (
                <View style={styles.photoRow}>
                  <Pressable onPress={onPickPhoto} disabled={photoBusy} accessibilityRole="button">
                    <Muted style={styles.photoLink}>
                      {photoBusy
                        ? t.profile.photoBusy
                        : profile.avatarPath
                          ? t.profile.photoChange
                          : t.profile.photoAdd}
                    </Muted>
                  </Pressable>
                  {profile.avatarPath && !photoBusy ? (
                    <Pressable onPress={onRemovePhoto} accessibilityRole="button">
                      <Muted style={styles.photoLink}>{t.profile.photoRemove}</Muted>
                    </Pressable>
                  ) : null}
                </View>
              ) : null}
              {photoError ? <Muted style={styles.photoError}>{photoError}</Muted> : null}
            </View>
            <GradeMedal grade={gp.current} size={46} />
          </View>

          <View style={styles.eloRow}>
            <View>
              <Label>{t.profile.eloLabel}</Label>
              <Body style={styles.eloBig}>{profile.elo}</Body>
            </View>
            <View style={styles.flex}>
              <Body style={[styles.gradeName, { color: gp.current.color }]}>{gp.current.name}</Body>
              <Gauge value={gp.progress} color={gp.current.color} />
              <Muted style={styles.nextGrade}>
                {gp.next
                  ? t.profile.nextGrade.replace('%n', String(gp.remaining)).replace('%g', gp.next.name)
                  : t.profile.maxGrade}
              </Muted>
              {isCalibrating(stats.races) ? (
                <Muted style={styles.nextGrade}>
                  {t.profile.calibratingHint.replace(
                    '%n',
                    String(CALIBRATION_RACES - stats.races),
                  )}
                </Muted>
              ) : null}
            </View>
          </View>
        </Card>

        {/* Stats */}
        <View style={styles.statsRow}>
          <Stat label={t.profile.races} value={stats.races} />
          <Stat label={t.profile.wins} value={stats.wins} />
          <Stat label={t.profile.podiums} value={stats.podiums} />
        </View>

        {/* Courbe */}
        <Card>
          <Label>{t.profile.curve}</Label>
          {curve.length === 0 ? (
            <Muted style={styles.curveEmpty}>{t.profile.curveEmpty}</Muted>
          ) : (
            <EloCurve points={curve} />
          )}
        </Card>

        {/* Badges (R3 : catalogue complet via « Voir tous les badges ») */}
        <Pressable onPress={() => router.push('/badges')} accessibilityRole="button">
          <Card>
            <View style={styles.badgesHead}>
              <Label>{t.profile.badges}</Label>
              <Muted style={styles.badgesLink}>{t.badges.seeAll} ›</Muted>
            </View>
            <View style={styles.badgesRow}>
              {BADGE_KEYS.map((key) => {
                const got = badges.has(key);
                return (
                  <View key={key} style={[styles.badgeMedal, got ? styles.badgeOn : styles.badgeOff]}>
                    <BadgeIcon badge={key} size={26} color={got ? colors.accent : colors.inkDim} />
                  </View>
                );
              })}
            </View>
            <Muted style={styles.badgesSoon}>
              {badges.size === 0
                ? t.badges.none
                : t.badges.progress
                    .replace('%u', String(badges.size))
                    .replace('%t', String(BADGE_KEYS.length))}
            </Muted>
          </Card>
        </Pressable>

        {/* Échelle des grades */}
        <Button label={t.profile.gradesLadder} variant="ghost" onPress={() => router.push('/grades')} />

        {/* Historique */}
        <View style={styles.section}>
          <Label>{t.profile.history}</Label>
          {history.length === 0 ? (
            <Muted>{t.profile.historyEmpty}</Muted>
          ) : (
            shownHistory.map((h, i) => (
              <Pressable
                key={`${h.raceId}-${i}`}
                onPress={() => h.raceId && router.push(`/race/${h.raceId}`)}
                accessibilityRole="button">
                <Card>
                  <View style={styles.historyRow}>
                    {/* Un abandon a bien une position en base (l'index l'exige), mais
    l'afficher laisserait croire qu'il a fini là. */}
                            <Body style={[styles.historyPos, h.dnf && styles.historyPosDnf]}>
                              {h.dnf ? t.races.dnfShort : h.position}
                            </Body>
                    <View style={styles.flex}>
                      <Body>{h.circuitName ?? t.races.noCircuit}</Body>
                      {h.scheduledAt ? <Muted>{formatRaceDate(h.scheduledAt)}</Muted> : null}
                    </View>
                    <View style={styles.historyElo}>
                      <Body style={[styles.historyDelta, { color: deltaColor(h.eloDelta) }]}>
                        {fmtDelta(h.eloDelta)}
                      </Body>
                      <Muted>{h.eloAfter}</Muted>
                    </View>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
          {history.length > HISTORY_CAP && !showAllHistory ? (
            <Button
              label={t.profile.historySeeAll.replace('%n', String(history.length))}
              variant="ghost"
              onPress={() => setShowAllHistory(true)}
            />
          ) : null}
        </View>

        {/* Pied de page */}
        <View style={styles.foot}>
          <Button label={t.auth.signOut} variant="ghost" onPress={signOut} />
        </View>
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
  content: { gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  flex: { flex: 1 },
  identityRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  username: { fontSize: 22, lineHeight: 26 },
  eloRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.lg,
    marginTop: spacing.lg,
  },
  eloBig: { fontFamily: fonts.serifBlack, fontSize: 40, lineHeight: 44, color: colors.ink },
  gradeName: { fontWeight: '800', marginBottom: spacing.xs },
  nextGrade: { marginTop: spacing.xs, fontSize: 12 },
  statsRow: { flexDirection: 'row', gap: spacing.sm },
  stat: { flex: 1, alignItems: 'center', paddingVertical: spacing.md },
  statValue: { fontFamily: fonts.serifBlack, fontSize: 24, color: colors.ink },
  statLabel: { fontSize: 11 },
  curveEmpty: { marginTop: spacing.sm },
  badgesHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badgesLink: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  badgesRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginVertical: spacing.sm },
  badgeMedal: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeOn: { borderColor: colors.accent, backgroundColor: colors.surface },
  badgeOff: { borderColor: colors.line2, backgroundColor: colors.surface2, opacity: 0.6 },
  badgesSoon: { fontSize: 12 },
  section: { gap: spacing.sm },
  historyRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  photoRow: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  photoLink: { color: colors.accent, fontWeight: '700', fontSize: 12 },
  photoError: { color: colors.accent, fontSize: 12, marginTop: 2 },
  historyPos: { fontFamily: fonts.serifBlack, fontSize: 18, width: 22, textAlign: 'center', color: colors.ink },
  historyPosDnf: { fontFamily: fonts.sans, fontSize: 10, fontWeight: '800', color: colors.inkDim2 },
  historyElo: { alignItems: 'flex-end' },
  historyDelta: { fontWeight: '800' },
  foot: { gap: spacing.sm, marginTop: spacing.md, alignItems: 'flex-start' },
  gear: { fontSize: 22, color: colors.ink },
});
