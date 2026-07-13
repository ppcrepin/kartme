import { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckeredRule } from '@/components/ui';
import { Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';

/**
 * Conteneur d'écran commun : fond carbone, marges, filet damier + titre.
 */
export function Screen({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        <View style={styles.rule}>
          <CheckeredRule cells={10} />
        </View>
        <Title>{title}</Title>
        {children}
      </View>
    </SafeAreaView>
  );
}

// Muted reste disponible depuis les écrans existants.
export { Muted } from '@/components/ui/text';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.lg, gap: spacing.md },
  rule: { width: 64 },
});
