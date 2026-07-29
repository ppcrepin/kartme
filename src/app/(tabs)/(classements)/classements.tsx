import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar, Button, Card, GradeMedal, Tag } from '@/components/ui';
import { Body, Muted } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { SIGNED_TTL_S, signedAvatarUrls } from '@/lib/avatar';
import { gradeForElo, isCalibrating } from '@/lib/grade';
import {
  getLeaderboard,
  getMyRank,
  LEADERBOARD_PAGE,
  type LeaderboardRow,
  type LeaderboardScope,
  type MyRank,
} from '@/lib/leaderboard';

type Loaded = {
  rows: LeaderboardRow[];
  myRank: MyRank | null;
  /** false dès qu'une page revient incomplète : plus rien à charger. */
  mayHaveMore: boolean;
};

/** Clé stable d'une ligne (pilote inscrit ou fantôme). */
const rowKey = (r: LeaderboardRow) => r.pilotId ?? '';

/** Un lien signé est renouvelé une minute avant d'expirer (marge réseau). */
const AVATAR_STALE_MS = (SIGNED_TTL_S - 60) * 1000;

/** Ordinal français court : 1ᵉʳ, 2ᵉ, 3ᵉ… */
const ordinal = (n: number) => (n === 1 ? '1ᵉʳ' : `${n}ᵉ`);

