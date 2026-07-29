import { Stack } from 'expo-router';

import { colors } from '@/constants/theme';

/**
 * Pile des Réglages, imbriquée dans celle de l'onglet Profil. Son rôle :
 * donner la bonne hiérarchie aux LIENS PROFONDS — arriver directement sur
 * /settings/compte (PWA relancée) montait [profil, compte] et le « ← »
 * sautait le hub Réglages ; avec cette pile, l'arrivée monte
 * [profil, [hub, compte]] et chaque « ← » remonte d'un seul cran.
 */
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SettingsStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.bg },
      }}
    />
  );
}
