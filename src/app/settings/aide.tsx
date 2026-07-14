import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Card } from '@/components/ui';
import { Body, Label, Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/** S4 — Aide & légal : FAQ + accès aux pages légales. */
export default function AideScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Pressable
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}
          accessibilityRole="button"
          style={styles.back}>
          <Muted>←</Muted>
        </Pressable>
        <Title>{t.help.title}</Title>

        <Label>{t.help.faqTitle}</Label>
        {t.help.faq.map((item) => (
          <Card key={item.q}>
            <Body style={styles.q}>{item.q}</Body>
            <Muted style={styles.a}>{item.a}</Muted>
          </Card>
        ))}

        <View style={styles.links}>
          <Pressable onPress={() => router.push('/settings/cgu')} accessibilityRole="button">
            <Card>
              <View style={styles.row}>
                <Body style={styles.flex}>{t.help.cgu}</Body>
                <Muted style={styles.chevron}>›</Muted>
              </View>
            </Card>
          </Pressable>
          <Pressable onPress={() => router.push('/settings/confidentialite')} accessibilityRole="button">
            <Card>
              <View style={styles.row}>
                <Body style={styles.flex}>{t.help.privacy}</Body>
                <Muted style={styles.chevron}>›</Muted>
              </View>
            </Card>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xxl * 2 },
  back: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
  q: { fontWeight: '800' },
  a: { marginTop: spacing.xs },
  links: { gap: spacing.sm, marginTop: spacing.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  flex: { flex: 1 },
  chevron: { fontSize: 20, color: colors.inkDim },
});
