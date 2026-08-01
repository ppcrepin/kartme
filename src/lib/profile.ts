/**
 * Couche données du profil (lot 1.5) : identité, stats, courbe d'Elo,
 * historique des courses. Tout vient des tables déjà en place.
 */
import { supabase } from '@/lib/supabase';

export interface MyProfile {
  id: string;
  username: string;
  elo: number;
  isPrivate: boolean;
  isModerator: boolean;
  /** Chemin de la photo dans le bucket (null = initiales). */
  avatarPath: string | null;
}

export interface ProfileStats {
  races: number;
  wins: number;
  podiums: number;
}

export interface EloPoint {
  elo: number;
  at: string; // ISO
  /** Abandon : la chute a une raison, et la courbe doit pouvoir la dire. */
  dnf: boolean;
}

export interface HistoryEntry {
  raceId: string | null;
  circuitName: string | null;
  scheduledAt: string | null;
  position: number;
  /** Abandon : la position d'affichage existe, mais elle ne « vaut » rien. */
  dnf: boolean;
  eloDelta: number;
  eloAfter: number;
}

export async function getMyProfile(): Promise<MyProfile | null> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, username, elo, is_private, is_moderator, avatar_path')
    .eq('id', userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  return {
    id: data.id,
    username: data.username,
    elo: data.elo,
    isPrivate: data.is_private,
    isModerator: data.is_moderator,
    avatarPath: data.avatar_path ?? null,
  };
}

// ── Réglages du compte (lot 2.5) ───────────────────────────────────────────
/** Change mon pseudo (validé en amont par validateUsername). */
export async function setUsername(username: string): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Session introuvable.');
  const { error } = await supabase.from('profiles').update({ username }).eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Bascule profil public / « amis uniquement » (décision A6). */
export async function setPrivacy(isPrivate: boolean): Promise<void> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error('Session introuvable.');
  const { error } = await supabase.from('profiles').update({ is_private: isPrivate }).eq('id', userId);
  if (error) throw new Error(error.message);
}

/** Suppression RGPD : anonymise le compte et efface les données personnelles. */
export async function deleteMyAccount(): Promise<void> {
  const { error } = await supabase.rpc('delete_my_account');
  if (error) throw new Error(error.message);
}

/**
 * Courbe d'évolution : Elo de départ (1000) + valeur après chaque course.
 * Par défaut la mienne ; sinon celle du pilote donné (la RLS masque les
 * profils privés non-amis).
 */
export async function getEloCurve(profileId?: string): Promise<EloPoint[]> {
  const id = profileId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) return [];
  const { data, error } = await supabase
    .from('elo_history')
    // La date de la COURSE, pas celle de la saisie. `created_at` est l'instant
    // où l'organisateur a validé le classement : la courbe étiquetait
    // « 1 août » pendant que la ligne d'historique de la même course, trente
    // pixels plus bas, affichait « ven. 18 juil. ». Et un organisateur qui
    // rattrape trois soirées le même week-end produisait trois repères
    // identiques — un axe qui ne dit rien.
    .select('elo, created_at, dnf, race:races(scheduled_at)')
    .eq('profile_id', id)
    .order('created_at');
  if (error) throw new Error(error.message);
  // L'ORDRE reste celui de la validation : c'est lui qui a produit les points
  // d'Elo, et deux courses rattrapées dans le désordre doivent rester dans
  // l'ordre où elles ont été comptées. Seule l'ÉTIQUETTE change.
  //
  // `dnf` peut être absent sur une base pas encore migrée, et `race` être nul
  // (course supprimée : `on delete set null`) : on ne casse pas la courbe pour
  // un champ manquant, on retombe sur la date de saisie.
  return (data ?? []).map((r) => {
    const course = r.race as unknown as { scheduled_at?: string } | null;
    return { elo: r.elo, at: course?.scheduled_at ?? r.created_at, dnf: r.dnf === true };
  });
}

type RawHistory = {
  position: number;
  dnf: boolean | null;
  elo_delta: number;
  elo_after: number;
  race: { id: string; scheduled_at: string; circuit: { name: string } | null } | null;
  participation: { profile_id: string | null } | null;
};

/**
 * Courses passées d'un pilote (position, ±Elo), les plus récentes d'abord.
 * Par défaut les miennes.
 */
export async function getRaceHistory(profileId?: string): Promise<HistoryEntry[]> {
  const id = profileId ?? (await supabase.auth.getUser()).data.user?.id;
  if (!id) return [];
  const { data, error } = await supabase
    .from('results')
    .select(
      'position, dnf, elo_delta, elo_after, race:races(id, scheduled_at, circuit:circuits(name)), participation:participations!inner(profile_id)',
    )
    .eq('participation.profile_id', id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as RawHistory[]).map((r) => ({
    raceId: r.race?.id ?? null,
    circuitName: r.race?.circuit?.name ?? null,
    scheduledAt: r.race?.scheduled_at ?? null,
    position: r.position,
    dnf: r.dnf === true,
    eloDelta: r.elo_delta,
    eloAfter: r.elo_after,
  }));
}

/**
 * Agrégats : nombre de courses, victoires, podiums.
 * Un abandon compte comme une course (il était sur la piste) mais jamais comme
 * un podium : dans une course à trois, sa position d'affichage vaut 3 — sans
 * ce filtre, on « ferait un podium » en abandonnant.
 */
export function statsFromHistory(history: HistoryEntry[]): ProfileStats {
  return {
    races: history.length,
    wins: history.filter((h) => !h.dnf && h.position === 1).length,
    podiums: history.filter((h) => !h.dnf && h.position <= 3).length,
  };
}
