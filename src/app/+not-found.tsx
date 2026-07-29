import { useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/**
 * URL inconnue : sans cet écran, expo-router affiche son « Unmatched Route »
 * anglophone, hors charte. Un lien d'invitation mal recopié doit atterrir
 * sur un écran de l'app, en français, avec une sortie claire.
 */
export default function NotFoundScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Title>{t.notFound.title}</Title>
        <Muted style={styles.body}>{t.notFound.body}</Muted>
        <Button label={t.notFound.home} onPress={() => router.replace('/')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, justifyContent: 'center', padding: spacing.lg, gap: spacing.lg },
  body: { lineHeight: 20 },
});
