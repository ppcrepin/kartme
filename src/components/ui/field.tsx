import { useState } from 'react';
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';

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
  ...rest
}: TextInputProps & { label?: string; error?: string | null }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      {label ? <Text style={styles.label}>{label}</Text> : null}
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
          style,
        ]}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...rest}
      />
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
  focused: { borderColor: colors.accent },
  errored: { borderColor: states.err },
  error: { color: states.err, fontFamily: fonts.sans, fontSize: 12 },
});
