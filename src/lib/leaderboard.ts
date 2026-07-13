/**
 * Couche données des classements (lot 2.2, écran L1). Les règles de
 * visibilité (amis sans fantômes, privés non-amis exclus du Global, bloqués
 * masqués, classé = a couru au moins une fois) vivent côté serveur
 * (RPC get_leaderboard / get_my_rank) — ici on ne fait que transporter.
 */
import { supabase } from '@/lib/supabase';

export type LeaderboardScope = 'friends' | 'global';

export interface LeaderboardRow {
  rank: number;
  /** Id du profil inscrit, ou null pour un fantôme. */
  pilotId: string | null;
  /** Id du profil fantôme, ou null pour un inscrit. */
  ghostId: string | null;
  username: string;
  elo: number;
  races: number;
  isMe: boolean;
}

export interface MyRank {
  rank: number;
  elo: number;
  races: number;
}

/** Nombre de lignes chargées par page sur l'écran L1. */
export const LEADERBOARD_PAGE = 50;

type RawRow = {
  rank: number;
  profile_id: string | null;
  ghost_id: string | null;
  username: string;
  elo: number;
  races: number;
  is_me: boolean;
};

export async function getLeaderboard(
  scope: LeaderboardScope,
  limit: number = LEADERBOARD_PAGE,
  offset: number = 0,
): Promise<LeaderboardRow[]> {
  const { data, error } = await supabase.rpc('get_leaderboard', {
    p_scope: scope,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawRow[]).map((r) => ({
    rank: r.rank,
    pilotId: r.profile_id,
    ghostId: r.ghost_id,
    username: r.username,
    elo: r.elo,
    races: r.races,
    isMe: r.is_me,
  }));
}

/** Ma ligne (rang/Elo/courses) même hors de la page chargée ; null si jamais couru. */
export async function getMyRank(scope: LeaderboardScope): Promise<MyRank | null> {
  const { data, error } = await supabase.rpc('get_my_rank', { p_scope: scope });
  if (error) throw new Error(error.message);
  const row = (data as { rank: number; elo: number; races: number }[] | null)?.[0];
  return row ? { rank: row.rank, elo: row.elo, races: row.races } : null;
}
