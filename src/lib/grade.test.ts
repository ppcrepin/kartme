import { ELO_FLOOR, GRADES, gradeForElo } from './grade';

describe('gradeForElo', () => {
  it('place l\'Elo de départ (1000) dans Rookie', () => {
    expect(gradeForElo(1000).key).toBe('rookie');
  });

  it('mappe chaque tranche au bon grade', () => {
    expect(gradeForElo(100).key).toBe('kartambolage');
    expect(gradeForElo(699).key).toBe('kartambolage');
    expect(gradeForElo(700).key).toBe('roueLibre');
    expect(gradeForElo(999).key).toBe('roueLibre');
    expect(gradeForElo(1299).key).toBe('rookie');
    expect(gradeForElo(1300).key).toBe('missile');
    expect(gradeForElo(1699).key).toBe('missile');
    expect(gradeForElo(1700).key).toBe('fusee');
    expect(gradeForElo(2099).key).toBe('fusee');
    expect(gradeForElo(2100).key).toBe('legende');
    expect(gradeForElo(2500).key).toBe('legende');
  });

  it('applique le plancher à 100 (valeurs basses/négatives → Kartambolage)', () => {
    expect(gradeForElo(0).key).toBe('kartambolage');
    expect(gradeForElo(-50).key).toBe('kartambolage');
    expect(gradeForElo(ELO_FLOOR).key).toBe('kartambolage');
  });

  it('a des bornes contiguës, sans trou ni chevauchement', () => {
    for (let i = 1; i < GRADES.length; i++) {
      expect(GRADES[i].min).toBe((GRADES[i - 1].max as number) + 1);
    }
    expect(GRADES[0].min).toBe(ELO_FLOOR);
    expect(GRADES[GRADES.length - 1].max).toBeNull();
  });
});
