/**
 * Pendant web de `bouton-apple` : rien.
 *
 * La règle 4.8 de l'App Store ne vise que l'application iOS. Proposer la
 * connexion Apple sur le web exigerait un Service ID, une clé privée et un
 * domaine vérifié de plus à maintenir — pour aucune obligation, et sur une
 * plateforme où le pilote a déjà Google et l'e-mail sous la main.
 */
export function BoutonApple(_props: { onPress: () => void; disabled?: boolean }) {
  return null;
}
