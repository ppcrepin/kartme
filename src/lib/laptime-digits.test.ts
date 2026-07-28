import { digitsToMs, lapMaskParts, msToDigits, onlyDigits } from '@/lib/laptime';

describe('saisie chrono au gabarit', () => {
  it('remplit de la gauche vers la droite', () => {
    expect(digitsToMs('052')).toBe(52_000);
    expect(digitsToMs('05234')).toBe(52_340);
    expect(digitsToMs('052348')).toBe(52_348);
    expect(digitsToMs('102345')).toBe(62_345);
  });

  it('ignore tout ce qui n’est pas un chiffre (collage, séparateurs tapés)', () => {
    expect(onlyDigits('0:52.348')).toBe('052348');
    expect(digitsToMs('0:52.348')).toBe(52_348);
    expect(onlyDigits('0523481234')).toBe('052348'); // plafonné à 6 emplacements
  });

  it('renvoie null quand rien n’est saisi', () => {
    expect(digitsToMs('')).toBeNull();
  });

  // 62 s n'est pas un temps : c'est « 1:02 » mal tapé. Mieux vaut refuser que
  // d'enregistrer un chrono faux que personne ne rattrapera.
  it('refuse 60 secondes et plus dans le champ des secondes', () => {
    expect(digitsToMs('062348')).toBeNull();
  });

  it('refuse les temps hors bornes (10 s – 20 min)', () => {
    expect(digitsToMs('0')).toBeNull(); // 0:00.000
    expect(digitsToMs('0099')).toBeNull(); // 0:09.900
  });

  it('fait l’aller-retour avec un temps existant', () => {
    expect(msToDigits(52_348)).toBe('052348');
    expect(msToDigits(62_345)).toBe('102345');
    expect(msToDigits(null)).toBe('');
    expect(digitsToMs(msToDigits(52_348))).toBe(52_348);
    expect(digitsToMs(msToDigits(542_345))).toBe(542_345); // 9:02.345
    // Au-delà de 9:59.999, le gabarit n'a plus qu'une minute à offrir : il
    // écrête. Un « tour » de plus de dix minutes n'existe pas en karting — la
    // borne à 20 min du schéma est un garde-fou anti-saisie absurde, pas un
    // cas d'usage.
    expect(msToDigits(662_345)).toBe('902345');
  });
});

describe('gabarit affiché', () => {
  const render = (d: string) =>
    lapMaskParts(d)
      .map((p) => (p.filled ? p.char : '_'))
      .join('');

  it('n’allume que ce qui est saisi', () => {
    expect(render('')).toBe('________');
    // Le « : » s'allume dès la minute saisie, le « . » dès les secondes :
    // le séparateur suit le chiffre qui le précède, pas celui qui le suit.
    expect(render('0')).toBe('0:______');
    expect(render('052')).toBe('0:52.___');
    expect(render('05234')).toBe('0:52.34_');
    expect(render('052348')).toBe('0:52.348');
  });

  it('garde le gabarit complet même à vide (les gris restent lisibles)', () => {
    expect(lapMaskParts('').map((p) => p.char).join('')).toBe('0:00.000');
    expect(lapMaskParts('052').map((p) => p.char).join('')).toBe('0:52.000');
  });
});
