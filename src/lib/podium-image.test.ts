import { ecrireDelta, lignesPodium, nomCourt, type ResultatSource } from './podium-image';

/**
 * L'image de podium part dans des conversations, à des gens qui ne sont pas
 * forcément inscrits : ce qu'elle affiche est irrattrapable une fois envoyé.
 * Ces tests portent sur ce qui se DÉCIDE (qui figure, sous quel nom, avec quel
 * chiffre) — le dessin lui-même ne se juge qu'à l'œil, et c'est l'audit
 * navigateur qui s'en charge.
 */
const r = (p: Partial<ResultatSource> & { position: number }): ResultatSource => ({
  name: `Pilote ${p.position}`,
  isGuest: false,
  hiddenProfile: false,
  eloDelta: 0,
  dnf: false,
  ...p,
});

describe('nomCourt', () => {
  it('laisse passer un nom qui tient', () => {
    expect(nomCourt('Sophie_K', 18)).toBe('Sophie_K');
  });

  it('coupe et signale la coupe', () => {
    expect(nomCourt('Jean-Christophe-Marie', 10)).toBe('Jean-Chri…');
  });

  it('ne laisse pas d’espace avant les points de suspension', () => {
    expect(nomCourt('Marie Claire Dupont', 12)).toBe('Marie Clair…');
  });

  it('survit à un nom d’un seul caractère et aux espaces autour', () => {
    expect(nomCourt('  A  ', 18)).toBe('A');
    expect(nomCourt('AB', 1)).toBe('…');
  });
});

describe('lignesPodium', () => {
  const anonyme = 'Pilote privé';

  it('garde les trois premiers, dans l’ordre', () => {
    const lignes = lignesPodium(
      [r({ position: 3 }), r({ position: 1 }), r({ position: 4 }), r({ position: 2 })],
      anonyme,
    );
    expect(lignes.map((l) => l.rang)).toEqual([1, 2, 3]);
  });

  it('ne donne AUCUN delta à un invité', () => {
    // Son Elo est gelé (anti-triche « Elo entre inscrits ») : afficher « 0 »
    // laisserait croire à un échange qui n'a pas eu lieu.
    const [ligne] = lignesPodium([r({ position: 1, isGuest: true, eloDelta: 0 })], anonyme);
    expect(ligne.delta).toBeNull();
  });

  it('respecte un profil masqué jusque dans l’image', () => {
    // Le partage ne doit pas être une porte dérobée sur ce que l'écran refuse
    // de montrer.
    const [ligne] = lignesPodium(
      [r({ position: 1, name: 'Sophie_K', hiddenProfile: true })],
      anonyme,
    );
    expect(ligne.nom).toBe(anonyme);
  });

  it('transporte l’abandon', () => {
    const [ligne] = lignesPodium([r({ position: 1, dnf: true, eloDelta: -12 })], anonyme);
    expect(ligne.dnf).toBe(true);
  });

  it('accepte une course à deux, ou à un seul', () => {
    expect(lignesPodium([r({ position: 1 }), r({ position: 2 })], anonyme)).toHaveLength(2);
    expect(lignesPodium([], anonyme)).toHaveLength(0);
  });

  it('ne modifie pas le tableau reçu', () => {
    // `sort` trie EN PLACE : sans copie, l'image réordonnait la liste affichée
    // à l'écran juste derrière.
    const source = [r({ position: 3 }), r({ position: 1 })];
    lignesPodium(source, anonyme);
    expect(source.map((x) => x.position)).toEqual([3, 1]);
  });
});

describe('ecrireDelta', () => {
  const abd = 'ABD';

  it('signe explicitement les gains', () => {
    expect(ecrireDelta(24, abd, false)).toBe('+24');
  });

  it('garde le signe des pertes', () => {
    expect(ecrireDelta(-24, abd, false)).toBe('-24');
  });

  it('écrit l’abandon plutôt qu’un chiffre', () => {
    // Un abandon à −12 lu comme une contre-performance serait injuste : ce
    // n'est pas la même histoire, et l'image la raconte à des gens absents.
    expect(ecrireDelta(-12, abd, true)).toBe(abd);
  });

  it('remplace le delta manquant par un tiret, pas par zéro', () => {
    expect(ecrireDelta(null, abd, false)).toBe('—');
  });

  it('écrit zéro tel quel quand c’est vraiment zéro', () => {
    expect(ecrireDelta(0, abd, false)).toBe('0');
  });
});
