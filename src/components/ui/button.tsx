import { Pressable, StyleSheet, Text } from 'react-native';

import { colors, fonts, radius, spacing } from '@/constants/theme';

type Variant = 'primary' | 'ghost';

/** Bouton pilule — action primaire (rouge de marque) ou secondaire (contour). */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled,
}: {
  label: string;
  onPress?: () => void;
  variant?: Variant;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      // `accessibilityState` n'est pas lu par react-native-web : seules les
      // props `aria-*` atteignent le DOM. C'est le composant de TOUS les
      // boutons — un « Valider » grisé n'était annoncé à personne, et un
      // lecteur d'écran n'a même pas la couleur pour compenser.
      aria-disabled={!!disabled}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : styles.ghost,
        pressed && styles.pressed,
        disabled && styles.disabled,
      ]}>
      <Text style={[styles.label, variant === 'primary' ? styles.labelPrimary : styles.labelGhost]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: radius.pill,
    // 44 px de HAUT au minimum : le plancher d'une zone tapable au doigt.
    // `paddingVertical: spacing.md - 2` donnait 39 px pour un label de 19 —
    // cinq de trop peu, sur TOUS les boutons de l'app. `minHeight` plutôt
    // qu'un padding plus généreux : un label qui passe sur deux lignes garde
    // sa hauteur naturelle au lieu de gagner 10 px de plus.
    minHeight: 44,
    paddingVertical: spacing.md - 2,
    paddingHorizontal: spacing.xl,
    borderWidth: 1.5,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: 'transparent', borderColor: colors.line2 },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.4 },
  label: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700' },
  labelPrimary: { color: '#ffffff' },
  labelGhost: { color: colors.ink },
});
