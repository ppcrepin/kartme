/**
 * Préférences d'usage, mémorisées localement (pas en base : elles n'engagent
 * que l'appareil et ne valent pas un aller-retour réseau).
 *
 * Née du premier retour de test réel (2026-07-30) : le glisser-déposer n'était
 * pas intuitif. Un mode « toucher dans l'ordre » existait pourtant déjà — mais
 * on y accédait par un lien gris SOUS la liste des pilotes, donc hors écran à
 * six ou huit noms, au moment précis où l'on galère.
 *
 * Le geste de saisie est maintenant un choix explicite, et il se mémorise :
 * quelqu'un qui a tranché ne doit pas revoir la question à chaque course.
 */
const CLE_MODE = 'ks_mode_saisie';

export type ModeSaisie = 'drag' | 'tap';

function stockage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

/**
 * Le mode à ouvrir. Défaut : `tap`.
 *
 * Le glisser sur une liste tactile suppose un appui long que rien n'annonce ;
 * « touche les pilotes dans l'ordre d'arrivée » se comprend sans explication,
 * avec un numéro qui apparaît à chaque tap. On garde le glisser à un tap pour
 * ceux qui le préfèrent — ils ne le rechoisissent qu'une fois.
 */
export function modePrefere(): ModeSaisie {
  return stockage()?.getItem(CLE_MODE) === 'drag' ? 'drag' : 'tap';
}

export function memoriserMode(mode: ModeSaisie): void {
  try {
    stockage()?.setItem(CLE_MODE, mode);
  } catch {
    /* pas de storage (navigation privée) : on garde le défaut */
  }
}
