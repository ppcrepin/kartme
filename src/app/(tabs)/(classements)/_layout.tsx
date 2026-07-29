import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/** Pile de l'onglet Classements — voir (courses)/_layout.tsx pour le pourquoi. */
export const unstable_settings = {
  initialRouteName: 'classements',
};

export default function ClassementsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
