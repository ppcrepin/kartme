import type { Session } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase';

// Ferme la fenêtre d'auth après une redirection OAuth (web/natif) — mais
// jamais au rendu statique côté serveur (pas de window).
if (typeof window !== 'undefined') {
  WebBrowser.maybeCompleteAuthSession();
}

/**
 * URL de retour après OAuth / reset. Sur le web, on reconstruit explicitement
 * l'adresse de l'app en incluant le sous-chemin de déploiement (EXPO_BASE_URL,
 * ex. « /kartme »), car le calcul automatique l'oublie sous GitHub Pages.
 */
function appRedirectUrl(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    const base = process.env.EXPO_BASE_URL ?? '';
    return `${window.location.origin}${base}/`.replace(/\/+$/, '/');
  }
  return Linking.createURL('/');
}

type AuthResult = { error: string | null };

interface AuthState {
  initializing: boolean;
  session: Session | null;
  /** null = en cours de vérification ; false = pas de profil (→ onboarding pseudo). */
  hasProfile: boolean | null;
  signInWithEmail: (email: string, password: string) => Promise<AuthResult>;
  signUpWithEmail: (email: string, password: string, username: string) => Promise<AuthResult>;
  signInWithGoogle: () => Promise<AuthResult>;
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
    const { data } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
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
      const { error: pErr } = await supabase.from('profiles').insert({ id: data.user.id, username });
      if (pErr) return { error: pErr.message };
      setHasProfile(true);
    }
    return { error: null };
  }

  async function createProfile(username: string): Promise<AuthResult> {
    const userId = session?.user.id;
    if (!userId) return { error: 'Session introuvable.' };
    const { error } = await supabase.from('profiles').insert({ id: userId, username });
    if (error) return { error: error.message };
    setHasProfile(true);
    return { error: null };
  }

  async function signInWithGoogle(): Promise<AuthResult> {
    const redirectTo = appRedirectUrl();
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

  async function resetPassword(email: string): Promise<AuthResult> {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: appRedirectUrl(),
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
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
