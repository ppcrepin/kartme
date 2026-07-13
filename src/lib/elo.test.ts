import { pairwiseBreakdown, totalDelta, type PairInput } from './elo';

const five = (elos: number[]): PairInput[] =>
  elos.map((e, i) => ({ name: `P${i + 1}`, eloBefore: e, position: i + 1 }));

describe('pairwiseBreakdown', () => {
  it('5 joueurs à 1000 : le 1er totalise +16, le 3e 0, le 5e −16', () => {
    const players = five([1000, 1000, 1000, 1000, 1000]);
    expect(totalDelta(pairwiseBreakdown(players[0], players))).toBeCloseTo(16, 6);
    expect(totalDelta(pairwiseBreakdown(players[2], players))).toBeCloseTo(0, 6);
    expect(totalDelta(pairwiseBreakdown(players[4], players))).toBeCloseTo(-16, 6);
  });

  it('à Elo égal, chaque duel gagné vaut K/(n−1) × 0,5 (= +4 à 5 joueurs)', () => {
    const players = five([1000, 1000, 1000, 1000, 1000]);
    const first = pairwiseBreakdown(players[0], players);
    expect(first).toHaveLength(4);
    for (const duel of first) {
      expect(duel.beat).toBe(true);
      expect(duel.points).toBeCloseTo(4, 6);
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
