import { StyleSheet, Text, TextInput, View } from 'react-native';

import { colors, fonts, radius, spacing } from '@/constants/theme';
import { LAP_SLOTS, lapMaskParts, onlyDigits } from '@/lib/laptime';

/**
 * Champ chrono à GABARIT (retour PO 2026-07-28).
 *
 * On ne tape que des chiffres : ils remplissent `m:ss.mmm` de gauche à droite,
 * et les emplacements pas encore saisis restent **en gris**. On voit d'un coup
 * d'œil où on en est, et il n'y a ni « : » ni « . » à viser sur un clavier de
 * téléphone, au bord d'une piste, entre deux courses.
 *
 * Le gabarit est un `Text` à deux couleurs — impossible dans un TextInput, qui
 * ne colore pas des morceaux de sa valeur. La saisie est donc captée par un
 * TextInput transparent posé par-dessus : c'est lui qui reçoit le clavier, le
 * collage et la touche retour ; le gabarit ne fait qu'afficher.
 */
export function LapField({
  label,
  digits,
  onChangeDigits,
  error,
}: {
  label: string;
  digits: string;
  onChangeDigits: (next: string) => void;
  error?: string | null;
}) {
  const parts = lapMaskParts(digits);

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, !!error && styles.errored]}>
        <Text style={styles.mask} allowFontScaling={false}>
          {parts.map((part, i) => (
            <Text key={i} style={part.filled ? styles.on : styles.off}>
              {part.char}
            </Text>
          ))}
        </Text>
        <TextInput
          value={digits}
          onChangeText={(text) => onChangeDigits(onlyDigits(text))}
          keyboardType="number-pad"
          inputMode="numeric"
          maxLength={LAP_SLOTS}
          accessibilityLabel={label}
          // Transparent : seul le gabarit se voit. Le curseur reste caché — la
          // progression se lit à la couleur, pas à la position d'un trait.
          style={styles.capture}
          caretHidden
          selectionColor="transparent"
        />
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    color: colors.inkDim2,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  box: {
    backgroundColor: colors.surface2,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    justifyContent: 'center',
  },
  errored: { borderColor: colors.accent },
  // `letterSpacing` fixe : le gabarit ne doit pas « danser » à chaque frappe.
  mask: { fontFamily: fonts.sans, fontSize: 20, letterSpacing: 2 },
  on: { color: colors.ink, fontWeight: '700' },
  off: { color: colors.inkDim2 },
  capture: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    color: 'transparent',
    fontSize: 20,
    paddingHorizontal: spacing.md,
  },
  error: { color: colors.accentTexte, fontFamily: fonts.sans, fontSize: 12 },
});
