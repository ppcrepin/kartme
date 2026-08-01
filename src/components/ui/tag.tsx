import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius } from '@/constants/theme';

/** Tag / filtre — état sélectionné (rouge de marque) ou neutre (contour). */
export function Tag({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // `accessibilityState` n'est pas lu par react-native-web : seules les
      // props `aria-*` atteignent le DOM. Un état non annoncé, c'est une
      // sélection qui n'existe que dans la couleur.
      aria-selected={!!selected}
      style={[styles.base, selected ? styles.on : styles.off]}>
      <Text style={[styles.label, selected ? styles.labelOn : styles.labelOff]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.sharp,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderWidth: 1,
    // 44 px : ce composant porte les segments de CINQ écrans (À venir/Passées,
    // Classement/Chronos/Duels, Amis/Global, Carte/Liste). Ils plafonnaient
    // tous à 24 px de haut, et `hitSlop` est inerte sur web.
    minHeight: 44,
    justifyContent: 'center',
  },
  on: { backgroundColor: colors.accent, borderColor: colors.accent },
  off: { backgroundColor: 'transparent', borderColor: colors.line2 },
  label: { fontFamily: fonts.sans, fontSize: 12, fontWeight: '700' },
  labelOn: { color: '#ffffff' },
  labelOff: { color: colors.inkDim },
});
