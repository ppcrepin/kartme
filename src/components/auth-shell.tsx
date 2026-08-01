import { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckeredRule } from '@/components/ui';
import { Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';
import { t } from '@/i18n';

/** Conteneur commun des écrans d'authentification : marque + titre + formulaire. */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <View style={styles.rule}>
              <CheckeredRule cells={10} />
            </View>
            <Muted style={styles.brand}>{t.app.name.toUpperCase()}</Muted>
            <Title>{title}</Title>
            {subtitle ? <Muted style={styles.subtitle}>{subtitle}</Muted> : null}
          </View>
          <View style={styles.form}>{children}</View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.lg, paddingVertical: spacing.xxl, gap: spacing.xl },
  header: { gap: spacing.sm },
  rule: { width: 64 },
  brand: { letterSpacing: 3, fontWeight: '800', color: colors.accentTexte },
  subtitle: { fontSize: 15, lineHeight: 20 },
  form: { gap: spacing.md },
});
