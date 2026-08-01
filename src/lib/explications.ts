import { createContext, useContext } from 'react';

import type { BadgeKey } from './badges';
import type { Grade } from './grade';

/**
 * Le canal par lequel n'importe quel médaillon ouvre sa fiche d'explication.
 *
 * Retour de test 2026-08-01 : « je vois un médaillon "MS", je ne sais pas ce
 * que ça vaut ni ce qu'il faut faire pour le suivant ». Le savoir existait —
 * sur l'écran « Échelle des grades », à deux taps du profil et invisible depuis
 * le classement — mais pas là où l'on se pose la question.
 *
 * Ce fichier ne contient QUE le contexte, sans le moindre composant : le
 * médaillon (`components/ui/grade-medal`) doit pouvoir le lire, et le
 * fournisseur (`components/explications`) doit pouvoir afficher un médaillon.
 * Les deux dans un même module feraient un cycle d'imports.
 */
export interface Explications {
  /** Ouvre la fiche d'un grade. `elo` situe le pilote dedans quand on le connaît. */
  expliquerGrade: (grade: Grade, elo?: number | null) => void;
  /** Ouvre la fiche d'un badge. `obtenuLe` = date ISO, ou null s'il reste à décrocher. */
  expliquerBadge: (badge: BadgeKey, obtenuLe?: string | null) => void;
}

/**
 * `null` et non un objet inerte : un médaillon rendu HORS fournisseur (la
 * galerie de composants, un test unitaire) doit rester un simple aplat. Un
 * bouton annoncé comme tel et qui n'ouvre rien est pire que pas de bouton.
 */
export const ContexteExplications = createContext<Explications | null>(null);

export function useExplications(): Explications | null {
  return useContext(ContexteExplications);
}
