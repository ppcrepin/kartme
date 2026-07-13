import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen, Muted } from '@/components/screen';
import { Button } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { t } from '@/i18n';

export default function ProfilScreen() {
  const router = useRouter();
  return (
    <Screen title={t.tabs.profile}>
      <Muted>{t.screens.profileSubtitle}</Muted>
      <View style={{ marginTop: spacing.md, alignItems: 'flex-start' }}>
        <Button label={t.gallery.open} variant="ghost" onPress={() => router.push('/design-system')} />
      </View>
    </Screen>
  );
}
