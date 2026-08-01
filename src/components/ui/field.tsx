import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

import { colors, fonts, radius, spacing, states } from '@/constants/theme';

/**
 * Champ de saisie étiqueté, avec message d'erreur optionnel. Sans `label`,
 * seul le placeholder porte l'intitulé (évite le doublon visuel quand les
 * deux diraient la même chose, ex. la recherche de kartings).
 */
export function Field({
  label,
  error,
  style,
  onClear,
  clearLabel,
  ...rest
}: TextInputProps & {
  label?: string;
  error?: string | null;
  /**
   * Vide le champ en UN geste. Sans elle, sortir d'une recherche demandait de
   * poser le curseur dans le champ, d'ouvrir le clavier et d'effacer caractère
   * par caractère — « c'est compliqué de revenir au classement, il faut faire
   * plusieurs étapes » (retour PO 2026-08-01). La croix n'apparaît que quand il
   * y a quelque chose à effacer : sinon elle promet une action sans effet.
   */
  onClear?: () => void;
  clearLabel?: string;
}) {
  const [focused, setFocused] = useState(false);
  const effacable = !!onClear && !!rest.value;
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View>
      <TextInput
        // L'étiquette n'était qu'un `Text` posé au-dessus : rien ne la reliait
        // au champ, donc un lecteur d'écran annonçait « champ de saisie » sans
        // dire lequel. Elle devient le NOM accessible du champ (placée avant
        // `...rest` : un `accessibilityLabel` explicite reste prioritaire).
        accessibilityLabel={label}
        placeholderTextColor={colors.inkDim2}
        selectionColor={colors.accent}
        style={[
          styles.input,
          focused && styles.focused,
          !!error && styles.errored,
          // La croix se pose PAR-DESSUS le champ : sans réserve à droite, le
          // texte saisi passait dessous.
          effacable && styles.avecCroix,
          style,
        ]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
      {effacable ? (
        <Pressable
          onPress={onClear}
          accessibilityRole="button"
          accessibilityLabel={clearLabel}
          style={styles.croix}
        >
          <Text style={styles.croixTexte}>✕</Text>
        </Pressable>
      ) : null}
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  label: {
    // `inkDim2` sur une carte donne 4,27:1 — sous le seuil AA de 4,5:1, à 11 px
    // et en capitales. `inkDim` monte à ~5,9:1 sans rien changer d'autre.
    color: colors.inkDim,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surface2,
    borderColor: colors.line2,
    borderWidth: 1,
    borderRadius: radius.card,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    color: colors.ink,
    fontFamily: fonts.sans,
    fontSize: 16,
  },
  // 44 px de côté : `hitSlop` n'est pas implémenté sur `Pressable` par
  // react-native-web, donc la vraie taille est le seul levier.
  croix: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  croixTexte: { color: colors.inkDim, fontFamily: fonts.sans, fontSize: 16 },
  avecCroix: { paddingRight: 44 },
  focused: { borderColor: colors.accent },
  errored: { borderColor: states.err },
  error: { color: states.err, fontFamily: fonts.sans, fontSize: 12 },
});
