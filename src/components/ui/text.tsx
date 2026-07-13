import { ReactNode } from 'react';
import { StyleSheet, Text, TextProps } from 'react-native';

import { colors, fonts } from '@/constants/theme';

/**
 * Typographie : titres en Fraunces (serif d'affichage), texte courant en
 * sans-serif système. Pairing display serif + utilitaire sans-serif.
 */

type Props = TextProps & { children: ReactNode };

/** Gros titre d'écran (Fraunces Black). */
export function Title({ children, style, ...rest }: Props) {
  return (
    <Text style={[styles.title, style]} {...rest}>
      {children}
    </Text>
  );
}

/** Titre de section / carte (Fraunces Bold). */
export function Heading({ children, style, ...rest }: Props) {
  return (
    <Text style={[styles.heading, style]} {...rest}>
      {children}
    </Text>
  );
}

/** Texte courant. */
export function Body({ children, style, ...rest }: Props) {
  return (
    <Text style={[styles.body, style]} {...rest}>
      {children}
    </Text>
  );
}

/** Texte secondaire discret. */
export function Muted({ children, style, ...rest }: Props) {
  return (
    <Text style={[styles.muted, style]} {...rest}>
      {children}
    </Text>
  );
}

/** Étiquette en petites capitales espacées. */
export function Label({ children, style, ...rest }: Props) {
  return (
    <Text style={[styles.label, style]} {...rest}>
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.ink, fontFamily: fonts.serifBlack, fontSize: 30, lineHeight: 34, letterSpacing: -0.3 },
  heading: { color: colors.ink, fontFamily: fonts.serif, fontSize: 18, lineHeight: 22 },
  body: { color: colors.ink, fontFamily: fonts.sans, fontSize: 15, lineHeight: 21 },
  muted: { color: colors.inkDim, fontFamily: fonts.sans, fontSize: 13, lineHeight: 19 },
  label: {
    color: colors.inkDim2,
    fontFamily: fonts.sans,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
});
