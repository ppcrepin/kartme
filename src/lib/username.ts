/**
 * Règles de pseudo (cahier §B4/B5) : 3–20 caractères, non unique,
 * filtre de mots interdits. Utilisé à l'inscription et à l'onboarding pseudo.
 */

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;

export type UsernameError = 'empty' | 'too_short' | 'too_long' | 'banned';

export interface UsernameCheck {
  ok: boolean;
  value: string; // pseudo nettoyé (espaces de bord retirés)
  error?: UsernameError;
}

// Filtre à deux passes (miroir exact de public.contains_banned_word en base) :
//  · SUB : tokens longs/sans ambiguïté → sous-chaîne sur la forme collée (attrape
//    aussi les contournements espacés « n a z i ») ;
//  · WORD : tokens courts/ambigus → MOT ISOLÉ seulement, pour ne pas bloquer des
//    noms légitimes (Concarneau, Concorde, député…).
const SUB_BANNED = ['connard', 'salope', 'encule', 'nazi', 'merde'];
const WORD_BANNED = ['con', 'pute', 'fdp', 'ntm'];

/** Minuscules + sans accents (diacritiques combinants retirés). */
function fold(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

/** Forme collée (sans séparateurs), utilisée à l'inscription pour l'unicité visuelle. */
function normalize(input: string): string {
  return fold(input).replace(/[^a-z0-9]/g, '');
}

/** Vrai si le texte contient un mot interdit (deux passes, comme le serveur). */
function containsBanned(input: string): boolean {
  const collapsed = normalize(input);
  if (SUB_BANNED.some((w) => collapsed.includes(w))) return true;
  const tokens = fold(input)
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ');
  return WORD_BANNED.some((w) => tokens.includes(w));
}

/** Valide un nom d'invité (profil fantôme) : 1–40 caractères + filtre de mots. */
export function validateGhostName(raw: string): UsernameCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, value, error: 'empty' };
  if (value.length > 40) return { ok: false, value, error: 'too_long' };
  if (containsBanned(value)) {
    return { ok: false, value, error: 'banned' };
  }
  return { ok: true, value };
}

/** Valide un nom de circuit : 2–80 caractères + filtre de mots (miroir de la contrainte SQL). */
export function validateCircuitName(raw: string): UsernameCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, value, error: 'empty' };
  if (value.length < 2) return { ok: false, value, error: 'too_short' };
  if (value.length > 80) return { ok: false, value, error: 'too_long' };
  if (containsBanned(value)) {
    return { ok: false, value, error: 'banned' };
  }
  return { ok: true, value };
}

/** Valide un pseudo. Ne vérifie PAS l'unicité (les pseudos ne sont pas uniques). */
export function validateUsername(raw: string): UsernameCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, value, error: 'empty' };
  if (value.length < USERNAME_MIN) return { ok: false, value, error: 'too_short' };
  if (value.length > USERNAME_MAX) return { ok: false, value, error: 'too_long' };

  if (containsBanned(value)) {
    return { ok: false, value, error: 'banned' };
  }
  return { ok: true, value };
}
