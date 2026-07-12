import { ColorValue, View } from 'react-native';

/**
 * Icône d'onglet minimale (placeholder du shell).
 * Les icônes line-art définitives arrivent avec le design system (lot 0.2).
 */
export function TabIcon({ color }: { color: ColorValue }) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: color }}
    />
  );
}
