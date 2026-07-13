/**
 * Miroir client de la formule Elo (cahier §5.2) — uniquement pour AFFICHER le
 * détail par paire (écran C10). Le calcul qui fait foi reste côté serveur
 * (fonction submit_race_results, lot 1.3) ; ici on ré-explique les mêmes
 * chiffres, duel par duel.
 */

// Barème « Dynamique & amplitude » (aligné sur la fonction serveur).
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
  /** Probabilité attendue de le battre (0–1). */
  expected: number;
  /** Points gagnés/perdus sur ce duel (fraction de K/(n−1)). */
  points: number;
}

/** Détail des points d'un pilote, duel par duel. */
export function pairwiseBreakdown(self: PairInput, all: PairInput[]): PairContribution[] {
  const others = all.filter((p) => p !== self && p.name !== self.name);
  const n = others.length + 1;
  if (n < 2) return [];
  return others.map((o) => {
    const expected = 1 / (1 + Math.pow(10, (o.eloBefore - self.eloBefore) / DIVISOR));
    const beat = self.position < o.position;
    return {
      opponent: o.name,
      beat,
      expected,
      points: (K / (n - 1)) * ((beat ? 1 : 0) - expected),
    };
  });
}

/** Somme des contributions (≈ Δ servi par le serveur, à l'arrondi entier près). */
export function totalDelta(contributions: PairContribution[]): number {
  return contributions.reduce((sum, c) => sum + c.points, 0);
}
