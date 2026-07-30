import { t } from '@/i18n';
import { type BadgeKey } from '@/lib/badges';
import { formatRaceDate } from '@/lib/datetime';
import { GRADES } from '@/lib/grade';
import { supabase } from '@/lib/supabase';

/**
 * Fil d'actualité (A15) — couche client de `get_feed`.
 *
 * Le serveur renvoie des FAITS (type, acteur, course, nombres) ; le français
 * se compose ICI. Un libellé figé en base gèlerait un pseudo et un Elo, et
 * changer une tournure ne doit pas coûter une migration collée à la main.
 */
export type FeedKind =
  | 'race_upcoming'
  | 'race_result'
  | 'grade_friend'
  | 'grade_me'
  | 'badge_friend';

export type FeedItem = {
  kind: FeedKind;
  at: string;
  actorId: string;
  actorUsername: string;
  actorAvatarPath: string | null;
  raceId: string | null;
  circuitId: string | null;
  circuitName: string | null;
  scheduledAt: string | null;
  pilotsCount: number | null;
  guestsCount: number | null;
  winnerUsername: string | null;
  myPosition: number | null;
  myEloDelta: number | null;
  badgeKey: string | null;
  bandFrom: number | null;
  bandTo: number | null;
  elo: number | null;
};

type RawFeedRow = {
  kind: FeedKind;
  at: string;
  actor_id: string;
  actor_username: string;
  actor_avatar_path: string | null;
  race_id: string | null;
  circuit_id: string | null;
  circuit_name: string | null;
  scheduled_at: string | null;
  pilots_count: number | null;
  guests_count: number | null;
  winner_username: string | null;
  my_position: number | null;
  my_elo_delta: number | null;
  badge_key: string | null;
  band_from: number | null;
  band_to: number | null;
  elo: number | null;
};

export async function getFeed(before?: string | null, limit = 20): Promise<FeedItem[]> {
  const { data, error } = await supabase.rpc('get_feed', {
    p_before: before ?? null,
    p_limit: limit,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawFeedRow[]).map((r) => ({
    kind: r.kind,
    at: r.at,
    actorId: r.actor_id,
    actorUsername: r.actor_username,
    actorAvatarPath: r.actor_avatar_path,
    raceId: r.race_id,
    circuitId: r.circuit_id,
    circuitName: r.circuit_name,
    scheduledAt: r.scheduled_at,
    pilotsCount: r.pilots_count,
    guestsCount: r.guests_count,
    winnerUsername: r.winner_username,
    myPosition: r.my_position,
    myEloDelta: r.my_elo_delta,
    badgeKey: r.badge_key,
    bandFrom: r.band_from,
    bandTo: r.band_to,
    elo: r.elo,
  }));
}

export async function unreadFeedCount(): Promise<number> {
  const { data, error } = await supabase.rpc('unread_feed_count');
  if (error) throw new Error(error.message);
  return (data as number) ?? 0;
}

export async function markFeedSeen(): Promise<void> {
  const { error } = await supabase.rpc('mark_feed_seen');
  if (error) throw new Error(error.message);
}

/** Nom de grade d'une bande (1..6) de `grade_band` — même échelle que GRADES. */
const gradeName = (band: number | null) =>
  band && band >= 1 && band <= GRADES.length ? GRADES[band - 1].name : '';

const fmtDelta = (d: number) => (d > 0 ? `▲ +${d}` : d < 0 ? `▼ ${d}` : '—');

/**
 * Destination du tap d'un item — null quand il n'y a nulle part où aller
 * (mon propre grade sans course rattachée) : la rangée ne doit alors pas se
 * présenter comme pressable (revue : « tap mort, sans retour visuel »).
 */
export function feedDest(item: FeedItem): string | null {
  if (item.raceId) return `/race/${item.raceId}`;
  if (item.kind !== 'grade_me') return `/pilot/${item.actorId}`;
  return null;
}

/**
 * Titre + sous-titre français d'un item.
 */
export function feedLabel(item: FeedItem): { title: string; sub: string | null } {
  const f = t.feed;
  switch (item.kind) {
    case 'race_upcoming':
      return {
        title: f.upcoming.replace('%a', item.actorUsername),
        sub: [item.circuitName, item.scheduledAt ? formatRaceDate(item.scheduledAt) : null]
          .filter(Boolean)
          .join(' · ') || null,
      };
    case 'race_result': {
      const title = item.winnerUsername
        ? f.resultWin.replace('%w', item.winnerUsername).replace('%c', item.circuitName ?? '?')
        : f.resultDone.replace('%c', item.circuitName ?? '?');
      const sub =
        item.myPosition != null
          ? f.resultYou
              .replace('%p', item.myPosition === 1 ? '1ᵉʳ' : `${item.myPosition}ᵉ`)
              .replace('%d', fmtDelta(item.myEloDelta ?? 0))
          : [
              (item.pilotsCount ?? 0) === 1
                ? f.pilotOne
                : f.pilots.replace('%n', String(item.pilotsCount ?? 0)),
              item.guestsCount
                ? item.guestsCount === 1
                  ? f.guestOne
                  : f.guests.replace('%n', String(item.guestsCount))
                : null,
            ]
              .filter(Boolean)
              .join(' · ');
      return { title, sub };
    }
    case 'grade_friend': {
      const monte = (item.bandTo ?? 0) > (item.bandFrom ?? 0);
      return {
        title: (monte ? f.gradeUp : f.gradeDown)
          .replace('%a', item.actorUsername)
          .replace('%g', gradeName(item.bandTo)),
        sub: null,
      };
    }
    case 'grade_me': {
      const monte = (item.bandTo ?? 0) > (item.bandFrom ?? 0);
      if (monte) return { title: f.meUp.replace('%g', gradeName(item.bandTo)), sub: null };
      // Formulé comme un OBJECTIF : les points qui manquent pour remonter.
      const seuil =
        item.bandFrom && item.bandFrom >= 1 && item.bandFrom <= GRADES.length
          ? GRADES[item.bandFrom - 1].min
          : null;
      const manque = seuil && item.elo != null ? Math.max(1, seuil - item.elo) : null;
      return {
        title: f.meDown.replace('%g', gradeName(item.bandTo)),
        sub: manque ? f.meDownGoal.replace('%n', String(manque)) : null,
      };
    }
    case 'badge_friend': {
      const nom =
        item.badgeKey && item.badgeKey in t.badges.items
          ? t.badges.items[item.badgeKey as BadgeKey].name
          : (item.badgeKey ?? '');
      return {
        title: f.badge.replace('%a', item.actorUsername).replace('%b', nom),
        sub: null,
      };
    }
  }
}
