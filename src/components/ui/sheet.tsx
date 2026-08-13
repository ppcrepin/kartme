import { ReactNode, useEffect, useRef, useState } from 'react';
import { Animated, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { Heading } from '@/components/ui/text';
import { effacerFeuille, publierFeuille } from '@/components/ui/portail-feuille';

/**
 * Feuille qui monte du bas — version NATIVE, SANS le `Modal` de React Native.
 *
 * L'implémentation d'origine (conservée telle quelle sur le web :
 * sheet.web.tsx) posait le contenu dans un `Modal` natif. Sur iOS, la
 * FERMETURE de ce Modal faisait renaître l'application entière : arbre React
 * neuf, session relue trop tôt, pilote éjecté vers l'écran de connexion —
 * les « déconnexions » des builds TestFlight 8 à 11, prouvées par le journal
 * de session N9 (renaissances sans le moindre rapport de plantage). Le
 * composant natif est donc simplement retiré du chemin.
 *
 * Ici, la feuille est une vue ordinaire, PUBLIÉE au portail de la racine
 * (portail-feuille) pour passer par-dessus la barre d'onglets — le service
 * que le Modal rendait. Même apparence, même geste, mêmes appelants :
 * `explications`, le profil, l'écran de course ne changent pas d'une ligne.
 */
export function Sheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  // Voir sheet.web.tsx : initialiseur d'état plutôt que useAnimatedValue.
  const [glisse] = useState(() => new Animated.Value(0));
  // Identité de CETTE feuille auprès du portail. L'écran de course monte
  // DEUX <Sheet> (partage, menu admin) : sans identité, la feuille fermée
  // qui se re-rendait effaçait celle qui venait de s'ouvrir — attrapé par
  // la relecture adversariale avant tout build.
  const moi = useRef<symbol | null>(null);
  if (moi.current === null) moi.current = Symbol('feuille');

  useEffect(() => {
    if (!open) return;
    glisse.setValue(0);
    Animated.timing(glisse, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [open, glisse]);

  // Publication à CHAQUE rendu tant que la feuille est ouverte : le contenu
  // (children) est vivant — la liste des pilotes s'y met à jour pendant
  // qu'elle est affichée — et le portail ne fait que le déplacer à la racine.
  useEffect(() => {
    if (!open) {
      // N'efface que SA propre publication : un Sheet fermé qui se re-rend
      // ne doit pas toucher à la feuille ouverte d'un autre.
      effacerFeuille(moi.current!);
      return;
    }
    const translateY = glisse.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
    publierFeuille(
      moi.current!,
      // `accessibilityViewIsModal` : ce que le Modal offrait aux lecteurs
      // d'écran (le fond devient inerte pour VoiceOver), redéclaré ici.
      <View style={styles.plein} accessibilityViewIsModal aria-label={title}>
        <Pressable style={styles.voile} onPress={onClose} />
        <Animated.View style={[styles.feuille, { transform: [{ translateY }] }]}>
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            hitSlop={10}
            style={styles.zonePoignee}>
            <View style={styles.poignee} />
          </Pressable>
          {title ? <Heading style={styles.titre}>{title}</Heading> : null}
          <ScrollView
            style={styles.corps}
            contentContainerStyle={styles.corpsContenu}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        </Animated.View>
      </View>,
    );
  });

  // Démontage de l'écran appelant (navigation pendant qu'une feuille est
  // ouverte) : la feuille ne doit pas survivre orpheline à la racine.
  useEffect(() => {
    const qui = moi.current!;
    return () => effacerFeuille(qui);
  }, []);

  return null;
}

const styles = StyleSheet.create({
  plein: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
    zIndex: 1000,
    elevation: 1000,
  },
  voile: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  feuille: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card * 2,
    borderTopRightRadius: radius.card * 2,
    borderColor: colors.line,
    borderWidth: 1,
    borderBottomWidth: 0,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    maxHeight: '85%',
  },
  zonePoignee: { minHeight: 44, justifyContent: 'center' },
  poignee: {
    alignSelf: 'center',
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.line2,
    marginBottom: spacing.sm,
  },
  titre: { marginBottom: spacing.sm },
  corps: { flexGrow: 0 },
  corpsContenu: { gap: spacing.md, paddingBottom: spacing.sm },
});
