import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, fonts } from '@/constants/theme';
import { t } from '@/i18n';
import { useExplications } from '@/lib/explications';
import type { Grade } from '@/lib/grade';

// L'apex (Légende, rouge de marque) porte un texte blanc ; les autres teintes
// (pierre → orange) sont assez claires pour un texte carbone.
function inkOn(grade: Grade): string {
  return grade.key === 'legende' ? '#ffffff' : colors.bg;
}

/**
 * Médaillon de grade. Affiche le monogramme (stand-in avant l'icône
 * définitive). La couleur vient de la rampe pierre → rouge.
 *
 * `explicable` le rend TAPABLE : il ouvre alors la fiche du grade (ce qu'il
 * vaut, où l'on en est, l'échelle entière). L'option est explicite, et non
 * automatique, parce que le médaillon apparaît aussi DANS des lignes déjà
 * tapables — classement, grille de course, liste d'amis. Un bouton dans un
 * bouton y aurait volé le tap qui ouvre la fiche du pilote, c'est-à-dire
 * exactement l'affordance qu'un testeur cherchait sans la trouver.
 */
export function GradeMedal({
  grade,
  size = 52,
  explicable = false,
  elo,
}: {
  grade: Grade;
  size?: number;
  explicable?: boolean;
  /** Situe le pilote dans le grade (« encore 90 points avant… »). */
  elo?: number | null;
}) {
  const explications = useExplications();
  const dim = { width: size, height: size, borderRadius: size * 0.23 };
  const aplat = (
    <View
      accessibilityLabel={explicable && explications ? undefined : grade.name}
      style={[styles.medal, dim, { backgroundColor: grade.color }]}>
      <Text style={[styles.monogram, { color: inkOn(grade), fontSize: size * 0.34 }]}>
        {grade.monogram}
      </Text>
    </View>
  );

  // Hors fournisseur (galerie de composants, test unitaire) le médaillon reste
  // un aplat : un bouton qui n'ouvre rien vaut moins que pas de bouton.
  if (!explicable || !explications) return aplat;

  return (
    <Pressable
      onPress={() => explications.expliquerGrade(grade, elo)}
      accessibilityRole="button"
      accessibilityLabel={t.explications.gradeAria.replace('%g', grade.name)}
      // 44 px de zone minimum : `hitSlop` est inerte sur `Pressable` en
      // react-native-web, la taille réelle est le seul levier.
      style={[styles.zone, { minWidth: Math.max(44, size), minHeight: Math.max(44, size) }]}>
      {aplat}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  medal: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  zone: { alignItems: 'center', justifyContent: 'center' },
  monogram: { fontFamily: fonts.serifBlack, letterSpacing: 0.5 },
});
