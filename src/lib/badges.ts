/**
 * Couche données des badges (lot 2.3, écrans R3/R4). Le déblocage se fait
 * CÔTÉ SERVEUR (award_badges, appelé à la validation du classement) — ici on
 * ne fait que lire. Le catalogue (noms, conditions) vit dans l'i18n ; les
 * icônes dans components/ui/badge-icon.
 */
import type { BadgeKey } from '@/components/ui/badge-icon';
import { supabase } from '@/lib/supabase';

export type { BadgeKey };

/**
 * Les 9 badges, dans l'ordre du catalogue (BADGES.md).
 *
 * Ils étaient douze. Trois décrivaient une mauvaise soirée — Kart-astrophe
 * (perdre 45 points), Voiture balai (finir dernier), Tête-à-queue (perdre un
 * palier de grade) — et l'application les rangeait dans la MÊME vitrine que
 * les trophées à décrocher. Une vitrine où l'on collectionne ses défaites
 * n'invite personne à revenir (décision PO 2026-08-01, après test utilisateur).
 * Le moteur et l'historique partent avec, côté serveur.
 */
export const BADGE_KEYS: readonly BadgeKey[] = [
  'kart_didentite',
  'habitue_stands',
  'champagne',
  'chapeaux_de_roues',
  'midi_moins_le_kart',
  'chef_ecurie',
  'drs',
  'safety_car',
  'push',
] as const;

export interface UnlockedBadge {
  key: BadgeKey;
  unlockedAt: string;
  raceId: string | null;
}

type RawBadge = { badge_key: BadgeKey; unlocked_at: string; race_id: string | null };

/** Badges débloqués d'un pilote (le mien par défaut), indexés par clé. */
export async function listBadges(profileId?: string): Promise<Map<BadgeKey, UnlockedBadge>> {
  let target = profileId;
  if (!target) {
    const { data: auth } = await supabase.auth.getUser();
    target = auth.user?.id;
  }
  const map = new Map<BadgeKey, UnlockedBadge>();
  if (!target) return map;
  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_key, unlocked_at, race_id')
    .eq('profile_id', target);
  if (error) throw new Error(error.message);
  for (const r of (data ?? []) as RawBadge[]) {
    map.set(r.badge_key, { key: r.badge_key, unlockedAt: r.unlocked_at, raceId: r.race_id });
  }
  return map;
}

/** Badges que J'AI débloqués sur une course donnée (bandeau post-course). */
export async function badgesForRace(raceId: string): Promise<BadgeKey[]> {
  const { data: auth } = await supabase.auth.getUser();
  const me = auth.user?.id;
  if (!me) return [];
  const { data, error } = await supabase
    .from('user_badges')
    .select('badge_key')
    .eq('profile_id', me)
    .eq('race_id', raceId);
  if (error) throw new Error(error.message);
  return ((data ?? []) as { badge_key: BadgeKey }[]).map((r) => r.badge_key);
}
