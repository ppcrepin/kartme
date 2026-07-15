import { formatLap, parseLap } from './laptime';

describe('formatLap', () => {
  it('formate en m:ss.mmm', () => {
    expect(formatLap(52348)).toBe('0:52.348');
    expect(formatLap(62500)).toBe('1:02.500');
    expect(formatLap(600000)).toBe('10:00.000');
  });
});

describe('parseLap', () => {
  it('accepte plusieurs formats', () => {
    expect(parseLap('0:52.348')).toBe(52348);
    expect(parseLap('52.348')).toBe(52348);
    expect(parseLap('52,348')).toBe(52348); // virgule décimale
    expect(parseLap('1:02.5')).toBe(62500); // fraction complétée à droite
    expect(parseLap('1:02')).toBe(62000);
    expect(parseLap('52')).toBe(52000);
  });

  it('rejette les saisies invalides ou hors bornes', () => {
    expect(parseLap('')).toBeNull();
    expect(parseLap('abc')).toBeNull();
    expect(parseLap('1:70.0')).toBeNull(); // secondes ≥ 60
    expect(parseLap('5.0')).toBeNull(); // < 10 s (plancher)
    expect(parseLap('25:00')).toBeNull(); // > 20 min (plafond)
  });

  it('boucle format→parse', () => {
    for (const ms of [10000, 52348, 62500, 599999]) {
      expect(parseLap(formatLap(ms))).toBe(ms);
    }
  });
});
