import { echelleCourbe } from './elo-curve';

/**
 * Le seuil du grade suivant sur la courbe d'Elo (lot C2).
 *
 * La relecture adversariale a relevé qu'AUCUN test ne le couvrait : la campagne
 * navigateur ne simule pas d'historique de courses, donc `EloCurve` n'y est
 * jamais rendu. Le défaut de la légende — « max 1300 » à un pilote monté au
 * plus à 1250 — serait parti en production.
 */
const OR = { valeur: 1300, couleur: '#ecc63f' };

describe('echelleCourbe', () => {
  it('légende le max RÉELLEMENT atteint, pas le seuil visé', () => {
    const e = echelleCourbe([1000, 1180, 1210], OR);
    expect(e.max).toBe(1210);
    expect(e.min).toBe(1000);
  });

  it('englobe le seuil dans le DESSIN pour que son trait tienne dans le cadre', () => {
    const e = echelleCourbe([1000, 1180, 1210], OR);
    expect(e.haut).toBe(1300);
    expect(e.bas).toBe(1000);
    expect(e.repere).toEqual(OR);
  });

  it('garde le trait très loin du tracé, mais SANS écraser la courbe', () => {
    // Amplitude réelle 20 points, seuil 390 au-dessus. Étirer le cadre jusqu'à
    // 1700 réduisait les cinq dernières courses à 2,6 px de haut : une ligne
    // horizontale, mesurée à l'audit navigateur. On aurait montré le palier en
    // supprimant la courbe.
    //
    // Le cadre est donc CLAMPÉ à une fois et demie l'amplitude, et le trait se
    // pose sur le bord avec `horsCadre` — il ne disparaît jamais, ce qui était
    // le symptôme rapporté (« les pointillés n'apparaissent pas toujours »).
    const e = echelleCourbe([1290, 1300, 1310], { valeur: 1700, couleur: '#ef7f27' });
    expect(e.repere).not.toBeNull();
    expect(e.horsCadre).toBe(true);
    expect(e.haut).toBe(1340); // 1310 + 1,5 × 20
    // La LÉGENDE, elle, continue de dire la vérité du tracé.
    expect(e.max).toBe(1310);
  });

  it('un seuil ATTEIGNABLE reste dans le cadre, sans flèche', () => {
    // Amplitude 210, seuil 90 au-dessus : largement sous la limite.
    const e = echelleCourbe([1000, 1180, 1210], { valeur: 1300, couleur: '#ecc63f' });
    expect(e.horsCadre).toBe(false);
    expect(e.haut).toBe(1300);
  });

  it('clampe AUSSI vers le bas (grade perdu, palier loin en dessous)', () => {
    const e = echelleCourbe([1500, 1510], { valeur: 1000, couleur: '#a89c8f' });
    expect(e.horsCadre).toBe(true);
    expect(e.bas).toBe(1470); // 1500 − 1,5 × 20
  });

  it('sans seuil, l’échelle du dessin est celle de la légende', () => {
    const e = echelleCourbe([1000, 1180, 1210]);
    expect(e.repere).toBeNull();
    expect(e.bas).toBe(e.min);
    expect(e.haut).toBe(e.max);
  });

  it('gère un seuil SOUS le tracé (grade perdu puis regagné)', () => {
    const e = echelleCourbe([1000, 1350, 1320], { valeur: 1300, couleur: '#ecc63f' });
    expect(e.repere).not.toBeNull();
    expect(e.bas).toBe(1000);
    expect(e.haut).toBe(1350);
  });

  it('une courbe PLATE montre quand même son palier', () => {
    const e = echelleCourbe([1000, 1000], { valeur: 1030, couleur: '#ecc63f' });
    expect(e.repere).not.toBeNull();
    expect(e.bas).toBe(1000);
    expect(e.haut).toBe(1030);
  });
});
