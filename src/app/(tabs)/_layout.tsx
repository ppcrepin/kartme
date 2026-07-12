import { Tabs } from 'expo-router';

import { TabIcon } from '@/components/tab-icon';
import { colors } from '@/constants/theme';

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
        options={{ title: 'Courses', tabBarIcon: ({ color }) => <TabIcon color={color} /> }}
      />
      <Tabs.Screen
        name="classements"
        options={{ title: 'Classements', tabBarIcon: ({ color }) => <TabIcon color={color} /> }}
      />
      <Tabs.Screen
        name="amis"
        options={{ title: 'Amis', tabBarIcon: ({ color }) => <TabIcon color={color} /> }}
      />
      <Tabs.Screen
        name="profil"
        options={{ title: 'Profil', tabBarIcon: ({ color }) => <TabIcon color={color} /> }}
      />
    </Tabs>
  );
}
