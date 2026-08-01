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
 * Le mode à ouvrir. Défaut : `drag`.
 *
 * Le défaut était `tap`, sur l'argument qu'un appui long ne s'annonce pas. Le
 * PO a tranché l'inverse le 2026-08-01, après avoir vu le glisser-déposer à
 * l'usage : « j'aime beaucoup le glisser-déposer », « glisser-déposer en
 * premier, toucher en secours ». C'est le geste qui raconte un classement —
 * on déplace un pilote parce qu'il est arrivé devant un autre — là où le
 * pointage compte sans montrer.
 *
 * L'objection d'origine tient toujours, et c'est le mode d'emploi affiché
 * au-dessus de la liste qui y répond, pas le choix du défaut. Le toucher reste
 * à un tap, en retrait.
 */
export function modePrefere(): ModeSaisie {
  try {
    return stockage()?.getItem(CLE_MODE) === 'tap' ? 'tap' : 'drag';
  } catch {
    return 'drag';
  }
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
 * Chassée à 2/3 — l'avancement maximum, l'étape 3 ne se cochant jamais —, la
 * carte ne revient plus : c'est voulu. À ce stade le pilote a créé sa course
 * et rempli sa grille ; s'il chasse le mode d'emploi là, c'est qu'il n'en a
 * plus besoin.
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
  try {
    const v = stockage()?.getItem(CLE_CHECKLIST);
    // `Number('')` vaut 0 : sans ce garde, une valeur vide masquerait la carte
    // au premier palier. Et la lecture est protégée — `stockage()` n'attrape
    // que l'accès au getter, pas l'appel de méthode, qui lève encore en iframe
    // aux cookies tiers bloqués. Une exception ici partirait de l'initialiseur
    // d'un `useState` : écran d'accueil BLANC, pas de dégradation douce.
    if (!v) return null;
    const n = Number(v);
    return Number.isInteger(n) && n >= 0 ? Math.min(n, 2) : null;
  } catch {
    return null;
  }
}

/**
 * Efface les préférences locales. Appelé à la DÉCONNEXION : la clé n'est pas
 * portée par un compte, et sur un navigateur partagé — la tablette du club —
 * le pilote suivant héritait de la checklist chassée par le précédent, donc
 * d'aucun mode d'emploi au moment exact où il en a besoin. Même raisonnement
 * que la libération de l'abonnement push, qui se fait déjà là.
 */
export function oublierPreferences(): void {
  try {
    const s = stockage();
    if (!s) return;
    for (const cle of Object.keys(s)) {
      if (cle.startsWith('ks_')) s.removeItem(cle);
    }
  } catch {
    /* rien à nettoyer */
  }
}

export function masquerChecklist(avancement: number): void {
  try {
    stockage()?.setItem(CLE_CHECKLIST, String(avancement));
  } catch {
    /* pas de storage : la carte restera, c'est le moindre mal */
  }
}
