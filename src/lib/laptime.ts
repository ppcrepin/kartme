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

/**
 * Saisie « pavé numérique » (retour PO 2026-07-28 : ne plus avoir à taper les
 * « : » ni le « . »). Le pilote tape SEULEMENT des chiffres, qui se remplissent
 * de la DROITE vers la gauche — millièmes, puis secondes, puis minutes :
 *
 *   5       → 0:00.005      52348   → 0:52.348
 *   523     → 0:00.523      102345  → 1:02.345
 *
 * C'est la mécanique d'un chronomètre ou d'un champ monétaire : on ne se
 * demande jamais où mettre le séparateur, il se place tout seul.
 */
export const LAP_MAX_DIGITS = 7; // mm:ss.mmm

/** Ne garde que les chiffres, et plafonne la longueur. */
export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, LAP_MAX_DIGITS);
}

/** Chiffres bruts → millisecondes. Renvoie null si vide ou hors bornes. */
export function digitsToMs(digits: string): number | null {
  const d = onlyDigits(digits);
  if (!d) return null;
  const padded = d.padStart(6, '0');
  const mmm = parseInt(padded.slice(-3), 10);
  const ss = parseInt(padded.slice(-5, -3), 10);
  const mm = parseInt(padded.slice(0, -5) || '0', 10);
  // 62 secondes n'est pas une saisie plausible : c'est une minute mal tapée.
  if (ss >= 60) return null;
  const ms = mm * 60_000 + ss * 1000 + mmm;
  if (ms < LAP_MIN_MS || ms > LAP_MAX_MS) return null;
  return ms;
}

/** Chiffres bruts → affichage « m:ss.mmm », y compris pendant la frappe. */
export function formatDigits(digits: string): string {
  const d = onlyDigits(digits);
  if (!d) return '';
  const padded = d.padStart(6, '0');
  const mm = padded.slice(0, -5) || '0';
  return `${parseInt(mm, 10)}:${padded.slice(-5, -3)}.${padded.slice(-3)}`;
}

/** Millisecondes → chiffres bruts (pré-remplissage d'un temps existant). */
export function msToDigits(ms: number | null): string {
  if (ms == null) return '';
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const mmm = ms % 1000;
  const raw = `${m}${String(s).padStart(2, '0')}${String(mmm).padStart(3, '0')}`;
  return raw.replace(/^0+(?=\d{5})/, ''); // pas de zéro de tête inutile
}
