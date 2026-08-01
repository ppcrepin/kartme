import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar, Button, Card, GradeMedal, ListRow, Tag } from '@/components/ui';
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
  /** Fenêtre « autour de moi » (A17, décision PO) — absente si je suis déjà
   *  dans le haut du tableau (la liste classique me montre alors d'office). */
  aroundRows?: LeaderboardRow[];
};

/** Au-delà de ce rang, la vue par défaut est « autour de moi » : la question
 *  n'est pas « qui est premier en France » mais « est-ce que je passe devant
 *  Kévin ce week-end ». */
const AROUND_THRESHOLD = 8;
/** 3 pilotes devant moi, moi, jusqu'à 4 derrière. */
const AROUND_WINDOW = 8;

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
  // « Autour de moi » (défaut) ou liste classique depuis le sommet. Une seule
  // barre de segments à l'écran (Amis/Global) : la bascule de vue passe par
  // des liens dans la liste et par la carte « Ma position ».
  const [viewMode, setViewMode] = useState<'me' | 'top'>('me');
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
      .then(async ([rows, myRank]) => {
        // Fenêtre « autour de moi » : un simple décalage calculé du rang —
        // aucun RPC nouveau côté serveur (audit A17).
        let aroundRows: LeaderboardRow[] | undefined;
        if (myRank && myRank.rank > AROUND_THRESHOLD) {
          aroundRows = await getLeaderboard(
            sc,
            AROUND_WINDOW,
            Math.max(0, myRank.rank - 4),
          ).catch(() => undefined);
          // L'Elo peut bouger entre getMyRank et cette fenêtre : si ma ligne
          // n'y est plus, mieux vaut la liste classique qu'une fenêtre qui
          // prétend m'entourer sans moi.
          if (aroundRows && !aroundRows.some((r) => r.isMe)) aroundRows = undefined;
        }
        setLoaded((prev) => ({
          ...prev,
          [sc]: { rows, myRank, mayHaveMore: rows.length === LEADERBOARD_PAGE, aroundRows },
        }));
        setFailed((prev) => ({ ...prev, [sc]: false }));
        void mergeAvatars([...rows, ...(aroundRows ?? [])]);
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
    setViewMode('me');
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

      {/* Ma position — carte de statut relatif épinglée ; un tap ramène la
          liste autour de moi. */}
      {mr && myGrade ? (
        <Pressable onPress={() => setViewMode('me')} accessibilityRole="button">
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
                <Body style={[styles.posPct, { color: myGrade.colorTexte }]}>
                  {t.rankings.topPercent.replace('%p', String(topPct))}
                </Body>
              ) : null}
              {isCalibrating(mr.races) ? (
                <Muted>
                  {t.profile.calibrating} · {mr.elo}
                </Muted>
              ) : (
                <Muted style={{ color: myGrade.colorTexte }}>
                  {myGrade.name} · {mr.elo}
                </Muted>
              )}
            </View>
          </View>
        </Card>
        </Pressable>
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
        ) : viewMode === 'me' && (current.aroundRows?.length ?? 0) > 0 ? (
          /* ── « Autour de toi » (défaut, décision PO) : 3 devant, moi, ceux
             qui suivent — la question « qui je peux doubler » est répondue
             sans défiler. Top et liste complète restent à un tap. ── */
          <>
            <Card>
              {(current.aroundRows ?? []).map((row, i) => (
                <RangRow
                  key={rowKey(row)}
                  row={row}
                  first={i === 0}
                  avatars={avatars}
                  onPress={() => openPilot(row)}
                />
              ))}
            </Card>
            <Button
              label={t.rankings.seeTop}
              variant="ghost"
              onPress={() => setViewMode('top')}
            />
          </>
        ) : (
          <>
            <Card>
              {current.rows.map((row, i) => (
                <RangRow
                  key={rowKey(row)}
                  row={row}
                  first={i === 0}
                  avatars={avatars}
                  onPress={() => openPilot(row)}
                />
              ))}
            </Card>

            {current.mayHaveMore ? (
              <Button label={t.rankings.loadMore} onPress={onLoadMore} disabled={loadingMore} />
            ) : null}
            {moreFailed ? <Muted>{t.rankings.loadError}</Muted> : null}

            {(current.aroundRows?.length ?? 0) > 0 ? (
              <Button
                label={t.rankings.backToMe}
                variant="ghost"
                onPress={() => setViewMode('me')}
              />
            ) : null}
            {!current.myRank ? <Muted style={styles.hint}>{t.rankings.notRankedYet}</Muted> : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}

/** Ligne de classement dense (44 px) — ma ligne est surlignée. */
function RangRow({
  row,
  first,
  avatars,
  onPress,
}: {
  row: LeaderboardRow;
  first: boolean;
  avatars: Map<string, string>;
  onPress: () => void;
}) {
  const grade = gradeForElo(row.elo);
  const calibrating = isCalibrating(row.races);
  const ligne = (
    <ListRow
      first={first}
      onPress={onPress}
      left={
        <>
          <Body style={styles.rank}>{row.rank}</Body>
          <Avatar
            name={row.username}
            size={28}
            uri={row.avatarPath ? (avatars.get(row.avatarPath) ?? null) : null}
            cacheKey={row.avatarPath}
          />
        </>
      }
      title={
        <Body style={styles.rowName} numberOfLines={1}>
          {row.username}
          {row.isMe ? ` ${t.rankings.me}` : ''}
        </Body>
      }
      sub={
        calibrating ? (
          <Muted style={styles.rowSub}>
            {t.profile.calibrating} · {row.elo}
          </Muted>
        ) : (
          <Muted style={[styles.rowSub, { color: grade.colorTexte }]}>
            {grade.name} · {row.elo}
          </Muted>
        )
      }
      right={
        // Un chevron, même discret. La ligne EST tapable — elle ouvre la fiche
        // du pilote — mais RIEN ne le disait : un testeur en a conclu que le
        // classement n'était pas cliquable (retour 2026-08-01). La médaille
        // occupait seule la colonne de droite, et une médaille n'a jamais
        // signifié « ouvre-moi ».
        <View style={styles.rowRight}>
          {!calibrating ? <GradeMedal grade={grade} size={24} /> : null}
          <Muted style={styles.chevron}>›</Muted>
        </View>
      }
    />
  );
  // Ma ligne : fond surligné, coins doux — le regard la trouve sans lire.
  return row.isMe ? <View style={styles.meRow}>{ligne}</View> : ligne;
}

const styles = StyleSheet.create({
  filters: { flexDirection: 'row', gap: spacing.sm },
  list: { gap: spacing.sm, paddingBottom: spacing.xxl * 2, paddingTop: spacing.xs },
  rank: { fontFamily: fonts.serifBlack, fontSize: 16, color: colors.inkDim, minWidth: 26, textAlign: 'center' },
  rowRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  chevron: { fontSize: 18, lineHeight: 20 },
  rowName: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  rowSub: { fontSize: 11, lineHeight: 14 },
  meRow: {
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: spacing.xs,
    marginHorizontal: -spacing.xs,
  },
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
