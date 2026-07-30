import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { CheckeredRule } from '@/components/ui';
import { Muted, Title } from '@/components/ui/text';
import { colors, spacing } from '@/constants/theme';

/**
 * Conteneur d'écran commun : fond carbone, marges, filet damier + titre.
 */
export function Screen({
  title,
  headerAction,
  onBack,
  children,
}: {
  title: string;
  headerAction?: ReactNode;
  /**
   * Écrans HORS onglets : sans ce retour, la pile est un cul-de-sac en PWA
   * installée et en natif (le Stack global tourne avec `headerShown: false`).
   * Les écrans d'onglet, eux, ne le passent pas — ils n'ont nulle part où revenir.
   */
  onBack?: () => void;
  children?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.body}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel="Retour"
            hitSlop={10}
            style={styles.back}>
            <Muted>←</Muted>
          </Pressable>
        ) : null}
        {/* En-tête compact (audit A17, décision PO) : le filet damier vit À
            CÔTÉ du titre, plus au-dessus, et le titre descend de 30 à 23 px —
            ~55 px rendus au contenu sur chaque écran, signature préservée. */}
        <View style={styles.titleRow}>
          <Title style={styles.titleCompact}>{title}</Title>
          <View style={styles.rule}>
            <CheckeredRule cells={8} />
          </View>
          <View style={styles.spacer} />
          {headerAction}
        </View>
        {children}
      </View>
    </SafeAreaView>
  );
}

// Muted reste disponible depuis les écrans existants.
export { Muted } from '@/components/ui/text';

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  body: { flex: 1, paddingHorizontal: spacing.lg, paddingTop: spacing.md, gap: spacing.md },
  back: { alignSelf: 'flex-start', paddingVertical: 2 },
  rule: { width: 48, marginLeft: spacing.sm, flexShrink: 0 },
  spacer: { flex: 1 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  titleCompact: { fontSize: 23, lineHeight: 27, flexShrink: 1 },
});
