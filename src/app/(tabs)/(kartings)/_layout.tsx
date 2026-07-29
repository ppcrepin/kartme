import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/** Pile de l'onglet Kartings — voir (courses)/_layout.tsx pour le pourquoi. */
export const unstable_settings = {
  initialRouteName: 'kartings',
};

export default function KartingsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
