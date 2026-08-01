import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';
import { CARREAUX_DAMIER, CREUX_DAMIER, RANGS_DAMIER } from '@/lib/marque';

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
    <View style={styles.bloc} accessibilityElementsHidden importantForAccessibility="no">
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
  row: { flexDirection: 'row', height: 5 },
  cell: { flex: 1, height: '100%' },
});
