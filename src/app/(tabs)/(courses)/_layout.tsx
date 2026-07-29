import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/**
 * Pile de l'onglet Courses. Chaque onglet porte sa propre pile : les écrans
 * de détail retrouvent leur cycle de vie normal (démontés au retour, état
 * neuf à chaque visite) tout en laissant la barre d'onglets visible —
 * l'architecture plate « tout en écrans d'onglet cachés » gardait chaque
 * écran monté à vie, avec états résiduels (busy, confirmations, scroll)
 * ressurgissant à la visite suivante.
 */
export const unstable_settings = {
  // Un lien profond (course partagée, PWA relancée) reçoit la liste des
  // courses comme cran de retour au lieu d'une pile sans fond.
  initialRouteName: 'index',
};

export default function CoursesStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
