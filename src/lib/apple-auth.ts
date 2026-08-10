import type { AuthResult } from '@/lib/auth-result';
import { t } from '@/i18n';
import { supabase } from '@/lib/supabase';

/**
 * « Se connecter avec Apple », côté natif.
 *
 * SÉPARÉ de `lib/auth` et scindé par plateforme (`.web.ts` en pendant) : un
 * simple `await import()` gardé par `Platform.OS` ne suffisait pas — Metro
 * résout les imports différés à la compilation, et embarquait donc tout le
 * module Apple dans le bundle WEB. Il ne cassait rien (les gardes d'Expo lèvent
 * une `UnavailabilityError` si on l'appelle) mais c'était du poids mort servi
 * à chaque visiteur du site. Un fichier par plateforme, et le web n'en voit
 * plus une ligne.
 *
 * Contrairement à Google, pas de navigateur : iOS rend une feuille système et
 * nous donne un jeton d'identité, que Supabase échange contre une session.
 * Pas de redirection, pas de PKCE, pas de retour d'application à gérer.
 */
export async function connexionApple(): Promise<AuthResult> {
  try {
    const Apple = await import('expo-apple-authentication');
    const credential = await Apple.signInAsync({
      requestedScopes: [
        Apple.AppleAuthenticationScope.FULL_NAME,
        Apple.AppleAuthenticationScope.EMAIL,
      ],
    });
    if (!credential.identityToken) return { error: t.auth.appleNoToken };
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    return { error: error?.message ?? null };
  } catch (e) {
    // Fermer la feuille système n'est PAS une erreur. Sans ce cas, annuler
    // affichait un message rouge sous le bouton — le même défaut que le
    // partage du podium, où un `AbortError` passait pour une panne.
    const code = (e as { code?: string } | null)?.code;
    if (code === 'ERR_REQUEST_CANCELED' || code === 'ERR_CANCELED') {
      return { error: null };
    }
    return { error: e instanceof Error ? e.message : t.auth.appleFailed };
  }
}
