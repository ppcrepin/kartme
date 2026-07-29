import { Tabs } from 'expo-router';

import { TabIcon } from '@/components/tab-icon';
import { colors } from '@/constants/theme';
import { t } from '@/i18n';

/**
 * Les 5 onglets, chacun portant sa propre pile d'écrans (décision PO
 * 2026-07-30 : la barre d'onglets reste visible partout, pour se promener
 * d'une section à l'autre sans enchaîner les « précédent »). Les groupes ne
 * changent aucune URL ; les écrans de détail vivent dans la pile de leur
 * section et gardent leur cycle de vie normal (montage neuf à chaque visite).
 */
export default function TabsLayout() {
  return (
    <Tabs
      // Sans ça, un navigateur d'onglets renvoie au PREMIER onglet sur
      // `router.back()` (backBehavior par défaut : firstRoute) : un « ← »
      // après un saut d'onglet ramènerait à Courses au lieu de l'écran
      // précédent.
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkDim2,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.line,
        },
        // 10 px : à 11 px, « Classement » (72 px) débordait des 68 px que le
        // bouton d'onglet laisse au libellé sur un iPhone de 390 px —
        // tronqué en « Classem… ». Le padding du bouton est codé en dur dans
        // expo-router, la taille de police est le seul levier fiable.
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="(courses)"
        options={{ title: t.tabs.races, tabBarIcon: ({ color }) => <TabIcon name="races" color={color} /> }}
      />
      <Tabs.Screen
        name="(classements)"
        options={{ title: t.tabs.rankings, tabBarIcon: ({ color }) => <TabIcon name="rankings" color={color} /> }}
      />
      <Tabs.Screen
        name="(amis)"
        options={{ title: t.tabs.friends, tabBarIcon: ({ color }) => <TabIcon name="friends" color={color} /> }}
      />
      <Tabs.Screen
        name="(kartings)"
        options={{ title: t.tabs.tracks, tabBarIcon: ({ color }) => <TabIcon name="tracks" color={color} /> }}
      />
      <Tabs.Screen
        name="(profil)"
        options={{ title: t.tabs.profile, tabBarIcon: ({ color }) => <TabIcon name="profile" color={color} /> }}
      />
    </Tabs>
  );
}
