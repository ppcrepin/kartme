import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Screen } from '@/components/screen';
import { Avatar, Button, Card, Field, GradeMedal, ListRow, Tag } from '@/components/ui';
import { Body, Label, Muted } from '@/components/ui/text';
import { colors, fonts, spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { SIGNED_TTL_S, signedAvatarUrls } from '@/lib/avatar';
import {
  acceptFriendRequest,
  deleteFriendship,
  listFriendships,
  searchPilots,
  type FriendEntry,
  type FriendLists,
  type Pilot,
} from '@/lib/friends';
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
  // ── Ce qui vient de l'onglet Amis, supprimé le 2026-08-01 ──────────────
  // La liste d'amis ÉTAIT déjà ce classement en portée « Amis » : les deux
  // écrans montraient les mêmes pilotes. Ne restaient que deux choses à
  // reloger : chercher un pilote, et répondre aux demandes reçues.
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Pilot[]>([]);
  const [searched, setSearched] = useState(false);
  const [liens, setLiens] = useState<FriendLists>({ received: [], sent: [], friends: [] });
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

  /** Demandes d'amitié en attente (reçues et envoyées). */
  const chargerLiens = useCallback(() => {
    let vivant = true;
    listFriendships()
      .then(async (l) => {
        if (!vivant) return;
        setLiens(l);
    void mergeAvatars([...l.received, ...l.sent, ...l.friends]);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, [mergeAvatars]);

  useFocusEffect(
    useCallback(() => {
      load(scope);
      return chargerLiens();
    }, [load, scope, chargerLiens]),
  );

  // Recherche de pilote, avec un léger anti-rebond. Elle vivait sur l'onglet
  // Amis : c'est le SEUL chemin vers un pilote qu'on n'a pas encore en amis,
  // et le supprimer avec l'onglet aurait fermé la porte d'entrée du réseau.
  useEffect(() => {
    let actif = true;
    const id = setTimeout(async () => {
      if (!actif) return;
      if (query.trim().length < 2) {
        setResults([]);
        setSearched(false);
        return;
      }
      try {
        const lignes = await searchPilots(query);
        if (!actif) return;
        setResults(lignes);
        setSearched(true);
        void mergeAvatars(lignes);
      } catch {
        /* silencieux : la liste reste vide, l'écran le dit */
      }
    }, 300);
    return () => {
      actif = false;
      clearTimeout(id);
    };
  }, [query, mergeAvatars]);

  async function repondre(f: FriendEntry, accepter: boolean) {
    try {
      await (accepter ? acceptFriendRequest(f.friendshipId) : deleteFriendship(f.friendshipId));
    } catch {
      /* réseau : la liste sera resynchronisée au prochain retour */
    }
    chargerLiens();
    // Accepter change la portée « Amis » : on la recharge, sinon le pilote
    // qu'on vient d'accepter manque au classement jusqu'à la visite suivante.
    load(scope);
  }

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
    if (row.pilotId) router.push(`/pilot/${row.pilotId}`);
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

  const cherche = query.trim().length >= 2;

  /**
   * Les amis ABSENTS du classement — ceux qui n'ont pas encore couru.
   *
   * `get_leaderboard` filtre sur `races > 0` : un ami fraîchement inscrit n'y
   * figure PAS. L'onglet Amis, lui, listait tout le monde. Sans ce rattrapage,
   * la fusion aurait rendu invisible exactement la personne qu'on vient
   * d'inviter — c'est-à-dire la sortie du canal d'acquisition n°1, et la seule
   * preuve visible que le lien a fonctionné.
   *
   * Affiché seulement quand TOUTES les pages sont chargées : sinon un ami de la
   * page suivante passerait à tort pour « pas encore classé ».
   */
  const amisSansCourse =
    scope === 'friends' && current && !current.mayHaveMore
      ? liens.friends.filter((f) => !current.rows.some((r) => r.pilotId === f.pilotId))
      : [];

  return (
    <Screen title={t.tabs.rankings}>
      <Field
        label={t.friends.search}
        value={query}
        onChangeText={setQuery}
        autoCapitalize="none"
      />

      {cherche ? (
        <ScrollView contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
          {results.length === 0 && searched ? <Muted>{t.friends.searchEmpty}</Muted> : null}
          <Card>
            {results.map((p, i) => {
              const grade = gradeForElo(p.elo);
              return (
                <ListRow
                  key={p.id}
                  first={i === 0}
                  onPress={() => router.push(`/pilot/${p.id}`)}
                  left={
                    <Avatar
                      name={p.username}
                      size={28}
                      uri={p.avatarPath ? (avatars.get(p.avatarPath) ?? null) : null}
                      cacheKey={p.avatarPath}
                    />
                  }
                  title={
                    <Body style={styles.rowName} numberOfLines={1}>
                      {p.username}
                    </Body>
                  }
                  sub={
                    <Muted style={[styles.rowSub, { color: grade.colorTexte }]}>
                      {grade.name}
                      {p.eloExact ? ` · ${p.elo}` : ''}
                    </Muted>
                  }
                  right={
                    <View style={styles.rowRight} aria-hidden>
                      <GradeMedal grade={grade} size={24} />
                      <Muted style={styles.chevron}>›</Muted>
                    </View>
                  }
                />
              );
            })}
          </Card>
        </ScrollView>
      ) : (
        <>
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
        {/* ── Demandes d'amitié ────────────────────────────────────────────
            Elles vivaient sur l'onglet Amis. Une notification en prévient, et
            la fiche du pilote porte le bouton « Accepter » — mais une
            notification se rate, et un lien qu'on ne retrouve nulle part est un
            lien perdu. Elles se posent donc EN TÊTE du classement, là où vivent
            désormais les autres pilotes, et seulement quand il y en a. ── */}
        {liens.received.length > 0 ? (
          <View style={styles.demandes}>
            <Label>
              {t.friends.received} · {liens.received.length}
            </Label>
            <Card>
              {liens.received.map((f, i) => (
                <ListRow
                  key={f.friendshipId}
                  first={i === 0}
                  onPress={() => router.push(`/pilot/${f.pilotId}`)}
                  // Nom EXPLICITE : sans lui, celui de la ligne se compose de
                  // son contenu — donc des libellés des deux boutons qu'elle
                  // porte. Un lecteur d'écran annonçait « Kévin_R Kévin_R
                  // Accepter · Kév… », et « Accepter » désignait deux
                  // commandes différentes dans la même vue.
                  accessibilityLabel={`${f.username} — ${t.friends.received}`}
                  left={
                    <Avatar
                      name={f.username}
                      size={28}
                      uri={f.avatarPath ? (avatars.get(f.avatarPath) ?? null) : null}
                      cacheKey={f.avatarPath}
                    />
                  }
                  title={
                    <Body style={styles.rowName} numberOfLines={1}>
                      {f.username}
                    </Body>
                  }
                  right={
                    <View style={styles.actions}>
                      {/* Deux boutons DANS une ligne tapable : chacun porte son
                          propre nom accessible, sinon un lecteur d'écran
                          annonce trois fois « bouton » sans les distinguer. */}
                      <Pressable
                        onPress={() => repondre(f, true)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t.friends.accept} · ${f.username}`}
                        style={styles.action}>
                        <Body style={styles.accepter}>{t.friends.accept}</Body>
                      </Pressable>
                      <Pressable
                        onPress={() => repondre(f, false)}
                        accessibilityRole="button"
                        accessibilityLabel={`${t.friends.decline} · ${f.username}`}
                        style={styles.action}>
                        <Muted>{t.friends.decline}</Muted>
                      </Pressable>
                    </View>
                  }
                />
              ))}
            </Card>
          </View>
        ) : null}

        {/* Envoyées : sans elles, on ne peut plus annuler une demande partie
            par erreur — le seul écran qui le permettait a disparu. */}
        {liens.sent.length > 0 ? (
          <View style={styles.demandes}>
            <Label>
              {t.friends.sent} · {liens.sent.length}
            </Label>
            <Card>
              {liens.sent.map((f, i) => (
                <ListRow
                  key={f.friendshipId}
                  first={i === 0}
                  onPress={() => router.push(`/pilot/${f.pilotId}`)}
                  accessibilityLabel={`${f.username} — ${t.friends.sent}`}
                  left={
                    <Avatar
                      name={f.username}
                      size={28}
                      uri={f.avatarPath ? (avatars.get(f.avatarPath) ?? null) : null}
                      cacheKey={f.avatarPath}
                    />
                  }
                  title={
                    <Body style={styles.rowName} numberOfLines={1}>
                      {f.username}
                    </Body>
                  }
                  right={
                    <Pressable
                      onPress={() => repondre(f, false)}
                      accessibilityRole="button"
                      accessibilityLabel={`${t.friends.cancel} · ${f.username}`}
                      style={styles.action}>
                      <Muted>{t.friends.cancel}</Muted>
                    </Pressable>
                  }
                />
              ))}
            </Card>
          </View>
        ) : null}

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

        {amisSansCourse.length > 0 ? (
          <View style={styles.demandes}>
            <Label>
              {t.rankings.friendsUnranked} · {amisSansCourse.length}
            </Label>
            <Card>
              {amisSansCourse.map((f, i) => (
                <ListRow
                  key={f.friendshipId}
                  first={i === 0}
                  onPress={() => router.push(`/pilot/${f.pilotId}`)}
                  left={
                    <Avatar
                      name={f.username}
                      size={28}
                      uri={f.avatarPath ? (avatars.get(f.avatarPath) ?? null) : null}
                      cacheKey={f.avatarPath}
                    />
                  }
                  title={
                    <Body style={styles.rowName} numberOfLines={1}>
                      {f.username}
                    </Body>
                  }
                  sub={<Muted style={styles.rowSub}>{t.rankings.noRaceYet}</Muted>}
                  right={
                    <View style={styles.rowRight} aria-hidden>
                      <Muted style={styles.chevron}>›</Muted>
                    </View>
                  }
                />
              ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
        </>
      )}
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
      // MA ligne ne navigue PAS, et ne se présente pas comme si elle le
      // faisait : `undefined` fait rendre une simple `View` à `ListRow`, là
      // où un gestionnaire vide laissait un `role="button"` tabulable, avec
      // retour visuel au tap et rien au bout. Elle envoyait sur l'onglet
      // Profil — une RACINE d'onglet, donc zéro bouton retour, mesuré au
      // navigateur : on tapait une ligne de liste et on n'avait plus de marche
      // arrière. Ce qu'elle promettait est déjà dans « Ma position » au-dessus.
      onPress={row.isMe ? undefined : onPress}
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
        //
        // Il n'apparaît QUE si la ligne mène quelque part : ni sur la mienne
        // (elle ne navigue plus), ni sur une ligne sans identifiant. Promettre
        // une navigation qui n'arrive pas est pire que ne rien promettre — et
        // les deux autres listes du dépôt conditionnent déjà leur chevron.
        //
        // `aria-hidden` : sans lui, le glyphe entre dans le nom accessible de
        // la ligne, déjà composé du rang, des initiales, du pseudo, du grade
        // et de l'Elo. Un lecteur d'écran finissait sur « guillemet fermant ».
        <View style={styles.rowRight} aria-hidden>
          {!calibrating ? <GradeMedal grade={grade} size={24} /> : null}
          {!row.isMe && row.pilotId ? (
            <Muted style={styles.chevron}>›</Muted>
          ) : (
            // Un espaceur de la largeur du chevron : sans lui, le bord droit
            // se décalait de 10 px sur MA ligne — précisément celle que l'œil
            // doit trouver sans lire (audit navigateur).
            <View style={styles.chevronVide} />
          )}
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
  chevronVide: { width: 6 },
  rowName: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  rowSub: { fontSize: 11, lineHeight: 14 },
  meRow: {
    backgroundColor: colors.surface2,
    borderRadius: 8,
    paddingHorizontal: spacing.xs,
    marginHorizontal: -spacing.xs,
  },
  hint: { marginTop: spacing.xs },
  demandes: { gap: spacing.xs, marginBottom: spacing.sm },
  actions: { flexDirection: 'row', alignItems: 'center' },
  // 44 px de haut : `hitSlop` est inerte sur `Pressable` en react-native-web.
  action: { minHeight: 44, justifyContent: 'center', paddingHorizontal: spacing.sm },
  accepter: { color: colors.pos, fontWeight: '800' },
  center: { gap: spacing.md, alignItems: 'flex-start' },
  posCard: { borderColor: colors.accent, marginBottom: spacing.xs },
  posRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  posLabel: { fontSize: 12 },
  posRank: { fontFamily: fonts.serifBlack, fontSize: 28, color: colors.ink },
  posTotal: { fontFamily: fonts.serif, fontSize: 16, color: colors.inkDim },
  posRight: { alignItems: 'flex-end', gap: 2 },
  posPct: { fontFamily: fonts.serifBlack, fontSize: 20 },
});
