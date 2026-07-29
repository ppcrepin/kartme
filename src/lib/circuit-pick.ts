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
/**
 * Durée de vie du dépôt. L'aller-retour légitime carte → formulaire prend
 * quelques secondes ; au-delà de deux minutes, c'est un choix ABANDONNÉ
 * (départ sur un lien profond, notification, session expirée) — sans cette
 * expiration, il ressurgissait silencieusement présélectionné dans la
 * prochaine création de course, sans aucun rapport avec elle.
 */
const TTL_MS = 2 * 60_000;

let picked: { c: Circuit; at: number } | null = null;

export function setPickedCircuit(c: Circuit): void {
  picked = { c, at: Date.now() };
}

export function takePickedCircuit(): Circuit | null {
  const d = picked;
  picked = null;
  if (!d || Date.now() - d.at > TTL_MS) return null;
  return d.c;
}
