import { nombreFr, pluriel } from './nombre';

/**
 * Typographie française des nombres. Ces tests existent parce que l'audit
 * navigateur a relevé « 1200 m » et « 128400 » à l'écran, alors que le
 * commentaire i18n de la fiche circuit promet littéralement « 1 200 m ».
 */
describe('nombreFr', () => {
  it('ne touche pas aux nombres de moins de quatre chiffres', () => {
    expect(nombreFr(0)).toBe('0');
    expect(nombreFr(8)).toBe('8');
    expect(nombreFr(999)).toBe('999');
  });

  it('groupe par trois depuis la droite', () => {
    //   serait une espace FINE insécable ; on veut l'insécable simple
    // (U+00A0), stable d'un moteur à l'autre — contrairement à toLocaleString.
    expect(nombreFr(1200)).toBe('1 200');
    expect(nombreFr(128400)).toBe('128 400');
    expect(nombreFr(1234567)).toBe('1 234 567');
  });

  it('sépare avec une espace INSÉCABLE, pour qu’un nombre ne se coupe pas en fin de ligne', () => {
    expect(nombreFr(1200)).not.toContain(' '); // pas d'espace ordinaire
    expect(nombreFr(1200).charCodeAt(1)).toBe(0xa0);
  });

  it('garde les décimales, avec la virgule française', () => {
    expect(nombreFr(1200.5)).toBe('1 200,5');
    expect(nombreFr(7.5)).toBe('7,5');
  });

  it('gère le signe et les valeurs non finies', () => {
    expect(nombreFr(-1200)).toBe('-1 200');
    expect(nombreFr(Number.NaN)).toBe('—');
    expect(nombreFr(Number.POSITIVE_INFINITY)).toBe('—');
  });
});

describe('pluriel', () => {
  it('met le singulier à 0 et à 1, comme le veut le français', () => {
    expect(pluriel(0, 'course')).toBe('0 course');
    expect(pluriel(1, 'course')).toBe('1 course');
  });

  it('met le pluriel à partir de 2', () => {
    expect(pluriel(2, 'course')).toBe('2 courses');
    expect(pluriel(12, 'course')).toBe('12 courses');
  });

  it('n’expose JAMAIS de « (s) » — le défaut qu’il corrige', () => {
    expect(pluriel(2, 'course')).not.toContain('(s)');
    expect(pluriel(1, 'course')).not.toContain('(s)');
  });

  it('accepte un pluriel irrégulier', () => {
    expect(pluriel(3, 'cheval', 'chevaux')).toBe('3 chevaux');
    expect(pluriel(1, 'cheval', 'chevaux')).toBe('1 cheval');
  });

  it('formate aussi le nombre', () => {
    expect(pluriel(1200, 'course')).toBe('1 200 courses');
  });
});
