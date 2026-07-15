import { Fraunces_700Bold, Fraunces_900Black, useFonts } from '@expo-google-fonts/fraunces';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef } from 'react';

import { captureReferralFromUrl, logError, track } from '@/lib/analytics';
import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { rememberPendingRoute, takePendingRoute } from '@/lib/pending-route';

// Garde le splash affiché tant que la police d'affichage n'est pas prête.
SplashScreen.preventAutoHideAsync();

// Redirige selon l'état d'authentification :
//  - non connecté           → écrans (auth)
//  - connecté sans profil    → onboarding pseudo
//  - connecté avec profil    → l'app (tabs)
function RootNavigator() {
  const { initializing, session, hasProfile } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  // Analytics : une ouverture d'app par session connectée (rétention/DAU).
  const openedFor = useRef<string | null>(null);
  useEffect(() => {
    const uid = session?.user.id;
    if (hasProfile === true && uid && openedFor.current !== uid) {
      openedFor.current = uid;
      track('app_open').catch(() => {});
    }
  }, [session, hasProfile]);

  useEffect(() => {
    if (initializing) return;
    // Pages légales publiques : accessibles dans tout état d'auth (l'utilisateur
    // doit pouvoir LIRE les CGU/confidentialité qu'il accepte à l'inscription).
    const path = segments.join('/');
    if (path === 'settings/cgu' || path === 'settings/confidentialite') return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!session) {
      if (!inAuth) {
        rememberPendingRoute(path); // ex. « race/abc » → on y reviendra après connexion
        router.replace('/sign-in');
      }
    } else if (hasProfile === false) {
      if (!inOnboarding) router.replace('/username');
    } else if (hasProfile === true) {
      // Consommer la destination mémorisée dès qu'on est connecté+profilé, quel
      // que soit le groupe : après un retour OAuth (redirection plein écran vers
      // la racine = groupe (tabs)), on n'est ni dans (auth) ni (onboarding).
      const pending = takePendingRoute();
      if (pending) router.replace(`/${pending}`);
      else if (inAuth || inOnboarding) router.replace('/(tabs)');
    }
  }, [initializing, session, hasProfile, segments, router]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}

export default function RootLayout() {
  const [fontsLoaded] = useFonts({ Fraunces_700Bold, Fraunces_900Black });

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded]);

  // Analytics maison : capture le parrain de l'URL + garde-fou d'erreurs global.
  useEffect(() => {
    captureReferralFromUrl();
    if (typeof window === 'undefined') return;
    // Contexte réduit au pathname (pas de query string : évite de journaliser un
    // éventuel token/identifiant présent dans l'URL — minimisation RGPD).
    const cleanPath = (u?: string) => {
      if (!u) return undefined;
      try {
        return new URL(u).pathname;
      } catch {
        return undefined;
      }
    };
    const onError = (e: ErrorEvent) => logError(e.message || 'error', cleanPath(e.filename));
    const onRejection = (e: PromiseRejectionEvent) =>
      logError(String(e.reason ?? 'unhandledrejection'), 'promise');
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <AuthProvider>
      <StatusBar style="light" />
      <RootNavigator />
    </AuthProvider>
  );
}
