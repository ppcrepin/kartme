/**
 * Couche données du profil (lot 1.5) : identité, stats, courbe d'Elo,
 * historique des courses. Tout vient des tables déjà en place.
 */
import { supabase } from '@/lib/supabase';

export interface MyProfile {
  id: string;
  username: string;
  elo: number;
}

export interface ProfileStats {
  races: number;
  wins: number;
  podiums: number;
}

export interface EloPoint {
  elo: number;
  at: string; // ISO
}

export interface HistoryEntry {
  raceId: string | null;
  circuitName: string | null;
  scheduledAt: string | null;
  position: number;
  eloDelta: number;
  eloAfter: number;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, elo')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data;
}

/** Courbe d'évolution : Elo de départ (1000) + valeur après chaque course. */
export async function getEloCurve(): Promise<EloPoint[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('elo_history')
    .select('elo, created_at')
    .eq('profile_id', userId)
    .order('created_at');
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => ({ elo: r.elo, at: r.created_at }));
}

type RawHistory = {
  position: number;
  elo_delta: number;
  elo_after: number;
  race: { id: string; scheduled_at: string; circuit: { name: string } | null } | null;
  participation: { profile_id: string | null } | null;
};

/** Mes courses passées (position, ±Elo), les plus récentes d'abord. */
export async function getRaceHistory(): Promise<HistoryEntry[]> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from('results')
    .select(
      'position, elo_delta, elo_after, race:races(id, scheduled_at, circuit:circuits(name)), participation:participations!inner(profile_id)',
    )
    .eq('participation.profile_id', userId)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawHistory[]).map((r) => ({
    raceId: r.race?.id ?? null,
    circuitName: r.race?.circuit?.name ?? null,
    scheduledAt: r.race?.scheduled_at ?? null,
    position: r.position,
    eloDelta: r.elo_delta,
    eloAfter: r.elo_after,
  }));
}

/** Agrégats : nombre de courses, victoires, podiums. */
export function statsFromHistory(history: HistoryEntry[]): ProfileStats {
  return {
    races: history.length,
    wins: history.filter((h) => h.position === 1).length,
    podiums: history.filter((h) => h.position <= 3).length,
  };
}
