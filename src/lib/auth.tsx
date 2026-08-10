import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { trackSignup } from '@/lib/analytics';
import { connexionApple } from '@/lib/apple-auth';
import type { AuthResult } from '@/lib/auth-result';
import { TERMS_VERSION } from '@/lib/legal';
import { disablePush } from '@/lib/push';
import { oublierPreferences } from '@/lib/preferences';
import { supabase } from '@/lib/supabase';
import { appBaseUrl } from '@/lib/url';

// Ferme la fenêtre d'auth après une redirection OAuth (web/natif) — mais
// jamais au rendu statique côté serveur (pas de window).
if (typeof window !== 'undefined') {
  WebBrowser.maybeCompleteAuthSession();
}

// Défini dans `lib/auth-result` : les modules scindés par plateforme en ont
// besoin sans pouvoir importer ce fichier (cycle).
export type { AuthResult };

interface AuthState {
  initializing: boolean;
  session: Session | null;
  /** null = en cours de vérification ; false = pas de profil (→ onboarding pseudo). */
  hasProfile: boolean | null;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
  /** iOS uniquement — voir `signInWithApple`. Obligatoire pour la revue Apple. */
  signInWithApple: () => Promise<AuthResult>;
  createProfile: (username: string) => Promise<AuthResult>;
  resetPassword: (email: string) => Promise<AuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [initializing, setInitializing] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [hasProfile, setHasProfile] = useState<boolean | null>(null);

  // Vérifie l'existence du profil (donc si l'onboarding pseudo est nécessaire).
  async function refreshProfile(userId: string | undefined) {
    if (!userId) {
      setHasProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, deleted_at')
      .eq('id', userId)
      .maybeSingle();
    // Compte supprimé (RGPD) : on ferme toute session résiduelle (ex. autre
    // appareil encore connecté) au lieu de laisser entrer un compte anonymisé.
    if (data && (data as { deleted_at: string | null }).deleted_at) {
      await supabase.auth.signOut();
      setSession(null);
      setHasProfile(null);
      return;
    }
    setHasProfile(!!data);
  }

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await refreshProfile(data.session?.user.id);
      setInitializing(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      setSession(next);
      await refreshProfile(next?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  async function signInWithEmail(email: string, password: string): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }

  async function signUpWithEmail(
    email: string,
    password: string,
    username: string,
  ): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) return { error: error.message };
    // Confirmation email désactivée → session immédiate, on crée le profil.
    if (data.user) {
      const { error: pErr } = await supabase.from('profiles').insert({
        id: data.user.id,
        username,
        terms_accepted_at: new Date().toISOString(),
        terms_version: TERMS_VERSION,
      });
      if (pErr) return { error: pErr.message };
      setHasProfile(true);
      trackSignup().catch(() => {});
    }
    return { error: null };
  }

  async function createProfile(username: string): Promise<AuthResult> {
    const userId = session?.user.id;
    if (!userId) return { error: 'Session introuvable.' };
    const { error } = await supabase.from('profiles').insert({
      id: userId,
      username,
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    });
    if (error) return { error: error.message };
    setHasProfile(true);
    trackSignup().catch(() => {});
    return { error: null };
  }

  async function signInWithGoogle(): Promise<AuthResult> {
    const redirectTo = appBaseUrl();
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, skipBrowserRedirect: Platform.OS !== 'web' },
    });
    if (error) return { error: error.message };

    // Sur le web, le navigateur est redirigé automatiquement. Sur natif, on
    // ouvre la session d'auth puis on échange le code (PKCE) contre une session.
    if (Platform.OS !== 'web' && data?.url) {
      const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (res.type === 'success') {
        const code = Linking.parse(res.url).queryParams?.code;
        if (typeof code === 'string') {
          const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
          if (exErr) return { error: exErr.message };
        }
      }
    }
    return { error: null };
  }

  /**
   * « Se connecter avec Apple » — iOS uniquement.
   *
   * Ce n'est pas un confort : la règle 4.8 de l'App Store l'EXIGE dès lors
   * qu'on propose une connexion par un tiers, et nous proposons Google. Sans
   * elle, l'application est refusée à la revue, sans discussion.
   *
   * Le travail est fait dans `lib/apple-auth`, scindé par plateforme : voir
   * ce fichier pour la raison (Metro embarquait le module Apple dans le
   * bundle web malgré l'import différé).
   */
  async function signInWithApple(): Promise<AuthResult> {
    // Délégué à un module scindé par plateforme : voir `lib/apple-auth`.
    return connexionApple();
  }

  async function resetPassword(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appBaseUrl(),
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    // Libère l'abonnement push de CET appareil avant de quitter la session :
    // sinon, sur un navigateur partagé, le compte suivant hériterait des
    // notifications de celui-ci (cf. confidentialité). No-op hors web.
    await disablePush().catch(() => {});
    // Même raisonnement, même endroit : les préférences locales (`ks_*`) ne
    // sont pas portées par un compte. Sur la tablette du club, le pilote
    // suivant héritait de la checklist chassée par le précédent — donc
    // d'aucun mode d'emploi, au moment exact où il en a besoin.
    oublierPreferences();
    await supabase.auth.signOut();
    setHasProfile(null);
  }

  const value = useMemo<AuthState>(
    () => ({
      initializing,
      session,
      hasProfile,
      signInWithEmail,
      signUpWithEmail,
      signInWithGoogle,
      signInWithApple,
      createProfile,
      resetPassword,
      signOut,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [initializing, session, hasProfile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth doit être utilisé dans un AuthProvider');
  return ctx;
}
