/**
 * Fiche circuit (A11) — lecture seule, deux RPC.
 *
 * Les règles (privés anonymisés, courses ≥ 2 inscrits, invités exclus) vivent
 * CÔTÉ SERVEUR : le client affiche ce qu'on lui rend, il ne filtre rien.
 */
import { supabase } from '@/lib/supabase';

export type LapPeriod = 'all' | 'year' | 'month';

/** Un onglet de période n'apparaît qu'à partir de ce nombre de pilotes. */
export const PERIOD_TAB_MIN = 5;

export interface CircuitPage {
  id: string;
  name: string;
  city: string | null;
  lat: number | null;
  lon: number | null;
  aliases: string | null;
  website: string | null;
  phone: string | null;
  isIndoor: boolean;
  racesCount: number;
  pilotsCount: number;
  lastRaceAt: string | null;
  myRacesCount: number;
  myBestLapMs: number | null;
  lapsAll: number;
  lapsYear: number;
  lapsMonth: number;
  // Le « métier » importé du relevé PO (A16) — souvent partiel : chaque champ
  // est optionnel, et la fiche n'affiche que ce qu'elle sait.
  lengthM: number | null;
  widthM: number | null;
  envKind: 'indoor' | 'outdoor' | 'temporaire' | null;
  motorKind: 'thermique' | 'electrique' | 'mixte' | null;
  usageKind: 'loisir' | 'competition' | 'mixte' | null;
  homologation: 'FFSA' | 'CIK-FIA' | 'FIA' | null;
  address: string | null;
  postalCode: string | null;
  /** Les tracés d'un lieu à plusieurs pistes, en clair (informatif). */
  tracksNote: string | null;
}

export interface TopTime {
  rank: number;
  /** null = profil privé non-ami : le temps est là, l'identité non. */
  pilotId: string | null;
  username: string | null;
  bestLapMs: number;
  achievedAt: string;
  isMe: boolean;
}

type RawPage = {
  id: string; name: string; city: string | null; lat: number | null; lon: number | null;
  aliases: string | null; website: string | null; phone: string | null; is_indoor: boolean;
  races_count: number; pilots_count: number; last_race_at: string | null;
  my_races_count: number; my_best_lap_ms: number | null;
  laps_all: number; laps_year: number; laps_month: number;
  length_m: string | number | null; width_m: string | number | null;
  env_kind: CircuitPage['envKind']; motor_kind: CircuitPage['motorKind'];
  usage_kind: CircuitPage['usageKind']; homologation: CircuitPage['homologation'];
  address: string | null; postal_code: string | null; tracks_note: string | null;
};

type RawTop = {
  rank: number; pilot_id: string | null; username: string | null;
  best_lap_ms: number; achieved_at: string; is_me: boolean;
};

export async function getCircuitPage(circuitId: string): Promise<CircuitPage | null> {
  const { data, error } = await supabase.rpc('get_circuit_page', { p_circuit_id: circuitId });
  if (error) throw new Error(error.message);
  const r = ((data ?? []) as RawPage[])[0];
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    city: r.city,
    lat: r.lat,
    lon: r.lon,
    aliases: r.aliases,
    website: r.website,
    phone: r.phone,
    isIndoor: r.is_indoor,
    racesCount: r.races_count,
    pilotsCount: r.pilots_count,
    lastRaceAt: r.last_race_at,
    myRacesCount: r.my_races_count,
    myBestLapMs: r.my_best_lap_ms,
    lapsAll: r.laps_all,
    lapsYear: r.laps_year,
    lapsMonth: r.laps_month,
    // `numeric` en base. PostgREST le sérialise en nombre JSON, mais rien ne
    // le garantit contractuellement (un client qui préserve la précision le
    // rendrait en chaîne) et une chaîne passerait le typage sans bruit avant
    // de casser l'arrondi à l'affichage. La conversion est donc explicite.
    lengthM: r.length_m == null ? null : Number(r.length_m),
    widthM: r.width_m == null ? null : Number(r.width_m),
    envKind: r.env_kind,
    motorKind: r.motor_kind,
    usageKind: r.usage_kind,
    homologation: r.homologation,
    address: r.address,
    postalCode: r.postal_code,
    tracksNote: r.tracks_note,
  };
}

export async function getCircuitTopTimes(
  circuitId: string,
  period: LapPeriod,
): Promise<TopTime[]> {
  const { data, error } = await supabase.rpc('get_circuit_top_times', {
    p_circuit_id: circuitId,
    p_period: period,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as RawTop[]).map((r) => ({
    rank: r.rank,
    pilotId: r.pilot_id,
    username: r.username,
    bestLapMs: r.best_lap_ms,
    achievedAt: r.achieved_at,
    isMe: r.is_me,
  }));
}
