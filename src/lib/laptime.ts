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
 * Saisie « masque » (retour PO 2026-07-28) : on tape SEULEMENT des chiffres,
 * qui remplissent le gabarit `m:ss.mmm` de GAUCHE à DROITE. Les emplacements
 * pas encore saisis restent affichés en gris — on voit d'un coup d'œil où on
 * en est, et il n'y a ni « : » ni « . » à viser sur un clavier de téléphone.
 *
 *   0        → 0:__.___     052      → 0:52.___
 *   05234    → 0:52.34_     052348   → 0:52.348
 *   1023     → 1:02.3__     102345   → 1:02.345
 *
 * Six emplacements : une minute, deux secondes, trois millièmes. Largement
 * suffisant en karting (plafond 9:59.999, bien à l'intérieur des bornes).
 */
export const LAP_SLOTS = 6;
/** Gabarit affiché : `true` = emplacement de chiffre, sinon séparateur. */
export const LAP_MASK: { char: string; digit: boolean }[] = [
  { char: '0', digit: true },
  { char: ':', digit: false },
  { char: '0', digit: true },
  { char: '0', digit: true },
  { char: '.', digit: false },
  { char: '0', digit: true },
  { char: '0', digit: true },
  { char: '0', digit: true },
];

/**
 * Gabarit prêt à afficher : chaque caractère, et s'il est « allumé » (saisi)
 * ou laissé en gris. Un séparateur s'allume dès que le chiffre qui le précède
 * est saisi. Fonction pure — le rendu n'a plus qu'à choisir deux couleurs.
 */
export function lapMaskParts(digits: string): { char: string; filled: boolean }[] {
  const d = onlyDigits(digits);
  return LAP_MASK.map((m, i) => {
    const slot = LAP_MASK.slice(0, i).filter((x) => x.digit).length;
    if (m.digit) return { char: d[slot] ?? m.char, filled: slot < d.length };
    return { char: m.char, filled: slot > 0 && slot <= d.length };
  });
}

/** Ne garde que les chiffres, et plafonne au nombre d'emplacements. */
export function onlyDigits(raw: string): string {
  return raw.replace(/\D/g, '').slice(0, LAP_SLOTS);
}

/**
 * Chiffres saisis → millisecondes. Les emplacements laissés vides valent 0
 * (« 052 » = 0:52.000). Renvoie null si rien n'est saisi ou si le temps sort
 * des bornes acceptées.
 */
export function digitsToMs(digits: string): number | null {
  const d = onlyDigits(digits);
  if (!d) return null;
  const full = d.padEnd(LAP_SLOTS, '0');
  const mm = parseInt(full.slice(0, 1), 10);
  const ss = parseInt(full.slice(1, 3), 10);
  const mmm = parseInt(full.slice(3), 10);
  // 62 secondes n'est pas une saisie plausible : c'est une minute mal tapée.
  if (ss >= 60) return null;
  const ms = mm * 60_000 + ss * 1000 + mmm;
  if (ms < LAP_MIN_MS || ms > LAP_MAX_MS) return null;
  return ms;
}

/** Millisecondes → chiffres du gabarit (pré-remplissage d'un temps existant). */
export function msToDigits(ms: number | null): string {
  if (ms == null) return '';
  const m = Math.min(9, Math.floor(ms / 60_000));
  const s = Math.floor((ms % 60_000) / 1000);
  const mmm = ms % 1000;
  return `${m}${String(s).padStart(2, '0')}${String(mmm).padStart(3, '0')}`;
}
