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
 * Les 11 badges, dans l'ordre du catalogue (BADGES.md).
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
  // C13 — promotion du karting électrique (décision PO 2026-08-01). Ils
  // arrivent en fin de liste : la vitrine se lit dans l'ordre de découverte,
  // et ces deux-là ne remplacent rien.
  'sous_tension',
  'haute_tension',
] as const;

export interface UnlockedBadge {
  key: BadgeKey;
  unlockedAt: string;
  raceId: string | null;
}

type RawBadge = { badge_key: string; unlocked_at: string; race_id: string | null };

/**
 * Les clés que l'application sait afficher. La base peut en servir d'autres :
 * le PO colle le SQL À LA MAIN, donc entre le déploiement du front et son
 * collage, `user_badges` contient encore les trois badges retirés — et le
 * moteur non migré continue d'en attribuer. Sans ce filtre, `t.badges.items[k]`
 * valait `undefined` et la fiche pilote s'affichait BLANCHE ; le compteur, lui,
 * annonçait « 12 sur 9 débloqués ».
 *
 * Le filtre reste utile après la migration : c'est la garantie que le catalogue
 * de l'écran et celui de la base ne peuvent jamais se contredire à l'affichage.
 */
const CONNUS = new Set<string>(BADGE_KEYS);

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
    if (!CONNUS.has(r.badge_key)) continue;
    const key = r.badge_key as BadgeKey;
    map.set(key, { key, unlockedAt: r.unlocked_at, raceId: r.race_id });
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
  // Même filtre que `listBadges` : le moteur non encore migré attribue
  // toujours les badges retirés, et le bandeau post-course plantait sur le
  // dernier de chaque course.
  return ((data ?? []) as { badge_key: string }[])
    .filter((r) => CONNUS.has(r.badge_key))
    .map((r) => r.badge_key as BadgeKey);
}
