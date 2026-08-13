import { Component, type ReactNode } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@/constants/theme';

/**
 * Garde-fou de rendu (troisième filet de la boîte noire).
 *
 * Une erreur levée PENDANT LE RENDU React ne passe ni par `ErrorUtils` ni,
 * si une frontière d'erreur existe, par `RN$handleException` : React la
 * remet à la frontière la plus proche. Sans frontière, l'arbre entier est
 * démonté et, en production native, le processus est abandonné — écran mort,
 * rapport .ips muet sur la cause. Vécu, builds 3 et 4.
 *
 * Ici : l'erreur est AFFICHÉE, message et pile, pour être photographiable.
 * C'est un écran de panne, pas une expérience — il n'a pas vocation à être
 * beau, il a vocation à parler.
 */
export class GardeErreur extends Component<
  { children: ReactNode },
  { erreur: Error | null }
> {
  state: { erreur: Error | null } = { erreur: null };

  static getDerivedStateFromError(erreur: Error) {
    return { erreur };
  }

  componentDidCatch(erreur: Error) {
    // La console est muette sur un iPhone sans Mac, mais si un Mac est un
    // jour branché, autant que la trace y soit.
    console.error('[garde-erreur] erreur de rendu :', erreur);
  }

  render() {
    const { erreur } = this.state;
    if (!erreur) return this.props.children;
    const pile = erreur.stack ? erreur.stack.split('\n').slice(0, 14).join('\n') : '';
    return (
      <ScrollView style={styles.fond} contentContainerStyle={styles.contenu}>
        <Text style={styles.titre}>L’application a rencontré une erreur</Text>
        <Text style={styles.message}>
          {erreur.name} : {erreur.message}
        </Text>
        {pile ? <Text style={styles.pile}>{pile}</Text> : null}
        <Text style={styles.consigne}>
          Photographie cet écran et envoie-le : il contient tout ce qu’il faut pour corriger.
        </Text>
      </ScrollView>
    );
  }
}

const styles = StyleSheet.create({
  fond: { flex: 1, backgroundColor: colors.bg },
  contenu: { padding: spacing.lg, paddingTop: 80, gap: spacing.md },
  titre: { color: colors.ink, fontSize: 20, fontWeight: '700' },
  message: { color: colors.accentTexte, fontSize: 15 },
  pile: {
    color: colors.inkDim,
    fontSize: 11,
    fontFamily: 'Courier',
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  consigne: { color: colors.inkDim, fontSize: 13 },
});
