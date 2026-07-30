/**
 * Miroir client de la formule Elo (cahier §5.2) — uniquement pour AFFICHER le
 * détail par paire (écran C10). Le calcul qui fait foi reste côté serveur
 * (fonction submit_race_results, lot 1.3) ; ici on ré-explique les mêmes
 * chiffres, duel par duel.
 */

// Barème « Dynamique & amplitude » (aligné sur la fonction serveur).
//
// ⚠️ K n'est PAS une constante côté serveur. Depuis la calibration (A3), un
// pilote de moins de 5 courses joue avec K = 128, les autres avec 64, et le K
// appliqué à UN DUEL est la MOYENNE des K des deux pilotes. L'écran qui
// affichait 64 pour tout le monde montrait donc la moitié des points réels à
// un nouveau — sur la pièce maîtresse du produit, et en se contredisant
// lui-même puisque le total servi par le serveur, lui, était juste.
//
// Le client ne PEUT pas recalculer ce K : il dépend du nombre de courses de
// chaque pilote AU MOMENT de la course, que la fiche de résultats ne
// transporte pas (et qui a changé depuis). On ne le devine donc plus : quand
// le total réel est connu, on le RÉSOUT (voir `pairwiseBreakdown`). Cette
// valeur ne sert plus que de repli quand aucun total n'est fourni.
export const K = 64;
export const DIVISOR = 800;

export interface PairInput {
  name: string;
  eloBefore: number;
  position: number;
}

export interface PairContribution {
  opponent: string;
  /** true si le pilote a fini devant cet adversaire. */
  beat: boolean;
  /** true si les deux sont EX ÆQUO (deux abandons) : demi-point de part et d'autre. */
  tied: boolean;
  /** Probabilité attendue de le battre (0–1). */
  expected: number;
  /** Points gagnés/perdus sur ce duel (fraction de K/(n−1)). */
  points: number;
}

/**
 * Détail des points d'un pilote, duel par duel.
 *
 * `total` : le delta RÉELLEMENT appliqué par le serveur, quand on le connaît
 * (il est stocké sur chaque résultat). Fourni, il sert à résoudre le K employé
 * — `K = total / forme`, où « forme » est la somme des duels calculée à K = 1.
 * L'explication colle alors EXACTEMENT au chiffre affiché à côté, quel que
 * soit le barème du jour : calibration, changement futur de K, peu importe.
 *
 * Limite assumée et mesurée : lorsque les adversaires n'ont pas tous le même K
 * (un pilote en calibration face à des installés), le serveur applique un K
 * différent par duel. Le total reste alors exact, la répartition entre duels
 * est approchée. C'est strictement mieux que la version précédente, qui se
 * trompait sur les deux.
 */
export function pairwiseBreakdown(
  self: PairInput,
  all: PairInput[],
  total?: number,
): PairContribution[] {
  const others = all.filter((p) => p !== self && p.name !== self.name);
  const n = others.length + 1;
  if (n < 2) return [];
  // Forme des duels, indépendante du barème (K = 1).
  const forme = others.reduce((somme, o) => {
    const attendu = 1 / (1 + Math.pow(10, (o.eloBefore - self.eloBefore) / DIVISOR));
    const s = self.position < o.position ? 1 : self.position === o.position ? 0.5 : 0;
    return somme + (s - attendu) / (n - 1);
  }, 0);
  // Garde-fou : à forme quasi nulle (un pilote pile au milieu d'un plateau
  // homogène), le quotient explose et donnerait des duels absurdes pour un
  // total d'un point d'arrondi. On retombe alors sur le barème nominal.
  const kEffectif =
    total !== undefined && Math.abs(forme) > 1e-6 ? total / forme : K;
  return others.map((o) => {
    const expected = 1 / (1 + Math.pow(10, (o.eloBefore - self.eloBefore) / DIVISOR));
    const beat = self.position < o.position;
    const tied = self.position === o.position;
    // Score du duel : 1 / 0,5 / 0. L'égalité n'arrive qu'entre abandons, que
    // le serveur classe ex æquo — sans ce cas, l'écran affirmerait qu'un
    // abandon en a « battu » un autre.
    const score = beat ? 1 : tied ? 0.5 : 0;
    return {
      opponent: o.name,
      beat,
      tied,
      expected,
      points: (kEffectif / (n - 1)) * (score - expected),
    };
  });
}

/** Somme des contributions (≈ Δ servi par le serveur, à l'arrondi entier près). */
export function totalDelta(contributions: PairContribution[]): number {
  return contributions.reduce((sum, c) => sum + c.points, 0);
}
