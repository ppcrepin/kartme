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

// Liste de base, volontairement courte et extensible. Le filtre travaille sur
// une forme normalisée (sans accents, sans séparateurs) pour éviter les
// contournements simples (e-s-p-a-c-e-s, accents…).
const BANNED = ['con', 'connard', 'salope', 'pute', 'merde', 'nazi', 'fdp', 'ntm', 'encule'];

/** Normalise pour la comparaison : minuscules, sans accents, lettres/chiffres seuls. */
function normalize(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // retire les accents (diacritiques combinants)
    .replace(/[^a-z0-9]/g, ''); // retire espaces/ponctuation
}

/** Valide un nom d'invité (profil fantôme) : 1–40 caractères + filtre de mots. */
export function validateGhostName(raw: string): UsernameCheck {
  const value = raw.trim();
  if (value.length === 0) return { ok: false, value, error: 'empty' };
  if (value.length > 40) return { ok: false, value, error: 'too_long' };
  if (BANNED.some((word) => normalize(value).includes(word))) {
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

  const normalized = normalize(value);
  if (BANNED.some((word) => normalized.includes(word))) {
    return { ok: false, value, error: 'banned' };
  }
  return { ok: true, value };
}
