import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';

import { Body } from '@/components/ui/text';
import { colors, couleurRang, fonts, radius } from '@/constants/theme';

/**
 * Le CHIFFRE d'un rang — en pastille pleine or, argent ou bronze sur le
 * podium, en chiffre nu au-delà (décision PO 2026-08-01 : « le premier en or,
 * deuxième en argent, troisième en bronze, dès qu'il y a un classement »).
 *
 * Pourquoi une PASTILLE et pas un chiffre coloré : la rampe des six grades est
 * elle-même métallique — « Roue libre » est bronze, « Rookie » argent,
 * « Missile » or, à quelques unités près des mêmes valeurs. Or le rang et le
 * nom du grade cohabitent SUR LA MÊME LIGNE, à quarante pixels l'un de
 * l'autre : un 3ᵉ de grade « Roue libre » aurait affiché deux bronzes
 * indiscernables, et un 2ᵉ « Rookie » deux fois exactement la même teinte.
 * Deux codes couleur pour deux choses différentes se seraient contredits.
 *
 * L'aplat les sépare par la FORME, pas par la nuance — et c'est déjà celle que
 * porte l'image de podium partagée, donc l'écran et l'image se ressemblent.
 *
 * La couleur ne porte jamais l'information seule : le chiffre reste écrit.
 */
export function RangNum({
  rang,
  dnf,
  dnfLabel,
  style,
  dnfStyle,
  taille = 22,
}: {
  rang: number;
  dnf?: boolean;
  dnfLabel?: string;
  /** Le style du chiffre HORS podium — chaque écran a le sien. */
  style?: StyleProp<TextStyle>;
  dnfStyle?: StyleProp<TextStyle>;
  /** Largeur de la pastille, alignée sur le `minWidth` du chiffre nu. */
  taille?: number;
}) {
  if (dnf) return <Body style={dnfStyle ?? style}>{dnfLabel}</Body>;
  const teinte = couleurRang(rang);
  if (!teinte) return <Body style={style}>{rang}</Body>;
  return (
    <View style={[styles.pastille, { backgroundColor: teinte, width: taille, height: taille }]}>
      {/* Texte carbone sur l'aplat : 6,2:1 sur le bronze, le plus juste des
          trois, et bien au-dessus sur l'or et l'argent. */}
      <Body style={[styles.chiffre, { fontSize: Math.round(taille * 0.62) }]}>{rang}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  pastille: { borderRadius: radius.sharp, alignItems: 'center', justifyContent: 'center' },
  chiffre: { fontFamily: fonts.serifBlack, color: colors.bg, lineHeight: undefined },
});
