import { digitsToMs, formatDigits, msToDigits, onlyDigits } from '@/lib/laptime';

describe('saisie chrono au pavé numérique', () => {
  it('remplit de la droite vers la gauche', () => {
    expect(formatDigits('5')).toBe('0:00.005');
    expect(formatDigits('523')).toBe('0:00.523');
    expect(formatDigits('52348')).toBe('0:52.348');
    expect(formatDigits('102345')).toBe('1:02.345');
    expect(formatDigits('1102345')).toBe('11:02.345');
  });

  it('ignore tout ce qui n’est pas un chiffre (collage, séparateurs tapés)', () => {
    expect(onlyDigits('0:52.348')).toBe('052348');
    expect(formatDigits('0:52.348')).toBe('0:52.348');
    expect(formatDigits('52,348')).toBe('0:52.348');
  });

  it('convertit en millisecondes', () => {
    expect(digitsToMs('52348')).toBe(52_348);
    expect(digitsToMs('102345')).toBe(62_345);
    expect(digitsToMs('')).toBeNull();
  });

  // 62 s n'est pas un temps : c'est « 1:02 » mal tapé. Mieux vaut refuser que
  // d'enregistrer un chrono faux que personne ne rattrapera.
  it('refuse 60 secondes et plus dans le champ des secondes', () => {
    expect(digitsToMs('62348')).toBeNull();
  });

  it('refuse les temps hors bornes (10 s – 20 min)', () => {
    expect(digitsToMs('9999')).toBeNull(); // 9,999 s
    expect(digitsToMs('2100000')).toBeNull(); // 21 min
  });

  it('fait l’aller-retour avec un temps existant', () => {
    expect(msToDigits(52_348)).toBe('52348');
    expect(msToDigits(62_345)).toBe('102345');
    expect(msToDigits(null)).toBe('');
    expect(digitsToMs(msToDigits(52_348))).toBe(52_348);
    expect(digitsToMs(msToDigits(662_345))).toBe(662_345);
  });
});
