import { StyleSheet, View } from 'react-native';

import { colors, radius } from '@/constants/theme';

/**
 * Teinte un hexadécimal `#rrggbb`. Sert à annoncer le grade SUIVANT sur la
 * part vide de la jauge sans la faire passer pour déjà gagnée. Une valeur
 * inattendue est renvoyée telle quelle plutôt que de casser le rendu.
 */
function avecAlpha(hex: string, alpha: number): string | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex);
  // `null`, et surtout PAS `hex` : rendre la couleur brute peindrait la piste
  // en opacité pleine, donc une jauge qui paraît remplie à 100 % — l'exact
  // contraire de ce qu'elle mesure. Le repli sûr est la piste par défaut.
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

/**
 * Jauge de progression (ex. vers le grade suivant). Valeur bornée 0–1.
 * Couleur de remplissage libre (par défaut le rouge de marque).
 *
 * `couleurSuivante` peint la part RESTANTE dans la couleur du grade d'après,
 * en sourdine : la jauge cessait de dire vers quoi elle montait, et un testeur
 * l'a signalé — « il manque des repères » (2026-08-01). Une teinte à 22 %
 * montre la destination sans laisser croire qu'elle est atteinte.
 */
export function Gauge({
  value,
  color = colors.accent,
  couleurSuivante,
}: {
  value: number;
  color?: string;
  couleurSuivante?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const piste = couleurSuivante ? avecAlpha(couleurSuivante, 0.22) : null;
  return (
    <View
      style={[styles.track, piste ? { backgroundColor: piste } : null]}
      accessibilityRole="progressbar"
      accessibilityValue={{ now: Math.round(pct), min: 0, max: 100 }}>
      <View style={[styles.fill, { width: `${pct}%`, backgroundColor: color }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    height: 12,
    borderRadius: radius.pill,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line2,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
});
