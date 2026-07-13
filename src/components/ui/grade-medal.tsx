import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import type { Grade } from '@/lib/grade';

// L'apex (Légende, rouge de marque) porte un texte blanc ; les autres teintes
// (pierre → orange) sont assez claires pour un texte carbone.
function inkOn(grade: Grade): string {
  return grade.key === 'legende' ? '#ffffff' : colors.bg;
}

/**
 * Médaillon de grade. Affiche le monogramme (stand-in avant l'icône
 * définitive). La couleur vient de la rampe pierre → rouge.
 */
export function GradeMedal({ grade, size = 52 }: { grade: Grade; size?: number }) {
  const dim = { width: size, height: size, borderRadius: size * 0.23 };
  return (
    <View
      accessibilityLabel={grade.name}
      style={[styles.medal, dim, { backgroundColor: grade.color }]}>
      <Text style={[styles.monogram, { color: inkOn(grade), fontSize: size * 0.34 }]}>
        {grade.monogram}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  medal: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  monogram: { fontFamily: fonts.serifBlack, letterSpacing: 0.5 },
});
