import { Tabs } from 'expo-router';

import { TabIcon } from '@/components/tab-icon';
import { colors } from '@/constants/theme';
import { t } from '@/i18n';

export default function TabsLayout() {
  return (
    <Tabs
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
    </Tabs>
  );
}
