import { useRouter } from 'expo-router';
import { View } from 'react-native';

import { Screen, Muted } from '@/components/screen';
import { Button } from '@/components/ui';
import { spacing } from '@/constants/theme';
import { t } from '@/i18n';
import { useAuth } from '@/lib/auth';

export default function ProfilScreen() {
  const router = useRouter();
  const { session, signOut } = useAuth();

  return (
    <Screen title={t.tabs.profile}>
      <Muted>{t.screens.profileSubtitle}</Muted>
      {session?.user.email ? <Muted>{session.user.email}</Muted> : null}
      <View style={{ marginTop: spacing.md, gap: spacing.sm, alignItems: 'flex-start' }}>
        <Button label={t.gallery.open} variant="ghost" onPress={() => router.push('/design-system')} />
        <Button label={t.auth.signOut} variant="ghost" onPress={signOut} />
      </View>
    </Screen>
  );
}