export default function ClassementsScreen() {
  const router = useRouter();
  const [scope, setScope] = useState<LeaderboardScope>('friends');
  // État rangé PAR portée : une réponse tardive de l'autre portée ne peut
  // jamais écraser celle affichée, et re-basculer retrouve le cache.
  const [loaded, setLoaded] = useState<Partial<Record<LeaderboardScope, Loaded>>>({});
  const [failed, setFailed] = useState<Partial<Record<LeaderboardScope, boolean>>>({});
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreFailed, setMoreFailed] = useState(false);
  // Liens signés des photos, cumulés au fil des pages.
  const [avatars, setAvatars] = useState<Map<string, string>>(new Map());
  // Date de signature de chaque chemin. Indispensable ici et nulle part
  // ailleurs : un lien signé expire (SIGNED_TTL_S), et les autres écrans
  // re-signent tout à chaque retour dessus. Celui-ci cumule les pages, donc
  // sans cette date un onglet resté monté garderait éternellement des URI
  // mortes — l'écran retomberait aux initiales au bout de cinq minutes.
  const signedAt = useRef<Map<string, number>>(new Map());

  /** Signe ce qui manque ou a vieilli, puis fusionne. Une requête au plus. */
  const mergeAvatars = useCallback(async (rows: { avatarPath: string | null }[]) => {
    const now = Date.now();
    const todo = new Set<string>();
    for (const r of rows) {
      const at = r.avatarPath ? signedAt.current.get(r.avatarPath) : 0;
      if (r.avatarPath && (at === undefined || now - at > AVATAR_STALE_MS)) todo.add(r.avatarPath);
    }
    if (todo.size === 0) return;
    const got = await signedAvatarUrls([...todo]);
    // Seuls les chemins réellement signés sont datés : un refus (photo
    // retirée, pilote suspendu) sera retenté au prochain retour sur l'écran
    // plutôt que figé pour la durée de la session.
    for (const path of got.keys()) signedAt.current.set(path, now);
    if (got.size > 0) setAvatars((cur) => new Map([...cur, ...got]));
  }, []);
  // Un seul chargement en vol par portée (ref : pas besoin de re-rendu).
  const inFlight = useRef<Partial<Record<LeaderboardScope, boolean>>>({});
  // Bascule auto vers « Global » une seule fois si l'onglet Amis est vide
  // (un nouveau sans amis verrait sinon un classement désert).
  const autoSwitched = useRef(false);

  const load = useCallback((sc: LeaderboardScope) => {
    if (inFlight.current[sc]) return;
    inFlight.current[sc] = true;
    Promise.all([getLeaderboard(sc, LEADERBOARD_PAGE, 0), getMyRank(sc)])
      .then(([rows, myRank]) => {
        setLoaded((prev) => ({
          ...prev,
          [sc]: { rows, myRank, mayHaveMore: rows.length === LEADERBOARD_PAGE },
        }));
        setFailed((prev) => ({ ...prev, [sc]: false }));
        void mergeAvatars(rows);
        if (sc === 'friends' && rows.length === 0 && !autoSwitched.current) {
          autoSwitched.current = true;
          setScope('global');
        }
      })
      .catch(() => {
        setFailed((prev) => ({ ...prev, [sc]: true }));
      })
      .finally(() => {
        inFlight.current[sc] = false;
      });
  }, [mergeAvatars]);

  useFocusEffect(
    useCallback(() => {
      load(scope);
    }, [load, scope]),
  );

  const current = loaded[scope];
  const showError = !current && failed[scope] === true;

  async function onLoadMore() {
    if (!current || loadingMore) return;
    setLoadingMore(true);
    setMoreFailed(false);
    try {
      const next = await getLeaderboard(scope, LEADERBOARD_PAGE, current.rows.length);
      // Dédoublonnage : si les Elo ont bougé entre deux pages, un pilote peut
      // réapparaître dans la fenêtre suivante — on garde sa première ligne.
      const seen = new Set(current.rows.map(rowKey));
      const fresh = next.filter((r) => !seen.has(rowKey(r)));
      // Toutes les lignes, pas seulement les nouvelles : la page 1 peut avoir
      // vieilli pendant qu'on faisait défiler.
      void mergeAvatars([...current.rows, ...fresh]);
      setLoaded((prev) => ({
        ...prev,
        [scope]: {
          ...current,
          rows: [...current.rows, ...fresh],
          mayHaveMore: next.length === LEADERBOARD_PAGE,
        },
      }));
    } catch {
      setMoreFailed(true);
    } finally {
      setLoadingMore(false);
    }
  }

  function openPilot(row: LeaderboardRow) {
    if (row.isMe) router.push('/profil');
    else if (row.pilotId) router.push(`/pilot/${row.pilotId}`);
  }

  function switchScope(sc: LeaderboardScope) {
    setScope(sc);
    setMoreFailed(false);
  }

  const mr = current?.myRank ?? null;
  // Top X% (portée globale) : ceil pour que le 1er soit « Top 1% », jamais 0.
  const topPct = mr && mr.total > 0 ? Math.max(1, Math.ceil((mr.rank / mr.total) * 100)) : null;
  const myGrade = mr ? gradeForElo(mr.elo) : null;

  return (
    <Screen title={t.tabs.rankings}>
      <View style={styles.filters}>
        <Tag
          label={t.rankings.scopeFriends}
          selected={scope === 'friends'}
          onPress={() => switchScope('friends')}
        />
        <Tag
          label={t.rankings.scopeGlobal}
          selected={scope === 'global'}
          onPress={() => switchScope('global')}
        />
      </View>

      {/* Ma position — carte de statut relatif épinglée */}
      {mr && myGrade ? (
        <Card style={styles.posCard}>
          <View style={styles.posRow}>
            <View>
              <Muted style={styles.posLabel}>{t.rankings.myPosition}</Muted>
              <Body style={styles.posRank}>
                {ordinal(mr.rank)} <Muted style={styles.posTotal}>/ {mr.total}</Muted>
              </Body>
            </View>
            <View style={styles.posRight}>
              {scope === 'global' && topPct ? (
                <Body style={[styles.posPct, { color: myGrade.color }]}>
                  {t.rankings.topPercent.replace('%p', String(topPct))}
                </Body>
              ) : null}
              {isCalibrating(mr.races) ? (
                <Muted>
                  {t.profile.calibrating} · {mr.elo}
                </Muted>
              ) : (
                <Muted style={{ color: myGrade.color }}>
                  {myGrade.name} · {mr.elo}
                </Muted>
              )}
            </View>
          </View>
        </Card>
      ) : null}

      <ScrollView contentContainerStyle={styles.list} showsVerticalScrollIndicator={false}>
        {showError ? (
          <View style={styles.center}>
            <Muted>{t.rankings.loadError}</Muted>
            <Button
              label={t.rankings.retry}
              onPress={() => {
                setFailed((prev) => ({ ...prev, [scope]: false }));
                load(scope);
              }}
            />
          </View>
        ) : !current ? (
          <Muted>…</Muted>
        ) : current.rows.length === 0 ? (
          <Muted>{scope === 'friends' ? t.rankings.emptyFriends : t.rankings.emptyGlobal}</Muted>
        ) : (
          <>
            {current.rows.map((row) => {
              const grade = gradeForElo(row.elo);
              // Nouveau pilote : niveau en calibration → pas de grade figé.
              const calibrating = isCalibrating(row.races);
              return (
                <Pressable key={rowKey(row)} onPress={() => openPilot(row)} accessibilityRole="button">
                  <Card style={row.isMe ? styles.meCard : undefined}>
                    <View style={styles.row}>
                      <Body style={styles.rank}>{row.rank}</Body>
                      <Avatar
                        name={row.username}
                        size={36}
                        uri={row.avatarPath ? (avatars.get(row.avatarPath) ?? null) : null}
                        cacheKey={row.avatarPath}
                      />
                      <View style={styles.flex}>
                        <Body>
                          {row.username}
                          {row.isMe ? ` ${t.rankings.me}` : ''}
                        </Body>
                        {calibrating ? (
                          <Muted>
                            {t.profile.calibrating} · {row.elo}
                          </Muted>
                        ) : (
                          <Muted style={{ color: grade.color }}>
                            {grade.name} · {row.elo}
                          </Muted>
                        )}
                      </View>
                      {!calibrating ? <GradeMedal grade={grade} size={28} /> : null}
                    </View>
                  </Card>
                </Pressable>
              );
            })}

            {current.mayHaveMore ? (
              <Button label={t.rankings.loadMore} onPress={onLoadMore} disabled={loadingMore} />
            ) : null}
            {moreFailed ? <Muted>{t.rankings.loadError}</Muted> : null}

            {!current.myRank ? <Muted style={styles.hint}>{t.rankings.notRankedYet}</Muted> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xxl * 2, paddingTop: spacing.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  rank: { fontFamily: fonts.serifBlack, fontSize: 18, color: colors.inkDim, minWidth: 30, textAlign: 'center' },
  flex: { flex: 1 },
  meCard: { borderColor: colors.accent },
  hint: { marginTop: spacing.xs },
  center: { gap: spacing.md, alignItems: 'flex-start' },
  posCard: { borderColor: colors.accent, marginBottom: spacing.xs },
  posRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  posLabel: { fontSize: 12 },
  posRank: { fontFamily: fonts.serifBlack, fontSize: 28, color: colors.ink },
  posTotal: { fontFamily: fonts.serif, fontSize: 16, color: colors.inkDim },
  posRight: { alignItems: 'flex-end', gap: 2 },
  posPct: { fontFamily: fonts.serifBlack, fontSize: 20 },
});
