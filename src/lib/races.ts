/**
 * Couche données des courses (lot 1.2) — requêtes Supabase typées.
 * La sécurité (seul l'admin écrit) est garantie par la RLS ; ici on décrit
 * seulement les opérations.
 */
import { coarse } from '@/lib/geo';
import { supabase } from '@/lib/supabase';

export const MAX_RACES_PER_DAY = 10;

export interface Circuit {
  id: string;
  name: string;
  city: string | null;
  is_official: boolean;
  /** Coordonnées du karting. `null` tant qu'il n'est pas géocodé (les deux ou aucune). */
  lat: number | null;
  lon: number | null;
  /** Distance depuis ma position, en km — renseignée par `nearbyCircuits` seulement. */
  km?: number;
  /** Nombre TOTAL de circuits correspondants — renseigné par `searchCircuits`. */
  total?: number;
  /**
   * Noms alternatifs (sigle, enseigne, ancien nom) séparés par « · ». Jamais
   * affichés : ils servent uniquement à ce qu'une recherche aboutisse. Les
   * pilotes disent « BRK », pas « Circuit Beltoise-Trappes ».
   */
  aliases?: string | null;
}

// 'locked' = grille figée (invitations clôturées), en attente de la saisie.
export type RaceStatus = 'upcoming' | 'locked' | 'completed';

/** Durée de la fenêtre de correction du classement après validation (lot 2.6). */
export const CORRECTION_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface Race {
  id: string;
  admin_id: string;
  circuit_id: string | null;
  scheduled_at: string;
  status: RaceStatus;
  completed_at: string | null;
  circuit: Circuit | null;
}

/** Vrai si le classement est encore corrigeable (< 24 h après validation). */
export function withinCorrectionWindow(race: Race): boolean {
  if (race.status !== 'completed' || !race.completed_at) return false;
  return Date.now() - new Date(race.completed_at).getTime() < CORRECTION_WINDOW_MS;
}

export interface Participant {
  id: string; // id de la participation
  profileId: string | null;
  ghostId: string | null;
  name: string;
  isSelf: boolean;
  elo: number;
  /** Nombre de courses jouées (0 pour un invité) — sert au libellé « En calibration ». */
  races: number;
  /** Compte inscrit dont le profil est illisible (privé non-ami, retiré…) : ne rien inventer. */
  hiddenProfile: boolean;
  /** Chemin de la photo (null = initiales). Le lien signé se demande par lots. */
  avatarPath: string | null;
}

// ── Circuits (référentiel maîtrisé : pas d'ajout client) ──────────────────
/** Recherche tolérante (accents/casse) sur le nom ET la ville. Vide → top 20. */
export async function searchCircuits(query: string): Promise<Circuit[]> {
  const { data, error } = await supabase.rpc('search_circuits', { q: query.trim() });
  if (error) throw new Error(error.message);
  return (data ?? []) as Circuit[];
}

/**
 * Les circuits les plus proches d'une position, du plus proche au plus loin.
 *
 * La position est ARRONDIE avant l'envoi : au centième de degré, soit environ
 * un kilomètre. Cela ne change pas l'ordre des kartings et évite de confier au
 * serveur une position au mètre près dont il n'a aucun usage.
 */
export async function nearbyCircuits(
  lat: number,
  lon: number,
  opts?: { limit?: number; maxKm?: number },
): Promise<Circuit[]> {
  const { lat: p_lat, lon: p_lon } = coarse({ lat, lon });
  const { data, error } = await supabase.rpc('nearby_circuits', {
    p_lat,
    p_lon,
    ...(opts?.limit === undefined ? {} : { p_limit: opts.limit }),
    ...(opts?.maxKm === undefined ? {} : { p_max_km: opts.maxKm }),
  });
  if (error) throw new Error(error.message);
  return (data ?? []) as Circuit[];
}

/**
 * Tout le référentiel géolocalisé, pour la carte.
 *
 * On réutilise `nearby_circuits` avec un rayon qui couvre la planète plutôt
 * que d'ajouter une fonction serveur : le tri par distance reste utile (la
 * liste sous la carte s'ouvre sur les plus proches) et il n'y a aucune règle
 * de visibilité à dupliquer.
 */
export async function allCircuitsOnMap(center: { lat: number; lon: number }): Promise<Circuit[]> {
  return nearbyCircuits(center.lat, center.lon, { limit: 5000, maxKm: 20_000 });
}

/** Signalement de circuit : manquant, fermé, ou fiche fausse. */
export type CircuitReportKind = 'manquant' | 'ferme' | 'erreur';

