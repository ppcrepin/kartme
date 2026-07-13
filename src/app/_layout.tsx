import { Fraunces_700Bold, Fraunces_900Black, useFonts } from '@expo-google-fonts/fraunces';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { colors } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/lib/auth';

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

  useEffect(() => {
    if (initializing) return;
    const group = segments[0];
    const inAuth = group === '(auth)';
    const inOnboarding = group === '(onboarding)';

    if (!session) {
      if (!inAuth) router.replace('/sign-in');
    } else if (hasProfile === false) {
      if (!inOnboarding) router.replace('/username');
    } else if (hasProfile === true) {
      if (inAuth || inOnboarding) router.replace('/(tabs)');
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
