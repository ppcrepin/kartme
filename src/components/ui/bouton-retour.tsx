import { Pressable, StyleSheet } from 'react-native';

import { Muted } from '@/components/ui/text';
import { spacing } from '@/constants/theme';

/**
 * Le « ← » des écrans de détail.
 *
 * Ce style était copié-collé à l'identique dans DOUZE écrans, toujours avec le
 * même défaut : `hitSlop={10}` — inerte sur `Pressable` en react-native-web —
 * et une zone réelle de 13 × 27 px. Chaque audit navigateur en retrouvait un ou
 * deux ; les corriger un à un ne pouvait pas rattraper la copie suivante.
 *
 * Un composant, une fois. `Screen` porte déjà la même parade pour les écrans
 * qui passent par lui (`onBack`) ; celui-ci sert aux écrans qui gèrent leur
 * propre `SafeAreaView`.
 *
 * La marge négative n'est pas cosmétique : sans elle, la zone de 44 px écarte
 * le titre du bord de l'écran et l'aligne différemment d'un écran à l'autre.
 */
export function BoutonRetour({ onPress, label }: { onPress: () => void; label?: string }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      // Le nom accessible reprend le libellé VISIBLE quand il y en a un
      // (WCAG 2.5.3) : « ← Courses » doit s'atteindre en disant « Courses ».
      accessibilityLabel={label ? `Retour · ${label}` : 'Retour'}
      style={styles.zone}>
      <Muted>{label ? `← ${label}` : '←'}</Muted>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  zone: {
    alignSelf: 'flex-start',
    minWidth: 44,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.sm,
    marginLeft: -spacing.sm,
    marginBottom: -spacing.sm,
  },
});
