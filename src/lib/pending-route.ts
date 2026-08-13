/**
 * Mémorise la destination visée par un lien profond (ex. /race/abc) quand un
 * visiteur déconnecté est renvoyé vers la connexion, pour l'y ramener une fois
 * inscrit/connecté. Sans ça, le canal d'acquisition n°1 (l'invitation) ne
 * convertit pas : l'invité atterrit sur l'accueil au lieu de la course.
 */
import { ecrireLocal, effacerLocal, lireLocal } from '@/lib/stockage-local';

const KEY = 'ks_pending_route';

// Routes que l'on juge « partageables » et donc dignes d'être restaurées.
// `invite/` (A19) est LA raison d'être de ce mécanisme pour un nouveau venu :
// il arrive par un lien d'amitié, passe par l'inscription, et doit retomber
// sur l'invitation — sinon le lien ne convertit pas.
const SHAREABLE = /^(race|pilot|invite)\//;

export function rememberPendingRoute(path: string): void {
  if (!SHAREABLE.test(path)) return;
  ecrireLocal(KEY, path);
}

/**
 * Lit la destination mémorisée SANS l'effacer.
 *
 * Sert aux écrans d'authentification : quelqu'un qui arrive par un lien d'ami
 * doit voir qu'une invitation l'attend pendant qu'il crée son compte. La
 * consommer là ferait perdre la destination — c'est `takePendingRoute` qui
 * l'efface, et seulement une fois le pilote connecté ET profilé.
 */
export function peekPendingRoute(): string | null {
  const v = lireLocal(KEY);
  return v && SHAREABLE.test(v) ? v : null;
}

/** Vrai si la destination mémorisée est une INVITATION d'ami. */
export function hasPendingInvite(): boolean {
  return (peekPendingRoute() ?? '').startsWith('invite/');
}

/** Récupère ET efface la destination mémorisée (usage unique). */
export function takePendingRoute(): string | null {
  const v = lireLocal(KEY);
  if (v) effacerLocal(KEY);
  return v && SHAREABLE.test(v) ? v : null;
}
