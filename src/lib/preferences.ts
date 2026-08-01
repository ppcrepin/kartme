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

// ── Checklist « ta première course » ──────────────────────────────────────
const CLE_CHECKLIST = 'ks_checklist_masquee';

/**
 * On ne mémorise pas « masquée » mais l'AVANCEMENT au moment du masquage.
 *
 * Un simple booléen poserait un dilemme sans issue : la carte doit revenir
 * quand le pilote s'y met vraiment (décision PO), or si le retour dépend de
 * « une course existe », alors re-masquer après création la ferait
 * immédiatement revenir — une croix qui ne ferme rien.
 *
 * En retenant le palier, la règle devient simple et se raconte : tu l'as
 * chassée à 0/3, elle revient quand tu atteins 1/3. Tu la rechasses à 1/3,
 * elle revient à 2/3. Elle ne repasse jamais deux fois au même endroit.
 */
export function checklistMasqueeA(): number | null {
  const v = stockage()?.getItem(CLE_CHECKLIST);
  const n = v === null || v === undefined ? NaN : Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function masquerChecklist(avancement: number): void {
  try {
    stockage()?.setItem(CLE_CHECKLIST, String(avancement));
  } catch {
    /* pas de storage : la carte restera, c'est le moindre mal */
  }
}
