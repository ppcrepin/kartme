/**
 * Mémorise la destination visée par un lien profond (ex. /race/abc) quand un
 * visiteur déconnecté est renvoyé vers la connexion, pour l'y ramener une fois
 * inscrit/connecté. Sans ça, le canal d'acquisition n°1 (l'invitation) ne
 * convertit pas : l'invité atterrit sur l'accueil au lieu de la course.
 */
const KEY = 'ks_pending_route';

// Routes que l'on juge « partageables » et donc dignes d'être restaurées.
const SHAREABLE = /^(race|pilot)\//;

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
