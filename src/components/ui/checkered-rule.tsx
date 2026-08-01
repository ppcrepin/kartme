import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';
import { CARREAUX_DAMIER, CASE_DAMIER, CREUX_DAMIER, RANGS_DAMIER } from '@/lib/marque';

/**
 * Filet damier — le motif signature, en séparateur.
 *
 * DEUX rangs décalés depuis le 2026-08-01 (décision PO) : à un seul rang il se
 * lisait comme une ligne de pointillés — « un petit peu trop un logo fin sur
 * ligne droite qui fait penser à des petits pointillés sur lesquels on doit
 * cliquer ». Deux rangs donnent un vrai damier de drapeau.
 *
 * Le motif — nombre de rangs, teinte creuse — vient de `lib/marque`, comme
 * celui dessiné dans l'image de podium partagée : les deux étaient déjà
 * différents (un rang ici, deux là ; `#3a0f0c` ici, le fond carbone là), donc
 * l'image partagée ne ressemblait plus au filet de l'application.
 */
export function CheckeredRule({ cells = CARREAUX_DAMIER }: { cells?: number }) {
  return (
    // `aria-hidden` et NON `accessibilityElementsHidden` : react-native-web ne
    // connaît pas la propriété native et la relaie telle quelle au DOM, ce qui
    // fait japper React deux fois par filet monté — douze fois par page.
    <View style={styles.bloc} aria-hidden>
      {Array.from({ length: RANGS_DAMIER }).map((_, rang) => (
        <View key={rang} style={styles.row}>
          {Array.from({ length: cells }).map((_, i) => (
            <View
              key={i}
              style={[
                styles.cell,
                { backgroundColor: (i + rang) % 2 === 0 ? colors.accent : CREUX_DAMIER },
              ]}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bloc: { borderRadius: 2, overflow: 'hidden' },
  row: { flexDirection: 'row', height: CASE_DAMIER },
  // Cases CARRÉES, à taille fixe. En `flex: 1` elles s'étiraient à la largeur
  // disponible (6 × 5 ici, 6,4 × 5 là) : le filet paraissait tramé quand
  // l'icône, elle, a des cases carrées.
  cell: { width: CASE_DAMIER, height: CASE_DAMIER },
});
