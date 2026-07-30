import { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, spacing } from '@/constants/theme';
import { Body, Muted } from '@/components/ui/text';

/**
 * Ligne compacte de liste — le socle de densité de l'audit UX (A17).
 *
 * Les listes en « cartes » coûtaient 82 px par pilote : à 8 inscrits, la
 * grille remplissait l'écran à elle seule. Ici : 44 px par ligne (le minimum
 * tapable iPhone), UN SEUL cadre autour de la liste (la Card englobante),
 * des filets fins entre les lignes. Le look assumé est « tableau de résultats
 * de Grand Prix », pas « cartes empilées » — décision PO 2026-07-30.
 *
 * `first` supprime le filet du haut : la Card englobante fait déjà le cadre.
 */
export function ListRow({
  left,
  title,
  sub,
  right,
  onPress,
  first = false,
  accessibilityLabel,
}: {
  /** Colonne de gauche : avatar, rang, médaille… */
  left?: ReactNode;
  title: ReactNode;
  /** Ligne secondaire optionnelle — l'éviter quand une seule ligne suffit. */
  sub?: ReactNode;
  /** Colonne de droite : Elo, chrono, chevron, action… */
  right?: ReactNode;
  onPress?: () => void;
  first?: boolean;
  accessibilityLabel?: string;
}) {
  const contenu = (
    <>
      {left ? <View style={styles.left}>{left}</View> : null}
      <View style={styles.milieu}>
        {typeof title === 'string' ? <Body style={styles.titre} numberOfLines={1}>{title}</Body> : title}
        {sub ? (
          typeof sub === 'string' ? <Muted style={styles.sous} numberOfLines={1}>{sub}</Muted> : sub
        ) : null}
      </View>
      {right ? <View style={styles.right}>{right}</View> : null}
    </>
  );
  const style = [styles.ligne, !first && styles.filet];
  if (!onPress) return <View style={style}>{contenu}</View>;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [...style, pressed && styles.presse]}>
      {contenu}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  ligne: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 44,
    paddingVertical: spacing.xs,
  },
  filet: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.line2 },
  presse: { opacity: 0.7 },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  milieu: { flex: 1, justifyContent: 'center' },
  titre: { fontSize: 14, lineHeight: 18, fontWeight: '600' },
  sous: { fontSize: 11, lineHeight: 14 },
  right: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
