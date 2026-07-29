import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/** Pile de l'onglet Profil — voir (courses)/_layout.tsx pour le pourquoi. */
export const unstable_settings = {
  initialRouteName: 'profil',
};

export default function ProfilStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