/**
 * Signale un karting au référentiel. Le serveur pose l'auteur, filtre les
 * mots, plafonne à 5/heure et refuse le doublon encore ouvert — les messages
 * d'erreur qui remontent sont écrits pour être montrés tels quels.
 *
 * `comment` est le champ libre : le MÊME filtre de mots s'y applique, et il
 * n'est jamais lisible que par son auteur et la modération.
 */
export async function suggestCircuit(
  kind: CircuitReportKind,
  name: string,
  city: string | null,
  circuitId: string | null,
  comment: string | null = null,
): Promise<void> {
  const { error } = await supabase.rpc('suggest_circuit', {
    p_kind: kind,
    p_name: name.trim(),
    p_city: city?.trim() || null,
    p_circuit_id: circuitId,
    // Le commentaire est relu, filtré et coupé à 200 par le serveur : ce
    // `trim` n'est là que pour n'envoyer jamais une chaîne d'espaces.
    p_comment: comment?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

/** Un circuit par son identifiant (arrivée depuis la carte, lien partagé). */
export async function getCircuit(id: string): Promise<Circuit | null> {
  const { data, error } = await supabase
    .from('circuits')
    .select('id, name, city, is_official, lat, lon, aliases')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data as Circuit | null) ?? null;
}

/** Les circuits où J'AI déjà couru, du plus récent au plus ancien. */
export async function listRecentCircuits(): Promise<Circuit[]> {
  const { data, error } = await supabase.rpc('my_recent_circuits');
  if (error) throw new Error(error.message);
  return (data ?? []) as Circuit[];
}

// ── Courses ────────────────────────────────────────────────────────────────
export async function countMyRacesToday(): Promise<number> {
  const { data: auth } = await supabase.auth.getUser();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const { count, error } = await supabase
    .from('races')
    .select('id', { count: 'exact', head: true })
    .eq('admin_id', auth.user?.id ?? '')
    .gte('created_at', start.toISOString());
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Crée une course et ajoute le créateur comme pilote (retirable ensuite). */
export async function createRace(circuitId: string, scheduledAt: Date): Promise<Race> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  const { data, error } = await supabase
    .from('races')
    .insert({ admin_id: userId, circuit_id: circuitId, scheduled_at: scheduledAt.toISOString() })
    .select(RACE_SELECT)
    .single();
  if (error) throw new Error(error.message);
  const race = data as unknown as Race;
  // Le créateur court par défaut.
  await supabase.from('participations').insert({ race_id: race.id, profile_id: userId });
  return race;
}

// `invite_token` a QUITTÉ cette liste, et la colonne n'est plus lisible côté
// serveur : c'est lui qui autorise à rejoindre une course, donc le laisser
// filer dans chaque chargement de course revenait à donner le droit d'inviter
// à tous les inscrits. Il se demande explicitement, et seul l'admin l'obtient
// (`raceInviteToken`).
const RACE_SELECT =
  'id, admin_id, circuit_id, scheduled_at, status, completed_at, circuit:circuits(*)';

/**
 * Le jeton d'invitation d'une course — réservé à son admin par le serveur.
 * Demandé au moment d'ouvrir le partage, pas au chargement de l'écran : un
 * non-admin n'a aucune raison de déclencher un refus à chaque visite.
 */
export async function raceInviteToken(raceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('race_invite_token', { p_race_id: raceId });
  if (error) throw new Error(error.message);
  return (data as string | null) ?? '';
}

export async function listMyRaces(): Promise<{ upcoming: Race[]; past: Race[] }> {
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth.user?.id ?? '';
  // Deux volets : les courses que J'ADMINISTRE et celles où JE SUIS INSCRIT.
  // L'accueil ne filtrait que sur admin_id — une course où un ami m'avait mis
  // sur la grille n'apparaissait NULLE PART (elle n'était joignable que par
  // la notification, puis par l'historique après coup). Les deux volets sont
  // nécessaires : un admin peut se retirer de sa propre grille et doit
  // continuer de voir sa course.
  const [admin, inscrit] = await Promise.all([
    supabase.from('races').select(RACE_SELECT).eq('admin_id', uid),
    supabase.from('participations').select(`race:races(${RACE_SELECT})`).eq('profile_id', uid),
  ]);
  if (admin.error) throw new Error(admin.error.message);
  if (inscrit.error) throw new Error(inscrit.error.message);
  const parId = new Map<string, Race>();
  for (const r of (admin.data ?? []) as unknown as Race[]) parId.set(r.id, r);
  for (const ligne of (inscrit.data ?? []) as unknown as { race: Race | null }[]) {
    if (ligne.race) parId.set(ligne.race.id, ligne.race);
  }
  const races = [...parId.values()];
  const quand = (r: Race) => new Date(r.scheduled_at).getTime();
  return {
    // « À venir » = tout ce qui n'est pas terminé, ce qui inclut les courses
    // dont la DATE est passée mais dont le classement n'a jamais été saisi.
    //
    // Tri CROISSANT sur ce qui vient : « à venir » se lit de demain vers plus
    // tard. Un tri décroissant — correct pour l'historique — mettait la course
    // du mois prochain avant celle de demain, c'est-à-dire enterrait la seule
    // qu'il faut préparer (décision PO 2026-08-01).
    //
    // Mais un croissant NU ferait remonter les oubliées en tête : trois
    // sorties dont on n'a pas saisi l'arrivée, et la course de samedi se
    // retrouve quatrième. Elles passent donc après, les plus récentes d'abord
    // — ce sont celles dont on se souvient encore assez pour les classer.
    upcoming: races
      .filter((r) => r.status !== 'completed')
      .sort((a, b) => {
        const retardA = quand(a) < Date.now() ? 1 : 0;
        const retardB = quand(b) < Date.now() ? 1 : 0;
        return retardA - retardB || (retardA ? quand(b) - quand(a) : quand(a) - quand(b));
      }),
    // Décroissant : la dernière course courue en tête, comme tout historique.
    past: races.filter((r) => r.status === 'completed').sort((a, b) => quand(b) - quand(a)),
  };
}

/**
 * La grille la mieux garnie parmi ces courses (0 si la liste est vide).
 *
 * Sert UNIQUEMENT à cocher « ajouter des pilotes » dans la checklist de prise
 * en main. C'est une requête de plus sur l'accueil, alors elle ne part que
 * pour qui n'a pas encore terminé une course — soit une poignée d'ouvertures
 * dans la vie d'un compte, puis plus jamais. Un compteur en base pour ça
 * coûterait plus cher (un déclencheur sur chaque participation) qu'il ne
 * rapporte.
 */
export async function maxGridSize(raceIds: string[]): Promise<number> {
  if (raceIds.length === 0) return 0;
  const { data, error } = await supabase
    .from('participations')
    .select('race_id')
    // Borne : `in(…)` part dans l'URL. Un compte à deux cents courses à venir
    // et zéro terminée produirait une adresse de plusieurs kilo-octets, que
    // certaines passerelles refusent en 414. On ne cherche qu'à savoir si UNE
    // grille est garnie — cinquante suffisent largement.
    .in('race_id', raceIds.slice(0, 50));
  if (error) throw new Error(error.message);
  const parCourse = new Map<string, number>();
  for (const r of (data ?? []) as { race_id: string }[]) {
    parCourse.set(r.race_id, (parCourse.get(r.race_id) ?? 0) + 1);
  }
  return Math.max(0, ...parCourse.values());
}

export async function getRace(id: string): Promise<Race | null> {
  const { data, error } = await supabase.from('races').select(RACE_SELECT).eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as Race) ?? null;
}

export async function updateRace(id: string, circuitId: string, scheduledAt: Date): Promise<void> {
  const { error } = await supabase
    .from('races')
    .update({ circuit_id: circuitId, scheduled_at: scheduledAt.toISOString() })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteRace(id: string): Promise<void> {
  const { error } = await supabase.from('races').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * « Prendre les mêmes et on recommence » : nouvelle course avec le même
 * circuit et les mêmes pilotes, en une transaction serveur atomique (fonction
 * rematch — gère la limite quotidienne, le blocage et l'autorisation).
 * Renvoie l'id de la nouvelle course.
 */
export async function rematch(sourceRaceId: string): Promise<string> {
  const { data, error } = await supabase.rpc('rematch', { p_source: sourceRaceId });
  if (error) throw new Error(error.message);
  return data as string;
}

// ── Participants ───────────────────────────────────────────────────────────
type RawParticipation = {
  id: string;
  profile_id: string | null;
  ghost_id: string | null;
  profile: { username: string; elo: number; races: number; avatar_path: string | null } | null;
  ghost: { display_name: string; elo: number } | null;
};

export async function listParticipants(raceId: string, selfId?: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('id, profile_id, ghost_id, profile:profiles(username, elo, races, avatar_path), ghost:ghost_profiles(display_name, elo)')
    .eq('race_id', raceId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawParticipation[]).map((p) => {
    // Inscrit dont la RLS masque le profil (privé non-ami, amitié retirée…) :
    // on l'affiche comme « Pilote privé », sans jamais inventer un Elo.
    const hiddenProfile = !!p.profile_id && !p.profile;
    return {
      id: p.id,
      profileId: p.profile_id,
      ghostId: p.ghost_id,
      name: p.profile?.username ?? p.ghost?.display_name ?? '—',
      isSelf: !!selfId && p.profile_id === selfId,
      elo: p.profile?.elo ?? p.ghost?.elo ?? 1000,
      races: p.profile?.races ?? 0,
      hiddenProfile,
      avatarPath: p.profile?.avatar_path ?? null,
    };
  });
}

/** Ajoute un invité (nom libre) : crée un profil fantôme puis la participation. */
export async function addGhostParticipant(raceId: string, name: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { data: ghost, error: gErr } = await supabase
    .from('ghost_profiles')
    .insert({ display_name: name.trim(), created_by: auth.user?.id })
    .select('id')
    .single();
  if (gErr) throw new Error(gErr.message);
  const { error } = await supabase
    .from('participations')
    .insert({ race_id: raceId, ghost_id: ghost.id });
  if (error) throw new Error(error.message);
}

/** Ajoute un ami (compte inscrit) comme pilote de la course. */
export async function addProfileParticipant(raceId: string, profileId: string): Promise<void> {
  const { error } = await supabase
    .from('participations')
    .insert({ race_id: raceId, profile_id: profileId });
  if (error) throw new Error(error.message);
}

/**
 * Rejoindre une course sur invitation de son admin.
 *
 * `token` vient du lien de partage (`?j=…`). Le serveur l'exige : sans lui, on
 * ne rejoint pas — c'est ce qui fait de « seul l'admin invite » une règle et
 * non un bouton masqué. Un pilote DÉJÀ inscrit repasse sans jeton (l'appel
 * reste idempotent), et l'admin n'en a pas besoin sur sa propre course.
 */
export async function joinRace(raceId: string, token?: string | null): Promise<void> {
  const { error } = await supabase.rpc('join_race', {
    p_race_id: raceId,
    p_token: token ?? null,
  });
  if (error) throw new Error(error.message);
}

/** (Ré)ajoute le créateur comme pilote de sa course. */
export async function addSelfParticipant(raceId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('participations')
    .insert({ race_id: raceId, profile_id: auth.user?.id });
  if (error) throw new Error(error.message);
}

export async function removeParticipant(participationId: string): Promise<void> {
  const { error } = await supabase.from('participations').delete().eq('id', participationId);
  if (error) throw new Error(error.message);
}

// ── Classement & résultats ───────────────────────────────────────────────
export interface RaceResult {
  participationId: string;
  position: number;
  name: string;
  isSelf: boolean;
  /** Invité sans compte : Elo gelé et hors classement → on n'affiche pas de score. */
  isGuest: boolean;
  /** Compte inscrit au profil illisible (privé non-ami…) : nom masqué. */
  hiddenProfile: boolean;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
  bestLapMs: number | null;
  avatarPath: string | null;
  /** Abandon (A6) : classé dernier côté Elo, « Abandon » à l'affichage. */
  dnf: boolean;
}

/**
 * Soumet l'ordre d'arrivée (ids de participation) → calcul Elo serveur.
 * `dnfParticipationIds` : les abandons, classés DERNIERS et ex æquo entre eux.
 */
export async function submitRaceResults(
  raceId: string,
  orderedParticipationIds: string[],
  dnfParticipationIds: string[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('submit_race_results', {
    p_race_id: raceId,
    p_order: orderedParticipationIds,
    p_dnf: dnfParticipationIds,
  });
  if (error) throw new Error(error.message);
}

/**
 * Corrige le classement d'une course terminée (fenêtre 24 h). Refusé côté
 * serveur si la fenêtre est passée ou si un pilote a couru une autre course
 * depuis (l'Elo serait faussé).
 */
export async function correctRaceResults(
  raceId: string,
  orderedParticipationIds: string[],
  dnfParticipationIds: string[] = [],
): Promise<void> {
  const { error } = await supabase.rpc('correct_race_results', {
    p_race_id: raceId,
    p_order: orderedParticipationIds,
    p_dnf: dnfParticipationIds,
  });
  if (error) throw new Error(error.message);
}

/** Clôture les invitations : fige la grille et envoie un rappel (une fois). */
export async function lockRace(raceId: string): Promise<void> {
  const { error } = await supabase.rpc('lock_race', { p_race_id: raceId });
  if (error) throw new Error(error.message);
}

/** Rouvre les invitations d'une course clôturée (le rappel n'est pas renvoyé). */
export async function reopenRace(raceId: string): Promise<void> {
  const { error } = await supabase.rpc('reopen_race', { p_race_id: raceId });
  if (error) throw new Error(error.message);
}

/**
 * Classement enregistré, pour pré-remplir la correction : l'ordre ET les
 * abandons. Sans les abandons, une correction d'ordre les effacerait tous en
 * silence — l'admin ne corrigerait qu'une place et repromouvrait des pilotes
 * qui n'ont jamais fini.
 */
export async function resultOrder(raceId: string): Promise<{ order: string[]; dnf: string[] }> {
  const { data, error } = await supabase
    .from('results')
    .select('participation_id, position, dnf')
    .eq('race_id', raceId)
    .order('position');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { participation_id: string; dnf: boolean | null }[];
  return {
    order: rows.map((r) => r.participation_id),
    dnf: rows.filter((r) => r.dnf === true).map((r) => r.participation_id),
  };
}

type RawResult = {
  participation_id: string;
  position: number;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  best_lap_ms: number | null;
  dnf: boolean | null;
  participation: {
    profile_id: string | null;
    profile: { username: string; avatar_path: string | null } | null;
    ghost: { display_name: string } | null;
  } | null;
};

export async function listResults(raceId: string, selfId?: string): Promise<RaceResult[]> {
  const { data, error } = await supabase
    .from('results')
    .select('participation_id, position, elo_before, elo_after, elo_delta, best_lap_ms, dnf, participation:participations(profile_id, profile:profiles(username, avatar_path), ghost:ghost_profiles(display_name))')
    .eq('race_id', raceId)
    .order('position');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawResult[]).map((r) => ({
    participationId: r.participation_id,
    position: r.position,
    name: r.participation?.profile?.username ?? r.participation?.ghost?.display_name ?? '—',
    isSelf: !!selfId && r.participation?.profile_id === selfId,
    isGuest: !r.participation?.profile_id,
    hiddenProfile: !!r.participation?.profile_id && !r.participation?.profile,
    eloBefore: r.elo_before,
    eloAfter: r.elo_after,
    eloDelta: r.elo_delta,
    bestLapMs: r.best_lap_ms,
    avatarPath: r.participation?.profile?.avatar_path ?? null,
    dnf: r.dnf === true,
  }));
}

/**
 * Saisie GROUPÉE des meilleurs tours (A9) : une course de huit pilotes se
 * renseigne en un enregistrement au lieu de huit allers-retours.
 * `ms` à null efface le temps.
 */
export async function setLapTimes(
  raceId: string,
  entries: { participationId: string; ms: number | null }[],
): Promise<void> {
  if (entries.length === 0) return;
  const { error } = await supabase.rpc('set_lap_times', {
    p_race_id: raceId,
    p_entries: entries.map((e) => ({ participation_id: e.participationId, ms: e.ms })),
  });
  if (error) throw new Error(error.message);
}

/** Renseigne / efface (p_ms null) le meilleur tour d'un pilote (soi-même ou admin). */
export async function setLapTime(participationId: string, ms: number | null): Promise<void> {
  const { error } = await supabase.rpc('set_lap_time', {
    p_participation_id: participationId,
    p_ms: ms,
  });
  if (error) throw new Error(error.message);
}

/** Record du circuit : meilleur tour jamais enregistré + son auteur. */
/** `holder` null = détenteur au profil privé : afficher « Pilote privé ». */
export async function getCircuitRecord(
  circuitId: string,
): Promise<{ ms: number; holder: string | null } | null> {
  const { data, error } = await supabase.rpc('get_circuit_record', { p_circuit_id: circuitId });
  if (error) throw new Error(error.message);
  const row = (data as { best_lap_ms: number; holder: string | null }[] | null)?.[0];
  return row ? { ms: row.best_lap_ms, holder: row.holder } : null;
}

/**
 * Abonnement temps réel aux changements d'une course (ex. l'admin valide le
 * classement → l'écran du participant bascule tout seul). Renvoie la fonction
 * de désabonnement. Nécessite le realtime activé sur la table `races`.
 */
export function onRaceUpdate(raceId: string, callback: () => void): () => void {
  const channel = supabase
    .channel(`race-${raceId}`)
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'races', filter: `id=eq.${raceId}` },
      callback,
    )
    .subscribe();
  return () => {
    supabase.removeChannel(channel);
  };
}
