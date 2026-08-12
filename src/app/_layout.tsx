// EN PREMIER, avant tout autre import : la boîte noire doit être en place
// avant que le reste du code ait la moindre occasion d'échouer.
import '@/lib/boite-noire';

import { Fraunces_700Bold, Fraunces_900Black, useFonts } from '@expo-google-fonts/fraunces';
import { Stack, usePathname, useRouter, useSegments } from 'expo-router';
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
  // `useSegments()` renvoie les segments du PATRON de route : sur /race/abc il
  // rend ['(tabs)','(courses)','race','[id]'] — littéralement « [id] ». La
  // destination mémorisée valait donc « race/[id] », et tout visiteur non
  // connecté arrivant par un lien partagé retombait après inscription sur une
  // course inexistante. `usePathname()` rend le chemin RÉSOLU (« /race/abc »).
  // Défaut ANTÉRIEUR à A19, resté invisible parce qu'aucun test ne partait
  // d'un lien profond SANS session — le canal d'acquisition n°1 du produit.
  const pathname = usePathname();
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
    // `usePathname()` ne contient déjà ni groupe ni query string.
    const path = pathname.replace(/^\/+/, '');
    if (path === 'settings/cgu' || path === 'settings/confidentialite') return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!session) {
      if (!inAuth) {
        rememberPendingRoute(path); // ex. « race/abc » → on y reviendra après connexion
        // Arrivée par un LIEN D'AMI : cette personne n'a très probablement pas
        // de compte — c'est la raison d'être du lien. L'envoyer sur « Content
        // de te revoir » lui parlait comme à un habitué ; on ouvre
        // l'inscription, d'où « Déjà un compte ? » reste à un tap.
        router.replace(path.startsWith('invite/') ? '/sign-up' : '/sign-in');
      }
    } else if (hasProfile === false) {
      if (!inOnboarding) router.replace('/username');
    } else if (hasProfile === true) {
      // Consommer la destination mémorisée dès qu'on est connecté+profilé, quel
      // que soit le groupe : après un retour OAuth (redirection plein écran vers
      // la racine = groupe (tabs)), on n'est ni dans (auth) ni (onboarding).
      const pending = takePendingRoute();
      // Destination reconstruite à l'exécution (localStorage) : les routes
      // typées d'expo-router ne peuvent pas la vérifier. `pending-route` filtre
      // aux deux bouts (écriture ET lecture) sur les seules formes partageables
      // — `race/`, `pilot/`, `invite/`.
      if (pending) router.replace(`/${pending}` as Parameters<typeof router.replace>[0]);
      else if (inAuth || inOnboarding) router.replace('/');
    }
  }, [initializing, session, hasProfile, segments, pathname, router]);

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
