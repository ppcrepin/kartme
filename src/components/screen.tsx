import { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, fonts, spacing } from '@/constants/theme';

/**
 * Conteneur d'écran commun : fond carbone, marges, titre serif.
 * Squelette du lot 0.1 — le design system complet arrive au lot 0.2.
 */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

export function Muted({ children }: { children: ReactNode }) {
  return <Text style={styles.muted}>{children}</Text>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.sm },
  title: { color: colors.ink, fontFamily: fonts.serif, fontSize: 26, fontWeight: '800' },
  muted: { color: colors.inkDim, fontSize: 14, lineHeight: 20 },
});
