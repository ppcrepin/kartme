import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/** Pile de l'onglet Amis — voir (courses)/_layout.tsx pour le pourquoi. */
export const unstable_settings = {
  initialRouteName: 'amis',
};

export default function AmisStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
