import type { Circuit } from '@/lib/races';

/**
 * Passage de témoin entre la carte plein écran et le formulaire de création.
 *
 * Le formulaire est encore monté sous l'écran de carte : lui renvoyer le
 * circuit par paramètre d'URL le ferait REMONTER — et perdre la date déjà
 * saisie, ce qui est précisément la friction qu'on corrige. Un dépôt à usage
 * unique suffit : la carte dépose, le formulaire ramasse au retour de focus.
 *
 * `take` CONSOMME la valeur : un second appel rend null. Sans cela, un vieux
 * choix ressurgirait dans la prochaine création de course.
 */
let picked: Circuit | null = null;

export function setPickedCircuit(c: Circuit): void {
  picked = c;
}

export function takePickedCircuit(): Circuit | null {
  const c = picked;
  picked = null;
  return c;
}
