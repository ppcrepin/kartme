import { ReactNode, useEffect, useState } from 'react';
import { Animated, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';
import { Heading } from '@/components/ui/text';

/**
 * Feuille qui monte du bas (décision PO 2026-07-30, audit A17).
 *
 * Héberge les sections « on s'en sert une fois par course » — les trois
 * façons d'ajouter un pilote, le partage QR — qui occupaient ~900 px en
 * permanence dans le flux de l'écran de course. Un Modal transparent plutôt
 * qu'une vue absolue : il passe PAR-DESSUS la barre d'onglets et intercepte
 * le fond, sans dépendre de la hiérarchie de l'écran appelant.
 *
 * Fermeture : tap sur le voile, ou la poignée. La feuille plafonne à 85 % de
 * l'écran et défile à l'intérieur si son contenu déborde.
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
  // PAS useAnimatedValue : le hook n'existe pas dans react-native-web (écran
  // rouge attrapé par l'audit navigateur — il plantait TOUTES les vues de
  // course). Un initialiseur d'état donne la même valeur stable sans lire de
  // ref au rendu (contrainte du lint).
  const [glisse] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!open) return;
    glisse.setValue(0);
    Animated.timing(glisse, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [open, glisse]);

  if (!open) return null;

  const translateY = glisse.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });

  return (
    <Modal transparent visible animationType="none" onRequestClose={onClose}>
      <View style={styles.voileZone}>
        {/* Le voile ferme au tap mais n'est PAS annoncé comme un bouton : la
            poignée ci-dessous est la commande de fermeture, et deux boutons
            « Fermer » identiques dans la même vue sont une gêne pour un lecteur
            d'écran autant qu'une ambiguïté pour un test — `getByLabel('Fermer')`
            en trouvait deux, et le premier dans l'ordre du DOM était ce voile
            plein écran, dont le centre est RECOUVERT par une feuille haute.
            D'où un clic parfois intercepté, donc un test instable. */}
        <Pressable style={styles.voile} onPress={onClose} />
        <Animated.View style={[styles.feuille, { transform: [{ translateY }] }]}>
          {/* Zone tapable de 44 px : `hitSlop` seul ne fait rien sur web, la
              poignée ne mesurait que 13 px de haut. */}
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  voileZone: { flex: 1, justifyContent: 'flex-end' },
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
