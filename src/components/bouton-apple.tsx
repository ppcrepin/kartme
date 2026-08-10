import * as AppleAuthentication from 'expo-apple-authentication';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';


/**
 * « Se connecter avec Apple » (iOS).
 *
 * Le composant vient d'Apple et NON de notre bibliothèque : leurs règles
 * d'interface l'imposent — libellé, logo, proportions et rayon de coin sont
 * verrouillés, et un bouton maison est un motif de refus à la revue.
 *
 * `isAvailableAsync` plutôt qu'un simple test de plateforme : la connexion
 * Apple n'existe pas avant iOS 13. Sur un appareil trop ancien, le bouton
 * disparaît au lieu d'échouer sous le doigt.
 *
 * Le pendant web (`bouton-apple.web.tsx`) ne rend rien : la règle 4.8 ne vise
 * que l'application iOS, et le flux web demanderait un Service ID et une clé
 * de plus à maintenir pour zéro obligation.
 */
export function BoutonApple({ onPress, disabled }: { onPress: () => void; disabled?: boolean }) {
  const [dispo, setDispo] = useState(false);

  useEffect(() => {
    let vivant = true;
    if (Platform.OS !== 'ios') return;
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (vivant) setDispo(ok);
      })
      .catch(() => {});
    return () => {
      vivant = false;
    };
  }, []);

  if (!dispo) return null;

  return (
    <AppleAuthentication.AppleAuthenticationButton
      buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
      // Le fond de l'application est carbone : le bouton BLANC est le seul des
      // trois styles d'Apple qui s'y détache. Le noir s'y fondrait.
      buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.WHITE}
      // 24 et non `radius.pill` (999) : la valeur est transmise telle quelle
      // à `ASAuthorizationAppleIDButton.cornerRadius`, et rien ne garantit
      // qu'Apple l'écrête à la moitié de la hauteur. 24 = la moitié de 48,
      // donc visuellement identique, sans pari.
      cornerRadius={24}
      style={[styles.bouton, disabled && styles.eteint]}
      // `AppleAuthenticationButton` n'a PAS de prop `disabled` (vérifié dans
      // le module : il ne relaie que `onPress`). Un gestionnaire vide laissait
      // VoiceOver annoncer « bouton », l'activer, et ne rien produire — ni
      // retour, ni annonce. On le retire vraiment de l'arbre interactif.
      pointerEvents={disabled ? 'none' : 'auto'}
      accessibilityElementsHidden={disabled}
      importantForAccessibility={disabled ? 'no-hide-descendants' : 'auto'}
      onPress={onPress}
    />
  );
}

const styles = StyleSheet.create({
  // 48 px : la hauteur des autres boutons de l'écran. Les règles d'Apple
  // demandent que ce bouton ne soit pas moins visible que les autres moyens
  // de connexion — même hauteur, même largeur, même place dans la pile.
  bouton: { width: '100%', height: 48 },
  eteint: { opacity: 0.5 },
});
