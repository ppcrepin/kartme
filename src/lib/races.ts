/**
 * Couche données des courses (lot 1.2) — requêtes Supabase typées.
 * La sécurité (seul l'admin écrit) est garantie par la RLS ; ici on décrit
 * seulement les opérations.
 */
import { supabase } from '@/lib/supabase';

export const MAX_RACES_PER_DAY = 10;

export interface Circuit {
  id: string;
  name: string;
  city: string | null;
  is_official: boolean;
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
  invite_token: string;
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
}

// ── Circuits (référentiel maîtrisé : pas d'ajout client) ──────────────────
/** Recherche tolérante (accents/casse) sur le nom ET la ville. Vide → top 20. */
export async function searchCircuits(query: string): Promise<Circuit[]> {
  const { data, error } = await supabase.rpc('search_circuits', { q: query.trim() });
  if (error) throw new Error(error.message);
  return (data ?? []) as Circuit[];
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

const RACE_SELECT =
  'id, admin_id, circuit_id, scheduled_at, status, invite_token, completed_at, circuit:circuits(*)';

export async function listMyRaces(): Promise<{ upcoming: Race[]; past: Race[] }> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('races')
    .select(RACE_SELECT)
    .eq('admin_id', auth.user?.id ?? '')
    .order('scheduled_at', { ascending: false });
  if (error) throw new Error(error.message);
  const races = (data ?? []) as unknown as Race[];
  return {
    // Les courses clôturées (« prêtes ») restent dans « à venir ».
    upcoming: races.filter((r) => r.status !== 'completed'),
    past: races.filter((r) => r.status === 'completed'),
  };
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
  profile: { username: string; elo: number; races: number } | null;
  ghost: { display_name: string; elo: number } | null;
};

export async function listParticipants(raceId: string, selfId?: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('id, profile_id, ghost_id, profile:profiles(username, elo, races), ghost:ghost_profiles(display_name, elo)')
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

/** Un invité rejoint lui-même une course ouverte (RPC : la RLS réserve l'ajout à l'admin). */
export async function joinRace(raceId: string): Promise<void> {
  const { error } = await supabase.rpc('join_race', { p_race_id: raceId });
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
}

/** Soumet l'ordre d'arrivée (ids de participation) → calcul Elo serveur. */
export async function submitRaceResults(raceId: string, orderedParticipationIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('submit_race_results', {
    p_race_id: raceId,
    p_order: orderedParticipationIds,
  });
  if (error) throw new Error(error.message);
}

/**
 * Corrige le classement d'une course terminée (fenêtre 24 h). Refusé côté
 * serveur si la fenêtre est passée ou si un pilote a couru une autre course
 * depuis (l'Elo serait faussé).
 */
export async function correctRaceResults(raceId: string, orderedParticipationIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('correct_race_results', {
    p_race_id: raceId,
    p_order: orderedParticipationIds,
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

/** Ids de participation dans l'ordre du classement enregistré (pour pré-remplir la correction). */
export async function resultOrder(raceId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('results')
    .select('participation_id, position')
    .eq('race_id', raceId)
    .order('position');
  if (error) throw new Error(error.message);
  return ((data ?? []) as { participation_id: string }[]).map((r) => r.participation_id);
}

type RawResult = {
  participation_id: string;
  position: number;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  best_lap_ms: number | null;
  participation: {
    profile_id: string | null;
    profile: { username: string } | null;
    ghost: { display_name: string } | null;
  } | null;
};

export async function listResults(raceId: string, selfId?: string): Promise<RaceResult[]> {
  const { data, error } = await supabase
    .from('results')
    .select('participation_id, position, elo_before, elo_after, elo_delta, best_lap_ms, participation:participations(profile_id, profile:profiles(username), ghost:ghost_profiles(display_name))')
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
  }));
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
export async function getCircuitRecord(circuitId: string): Promise<{ ms: number; holder: string } | null> {
  const { data, error } = await supabase.rpc('get_circuit_record', { p_circuit_id: circuitId });
  if (error) throw new Error(error.message);
  const row = (data as { best_lap_ms: number; holder: string }[] | null)?.[0];
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
