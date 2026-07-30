import { pairwiseBreakdown, totalDelta, type PairInput } from './elo';

const five = (elos: number[]): PairInput[] =>
  elos.map((e, i) => ({ name: `P${i + 1}`, eloBefore: e, position: i + 1 }));

describe('pairwiseBreakdown', () => {
  it('5 joueurs à 1000 : le 1er totalise +32, le 3e 0, le 5e −32', () => {
    const players = five([1000, 1000, 1000, 1000, 1000]);
    expect(totalDelta(pairwiseBreakdown(players[0], players))).toBeCloseTo(32, 6);
    expect(totalDelta(pairwiseBreakdown(players[2], players))).toBeCloseTo(0, 6);
    expect(totalDelta(pairwiseBreakdown(players[4], players))).toBeCloseTo(-32, 6);
  });

  it('à Elo égal, chaque duel gagné vaut K/(n−1) × 0,5 (= +8 à 5 joueurs)', () => {
    const players = five([1000, 1000, 1000, 1000, 1000]);
    const first = pairwiseBreakdown(players[0], players);
    expect(first).toHaveLength(4);
    for (const duel of first) {
      expect(duel.beat).toBe(true);
      expect(duel.points).toBeCloseTo(8, 6);
    }
  });

  it('battre plus fort rapporte plus que battre plus faible', () => {
    const players: PairInput[] = [
      { name: 'Moi', eloBefore: 1000, position: 1 },
      { name: 'Fort', eloBefore: 1400, position: 2 },
      { name: 'Faible', eloBefore: 700, position: 3 },
    ];
    const [vsFort, vsFaible] = pairwiseBreakdown(players[0], players);
    expect(vsFort.points).toBeGreaterThan(vsFaible.points);
    expect(vsFort.expected).toBeLessThan(0.5);
    expect(vsFaible.expected).toBeGreaterThan(0.5);
  });

  it('la somme des Δ de tous les pilotes est nulle', () => {
    const players = five([1240, 980, 1105, 860, 1010]);
    const sum = players.reduce((s, p) => s + totalDelta(pairwiseBreakdown(p, players)), 0);
    expect(sum).toBeCloseTo(0, 6);
  });
});

/**
 * Le K du serveur n'est pas 64 pour tout le monde : depuis la calibration
 * (A3), un pilote de moins de 5 courses joue à 128, et le K d'un duel est la
 * MOYENNE des deux. Le client ne peut pas le recalculer — le nombre de courses
 * de chacun AU MOMENT de la course n'est pas dans la fiche de résultats. Il le
 * résout donc à partir du total réel.
 */
describe('résolution du K depuis le total réel', () => {
  const cinq = (elos: number[]): PairInput[] =>
    elos.map((e, i) => ({ name: `P${i + 1}`, eloBefore: e, position: i + 1 }));

  it('sans total fourni, garde le barème nominal (compatibilité)', () => {
    const j = cinq([1000, 1000, 1000, 1000, 1000]);
    expect(totalDelta(pairwiseBreakdown(j[0], j))).toBeCloseTo(32, 6);
  });

  it('LE défaut corrigé : un pilote en calibration voyait la MOITIÉ de ses points', () => {
    const j = cinq([1000, 1000, 1000, 1000, 1000]);
    // Cinq nouveaux : le serveur applique K=128 partout, le vainqueur prend +64.
    const reel = 64;
    const duels = pairwiseBreakdown(j[0], j, reel);
    expect(totalDelta(duels)).toBeCloseTo(reel, 6);
    // Sans l'ancre, l'écran affichait 32 — soit la moitié.
    expect(totalDelta(pairwiseBreakdown(j[0], j))).toBeCloseTo(32, 6);
  });

  it('le total affiché colle EXACTEMENT au delta du serveur, signe compris', () => {
    // Plateau volontairement ASYMÉTRIQUE : le pilote du milieu d'une échelle
    // symétrique a une forme nulle, cas traité séparément plus bas.
    const j = cinq([1200, 1150, 1100, 900, 800]);
    for (const [i, reel] of [43, 12, -5, -20, -30].entries()) {
      expect(totalDelta(pairwiseBreakdown(j[i], j, reel))).toBeCloseTo(reel, 6);
    }
  });

  it('un barème doublé donne des points doublés, duel par duel', () => {
    // C'est exactement la situation de la calibration : même course, même
    // forme, K deux fois plus grand.
    const j = cinq([1200, 1150, 1100, 900, 800]);
    const simple = pairwiseBreakdown(j[0], j, 30);
    const double = pairwiseBreakdown(j[0], j, 60);
    for (let d = 0; d < simple.length; d += 1) {
      expect(double[d].points).toBeCloseTo(simple[d].points * 2, 6);
    }
  });

  it('la répartition reste proportionnelle à la difficulté du duel', () => {
    const j: PairInput[] = [
      { name: 'Moi', eloBefore: 1000, position: 1 },
      { name: 'Fort', eloBefore: 1400, position: 2 },
      { name: 'Faible', eloBefore: 600, position: 3 },
    ];
    const duels = pairwiseBreakdown(j[0], j, 40);
    const fort = duels.find((d) => d.opponent === 'Fort')!;
    const faible = duels.find((d) => d.opponent === 'Faible')!;
    expect(fort.points).toBeGreaterThan(faible.points);
    expect(fort.points + faible.points).toBeCloseTo(40, 6);
  });

  it('un delta nul ne veut PAS dire des duels nuls', () => {
    // Le pilote du milieu n'a rien gagné au total, mais il a bel et bien pris
    // des points sur ceux qu'il a battus et en a perdu sur les autres. Afficher
    // quatre zéros serait faux — c'est précisément ce que l'écran explique.
    const j = cinq([1000, 1000, 1000, 1000, 1000]);
    const duels = pairwiseBreakdown(j[2], j, 0);
    expect(totalDelta(duels)).toBeCloseTo(0, 6);
    expect(duels.filter((d) => d.points > 0)).toHaveLength(2);
    expect(duels.filter((d) => d.points < 0)).toHaveLength(2);
  });

  it('forme nulle : on ne s’invente pas un barème pour justifier un arrondi', () => {
    // Le pilote du milieu d'un plateau homogène a une forme EXACTEMENT nulle.
    // Aucun K ne peut en tirer un delta non nul : le point d'écart vient de la
    // redistribution à somme nulle, pas de la formule, et il n'est
    // attribuable à aucun duel. On garde donc la forme nominale — un quotient
    // par zéro aurait produit des duels absurdes (± l'infini) pour un point.
    const j = cinq([1000, 1000, 1000, 1000, 1000]);
    const duels = pairwiseBreakdown(j[2], j, 1);
    for (const d of duels) expect(Number.isFinite(d.points)).toBe(true);
    expect(Math.abs(totalDelta(duels))).toBeLessThan(1e-6);
  });
});
