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

export type RaceStatus = 'upcoming' | 'completed';

export interface Race {
  id: string;
  admin_id: string;
  circuit_id: string | null;
  scheduled_at: string;
  status: RaceStatus;
  invite_token: string;
  circuit: Circuit | null;
}

export interface Participant {
  id: string; // id de la participation
  profileId: string | null;
  ghostId: string | null;
  name: string;
  isSelf: boolean;
  elo: number;
}

// ── Circuits ───────────────────────────────────────────────────────────────
export async function searchCircuits(query: string): Promise<Circuit[]> {
  let q = supabase.from('circuits').select('id, name, city, is_official').limit(20);
  if (query.trim()) q = q.ilike('name', `%${query.trim()}%`);
  const { data, error } = await q.order('is_official', { ascending: false }).order('name');
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function createCircuit(name: string, city?: string): Promise<Circuit> {
  const { data: auth } = await supabase.auth.getUser();
  const { data, error } = await supabase
    .from('circuits')
    .insert({ name: name.trim(), city: city?.trim() || null, created_by: auth.user?.id })
    .select('id, name, city, is_official')
    .single();
  if (error) throw new Error(error.message);
  return data;
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
    .select('id, admin_id, circuit_id, scheduled_at, status, invite_token, circuit:circuits(*)')
    .single();
  if (error) throw new Error(error.message);
  const race = data as unknown as Race;
  // Le créateur court par défaut.
  await supabase.from('participations').insert({ race_id: race.id, profile_id: userId });
  return race;
}

const RACE_SELECT =
  'id, admin_id, circuit_id, scheduled_at, status, invite_token, circuit:circuits(*)';

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
    upcoming: races.filter((r) => r.status === 'upcoming'),
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

// ── Participants ───────────────────────────────────────────────────────────
type RawParticipation = {
  id: string;
  profile_id: string | null;
  ghost_id: string | null;
  profile: { username: string; elo: number } | null;
  ghost: { display_name: string; elo: number } | null;
};

export async function listParticipants(raceId: string, selfId?: string): Promise<Participant[]> {
  const { data, error } = await supabase
    .from('participations')
    .select('id, profile_id, ghost_id, profile:profiles(username, elo), ghost:ghost_profiles(display_name, elo)')
    .eq('race_id', raceId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawParticipation[]).map((p) => ({
    id: p.id,
    profileId: p.profile_id,
    ghostId: p.ghost_id,
    name: p.profile?.username ?? p.ghost?.display_name ?? '—',
    isSelf: !!selfId && p.profile_id === selfId,
    elo: p.profile?.elo ?? p.ghost?.elo ?? 1000,
  }));
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
  position: number;
  name: string;
  isSelf: boolean;
  eloBefore: number;
  eloAfter: number;
  eloDelta: number;
}

/** Soumet l'ordre d'arrivée (ids de participation) → calcul Elo serveur. */
export async function submitRaceResults(raceId: string, orderedParticipationIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('submit_race_results', {
    p_race_id: raceId,
    p_order: orderedParticipationIds,
  });
  if (error) throw new Error(error.message);
}

type RawResult = {
  position: number;
  elo_before: number;
  elo_after: number;
  elo_delta: number;
  participation: {
    profile_id: string | null;
    profile: { username: string } | null;
    ghost: { display_name: string } | null;
  } | null;
};

export async function listResults(raceId: string, selfId?: string): Promise<RaceResult[]> {
  const { data, error } = await supabase
    .from('results')
    .select('position, elo_before, elo_after, elo_delta, participation:participations(profile_id, profile:profiles(username), ghost:ghost_profiles(display_name))')
    .eq('race_id', raceId)
    .order('position');
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawResult[]).map((r) => ({
    position: r.position,
    name: r.participation?.profile?.username ?? r.participation?.ghost?.display_name ?? '—',
    isSelf: !!selfId && r.participation?.profile_id === selfId,
    eloBefore: r.elo_before,
    eloAfter: r.elo_after,
    eloDelta: r.elo_delta,
  }));
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
