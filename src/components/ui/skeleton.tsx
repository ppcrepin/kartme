import { DimensionValue, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius as tokens, spacing } from '@/constants/theme';

/** Barre de chargement neutre (skeleton). Statique : robuste, sans animation. */
export function Skeleton({
  height = 16,
  width = '100%',
  style,
}: {
  height?: number;
  width?: DimensionValue;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.bar, { height, width }, style]} />;
}

/** Carte-squelette générique (quelques barres) pour les écrans en chargement. */
export function SkeletonCard() {
  return (
    <View style={styles.card}>
      <Skeleton height={22} width="55%" />
      <Skeleton height={36} width="35%" />
      <Skeleton height={12} width="80%" />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.surface2, borderRadius: 8 },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: tokens.card,
    padding: spacing.lg,
    gap: spacing.md,
  },
});
