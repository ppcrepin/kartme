/**
 * Couche données du social (lot 2.1) : recherche de pilotes, demandes d'amis,
 * blocage, signalement, face-à-face. La confidentialité des profils privés
 * est appliquée côté serveur (RPC search_pilots/get_pilot, RLS).
 */
import { supabase } from '@/lib/supabase';

export interface Pilot {
  id: string;
  username: string;
  /** Exact pour un profil public/ami ; sinon bandé au plancher de son grade. */
  elo: number;
  eloExact: boolean;
  isPrivate: boolean;
  /** Courses déjà jouées — sert à afficher « En calibration » sous 5 courses. */
  races: number;
}

export type FriendshipStatus = 'none' | 'pending_sent' | 'pending_received' | 'accepted';

export interface FriendshipState {
  status: FriendshipStatus;
  friendshipId: string | null;
}

export interface FriendEntry {
  friendshipId: string;
  pilotId: string;
  username: string;
  elo: number;
}

export interface FriendLists {
  received: FriendEntry[];
  sent: FriendEntry[];
  friends: FriendEntry[];
}

export type ReportCategory = 'comportement' | 'fausse_course' | 'classement' | 'usurpation' | 'autre';

export interface FaceToFace {
  races: number;
  myWins: number;
  theirWins: number;
  /** Courses où aucun des deux n'a fini : match nul, pas une victoire. */
  draws: number;
}

type RawPilot = {
  id: string;
  username: string;
  elo: number;
  elo_exact: boolean;
  is_private: boolean;
  races: number | null;
};

const toPilot = (r: RawPilot): Pilot => ({
  id: r.id,
  username: r.username,
  elo: r.elo,
  eloExact: r.elo_exact,
  isPrivate: r.is_private,
  // Tolérant : si le serveur n'a pas encore la migration, on suppose un pilote
  // installé plutôt que d'afficher « En calibration » à tout le monde.
  races: r.races ?? 99,
});

export async function searchPilots(query: string): Promise<Pilot[]> {
  if (query.trim().length < 2) return [];
  const { data, error } = await supabase.rpc('search_pilots', { q: query.trim() });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawPilot[]).map(toPilot);
}

export async function getPilot(id: string): Promise<Pilot | null> {
  const { data, error } = await supabase.rpc('get_pilot', { p_id: id });
  if (error) throw new Error(error.message);
  const row = (data as RawPilot[] | null)?.[0];
  return row ? toPilot(row) : null;
}

// ── Demandes d'amis ───────────────────────────────────────────────────────
export async function sendFriendRequest(addresseeId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('friendships')
    .insert({ requester_id: auth.user?.id, addressee_id: addresseeId });
  if (error) throw new Error(error.message);
}

export async function acceptFriendRequest(friendshipId: string): Promise<void> {
  const { error } = await supabase
    .from('friendships')
    .update({ status: 'accepted' })
    .eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

/** Refus (destinataire), annulation (demandeur) ou retrait d'un ami. */
export async function deleteFriendship(friendshipId: string): Promise<void> {
  const { error } = await supabase.from('friendships').delete().eq('id', friendshipId);
  if (error) throw new Error(error.message);
}

type RawFriendship = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: 'pending' | 'accepted';
  requester: { username: string; elo: number } | null;
  addressee: { username: string; elo: number } | null;
};

/** Relation entre moi et un pilote donné (pour la fiche P). */
export async function getFriendshipWith(pilotId: string): Promise<FriendshipState> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  // Filtre explicite sur la paire (lui, moi) — on ne s'appuie pas uniquement
  // sur la RLS pour écarter les relations de tiers.
  const { data, error } = await supabase
    .from('friendships')
    .select('id, requester_id, addressee_id, status')
    .or(
      `and(requester_id.eq.${me},addressee_id.eq.${pilotId}),and(requester_id.eq.${pilotId},addressee_id.eq.${me})`,
    )
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return { status: 'none', friendshipId: null };
  if (data.status === 'accepted') return { status: 'accepted', friendshipId: data.id };
  return {
    status: data.requester_id === me ? 'pending_sent' : 'pending_received',
    friendshipId: data.id,
  };
}

