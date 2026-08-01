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
/** De QUI parle la fiche de grade. */
export interface SujetGrade {
  /** L'Elo à situer dans le grade. `null` = on ne le connaît pas (profil privé). */
  elo?: number | null;
  /**
   * Le pseudo du pilote regardé, quand ce n'est PAS soi. Son absence fait
   * basculer la fiche au tutoiement — c'est le seul commutateur, et il doit
   * rester unique : « Ton Elo : 1450 » sur la fiche de quelqu'un d'autre est un
   * chiffre faux présenté comme le sien (relevé aux deux audits du 2026-08-01).
   */
  pseudo?: string | null;
  /**
   * Nombre de courses jouées. Sert à savoir si le pilote est encore en
   * calibration — auquel cas la fiche le dit, faute de quoi elle affirmait un
   * objectif chiffré que l'écran juste derrière déclarait provisoire.
   */
  courses?: number;
}

export interface Explications {
  /** Ouvre la fiche d'un grade. */
  expliquerGrade: (grade: Grade, sujet?: SujetGrade) => void;
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
