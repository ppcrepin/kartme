import type { AuthResult } from '@/lib/auth-result';
import { t } from '@/i18n';

/**
 * Pendant web : la connexion Apple n'existe pas ici, et le module natif ne
 * doit surtout pas entrer dans le bundle du site (voir `apple-auth.ts`).
 *
 * Le bouton n'est de toute façon pas rendu hors iOS ; ce message n'existe que
 * pour qu'un appel programmatique ne renvoie jamais un succès silencieux.
 */
export async function connexionApple(): Promise<AuthResult> {
  return { error: t.auth.appleUnavailable };
}
