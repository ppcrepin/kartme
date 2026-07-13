import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/constants/theme';

/**
 * Jauge de progression (ex. vers le grade suivant). Valeur bornée 0–1.
 * Couleur de remplissage libre (par défaut le rouge de marque).
 */
export function Gauge({ value, color = colors.accent }: { value: number; color?: string }) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <View style={styles.track} accessibilityRole="progressbar" accessibilityValue={{ now: Math.round(pct), min: 0, max: 100 }}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line2,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
