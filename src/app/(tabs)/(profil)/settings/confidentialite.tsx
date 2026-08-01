import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BoutonRetour } from '@/components/ui';
import { Body, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/** Politique de confidentialité (page légale publique, accessible à l'inscription). */
export default function ConfidentialiteScreen() {
  const router = useRouter();
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <BoutonRetour onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings/aide'))} />
        <Title>{t.help.privacy}</Title>
        <Muted>{t.help.lastUpdated}</Muted>
        {t.help.privacyBody.map((p, i) => (
          <Body key={i} style={styles.para}>
            {p}
          </Body>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxl * 2 },
  para: { lineHeight: 22 },
});
