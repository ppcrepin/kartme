import { ReactNode } from 'react';
import { StyleSheet, View, ViewProps } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

/** Carte : surface sur fond carbone, bordure discrète, angles doux. */
export function Card({ children, style, ...rest }: ViewProps & { children: ReactNode }) {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.line,
    borderWidth: 1,
    borderRadius: radius.card,
    // 12 et non 16 : l'audit A17 a mesuré que le rembourrage des cartes
    // comptait pour ~10 % de la hauteur des écrans de listes.
    padding: spacing.md,
  },
});
