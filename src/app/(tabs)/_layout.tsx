import { Tabs } from 'expo-router';

import { TabIcon } from '@/components/tab-icon';
import { colors } from '@/constants/theme';
import { t } from '@/i18n';

/**
 * Écrans de détail qui vivent DANS le groupe des onglets (décision PO
 * 2026-07-30 : la barre d'onglets doit rester visible partout, pour se
 * promener d'une section à l'autre sans enchaîner les « précédent »).
 * `href: null` les retire de la barre : ils sont accessibles par navigation,
 * pas comme boutons d'onglet.
 */
const ECRANS_SANS_ONGLET = [
  'badges',
  'grades',
  'notifications',
  'circuit-map-picker',
  'circuit-report',
  'circuit/[id]',
  'pilot/[id]',
  'race/[id]',
  'race/create',
  'rank/[id]',
  'settings/index',
  'settings/aide',
  'settings/cgu',
  'settings/compte',
  'settings/confidentialite',
  'settings/moderation',
  'settings/notifications',
  'settings/stats',
  'settings/supprimer',
];

export default function TabsLayout() {
  return (
    <Tabs
      // Sans ça, un navigateur d'onglets renvoie au PREMIER onglet sur
      // `router.back()` (backBehavior par défaut : firstRoute) : tous les
      // « ← » de l'app ramèneraient à Courses au lieu de l'écran précédent.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkDim2,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
        },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t.tabs.races, tabBarIcon: ({ color }) => <TabIcon name="races" color={color} /> }}
      />
      <Tabs.Screen
        name="classements"
        options={{ title: t.tabs.rankings, tabBarIcon: ({ color }) => <TabIcon name="rankings" color={color} /> }}
      />
      <Tabs.Screen
        name="amis"
        options={{ title: t.tabs.friends, tabBarIcon: ({ color }) => <TabIcon name="friends" color={color} /> }}
      />
      <Tabs.Screen
        name="kartings"
        options={{ title: t.tabs.tracks, tabBarIcon: ({ color }) => <TabIcon name="tracks" color={color} /> }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: t.tabs.profile, tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} /> }}
      />
      {ECRANS_SANS_ONGLET.map((name) => (
        <Tabs.Screen key={name} name={name} options={{ href: null }} />
      ))}
    </Tabs>
  );
}