/** Les trois listes de l'onglet Amis (reçues, envoyées, amis). */
export async function listFriendships(): Promise<FriendLists> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  const { data, error } = await supabase
    .from('friendships')
    .select(
      'id, requester_id, addressee_id, status, requester:profiles!friendships_requester_id_fkey(username, elo), addressee:profiles!friendships_addressee_id_fkey(username, elo)',
    )
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as unknown as RawFriendship[];
  const entry = (r: RawFriendship): FriendEntry => {
    const otherIsRequester = r.requester_id !== me;
    const other = otherIsRequester ? r.requester : r.addressee;
    return {
      friendshipId: r.id,
      pilotId: otherIsRequester ? r.requester_id : r.addressee_id,
      username: other?.username ?? '—',
      elo: other?.elo ?? 1000,
    };
  };

  return {
    received: rows.filter((r) => r.status === 'pending' && r.addressee_id === me).map(entry),
    sent: rows.filter((r) => r.status === 'pending' && r.requester_id === me).map(entry),
    friends: rows.filter((r) => r.status === 'accepted').map(entry),
  };
}

/** Mes amis (pour la sélection dans une course). */
export async function listFriends(): Promise<FriendEntry[]> {
  return (await listFriendships()).friends;
}

// ── Blocage & signalement ─────────────────────────────────────────────────
/** Bloque un pilote : coupe l'amitié existante puis pose le blocage. */
export async function blockPilot(pilotId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const state = await getFriendshipWith(pilotId);
  if (state.friendshipId) await deleteFriendship(state.friendshipId);
  const { error } = await supabase
    .from('blocks')
    .insert({ blocker_id: auth.user?.id, blocked_id: pilotId });
  if (error) throw new Error(error.message);
}

/** Les pilotes que j'ai bloqués (pour l'écran de déblocage, lot 2.5). */
export async function listBlocked(): Promise<{ id: string; username: string }[]> {
  const { data, error } = await supabase.rpc('list_blocked');
  if (error) throw new Error(error.message);
  return (data ?? []) as { id: string; username: string }[];
}

/** Débloque un pilote (retire le blocage que j'ai posé). */
export async function unblockPilot(pilotId: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase
    .from('blocks')
    .delete()
    .eq('blocker_id', auth.user?.id)
    .eq('blocked_id', pilotId);
  if (error) throw new Error(error.message);
}

export async function reportPilot(
  pilotId: string,
  category: ReportCategory,
  message?: string,
): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('reports').insert({
    reporter_id: auth.user?.id,
    reported_profile_id: pilotId,
    category,
    message: message?.trim() || null,
  });
  if (error) throw new Error(error.message);
}

// ── Face-à-face ───────────────────────────────────────────────────────────
type RawDuel = {
  dnf: boolean | null;
  race_id: string;
  position: number;
  participation: { profile_id: string | null } | null;
};

/** Bilan des courses communes : « Toi X — Y Lui ». */
export async function faceToFace(otherId: string): Promise<FaceToFace> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return { races: 0, myWins: 0, theirWins: 0, draws: 0 };

  const { data, error } = await supabase
    .from('results')
    .select('race_id, position, dnf, participation:participations!inner(profile_id)')
    .in('participation.profile_id', [me, otherId]);
  if (error) throw new Error(error.message);

  type Side = { pos: number; dnf: boolean };
  const byRace = new Map<string, { mine?: Side; theirs?: Side }>();
  for (const r of (data ?? []) as unknown as RawDuel[]) {
    const slot = byRace.get(r.race_id) ?? {};
    const side: Side = { pos: r.position, dnf: r.dnf === true };
    if (r.participation?.profile_id === me) slot.mine = side;
    else if (r.participation?.profile_id === otherId) slot.theirs = side;
    byRace.set(r.race_id, slot);
  }

  let races = 0;
  let myWins = 0;
  let theirWins = 0;
  let draws = 0;
  for (const { mine, theirs } of byRace.values()) {
    if (!mine || !theirs) continue;
    races += 1;
    // Deux abandons : le moteur les a déclarés ex æquo (0,5 chacun). Leur
    // donner un vainqueur d'après la position d'affichage inventerait une
    // victoire que l'Elo n'a jamais accordée.
    if (mine.dnf && theirs.dnf) draws += 1;
    else if (mine.dnf) theirWins += 1;
    else if (theirs.dnf) myWins += 1;
    else if (mine.pos < theirs.pos) myWins += 1;
    else theirWins += 1;
  }
  return { races, myWins, theirWins, draws };
}
