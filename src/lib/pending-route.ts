/**
 * Mémorise la destination visée par un lien profond (ex. /race/abc) quand un
 * visiteur déconnecté est renvoyé vers la connexion, pour l'y ramener une fois
 * inscrit/connecté. Sans ça, le canal d'acquisition n°1 (l'invitation) ne
 * convertit pas : l'invité atterrit sur l'accueil au lieu de la course.
 */
const KEY = 'ks_pending_route';

// Routes que l'on juge « partageables » et donc dignes d'être restaurées.
// `invite/` (A19) est LA raison d'être de ce mécanisme pour un nouveau venu :
// il arrive par un lien d'amitié, passe par l'inscription, et doit retomber
// sur l'invitation — sinon le lien ne convertit pas.
const SHAREABLE = /^(race|pilot|invite)\//;

export function rememberPendingRoute(path: string): void {
  if (!SHAREABLE.test(path)) return;
  try {
    window?.localStorage?.setItem(KEY, path);
  } catch {
    /* pas de storage : on ignore */
  }
}

/** Récupère ET efface la destination mémorisée (usage unique). */
export function takePendingRoute(): string | null {
  try {
    const v = window?.localStorage?.getItem(KEY) ?? null;
    if (v) window.localStorage.removeItem(KEY);
    return v && SHAREABLE.test(v) ? v : null;
  } catch {
    return null;
  }
}
