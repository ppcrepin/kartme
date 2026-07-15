/**
 * Temps au tour (lot temps au tour) — format karting m:ss.mmm.
 * Stockés en millisecondes ; affichés « 0:52.348 ».
 */
export const LAP_MIN_MS = 10_000; // 10 s
export const LAP_MAX_MS = 1_200_000; // 20 min

/** ms → « m:ss.mmm » (ex. 52348 → « 0:52.348 »). */
export function formatLap(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const mmm = ms % 1000;
  return `${m}:${String(s).padStart(2, '0')}.${String(mmm).padStart(3, '0')}`;
}

/**
 * Parse une saisie libre en millisecondes. Accepte « 52.3 », « 52.348 »,
 * « 1:02.5 », « 1:02 », « 52 ». Renvoie null si invalide ou hors bornes.
 */
export function parseLap(raw: string): number | null {
  const s = raw.trim().replace(',', '.');
  if (!s) return null;
  // [m:]ss[.mmm]
  const m = s.match(/^(?:(\d{1,3}):)?(\d{1,2})(?:\.(\d{1,3}))?$/);
  if (!m) return null;
  const min = m[1] ? parseInt(m[1], 10) : 0;
  const sec = parseInt(m[2], 10);
  const frac = m[3] ? parseInt(m[3].padEnd(3, '0'), 10) : 0;
  if (sec >= 60) return null;
  const ms = min * 60_000 + sec * 1000 + frac;
  if (ms < LAP_MIN_MS || ms > LAP_MAX_MS) return null;
  return ms;
}
