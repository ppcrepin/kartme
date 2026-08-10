import { dansLeCadre, epinglesVisibles, MAX_EPINGLES, type Cadre } from './carte-epingles';
import type { Circuit } from './races';

/**
 * La sélection des épingles de la carte NATIVE (lot N1).
 *
 * C'est la seule partie de cette carte qu'on puisse prouver sans iPhone : il
 * n'y a ni simulateur ni appareil dans l'environnement de développement, donc
 * le rendu et les animations ne se jugeront qu'au premier build. Cette
 * logique-là, si.
 */
const FRANCE: Cadre = { latitude: 46.6, longitude: 2.4, latitudeDelta: 10, longitudeDelta: 10 };

function circuit(id: string, lat: number | null, lon: number | null): Circuit {
  return { id, name: id, city: null, is_official: true, lat, lon };
}

describe('dansLeCadre', () => {
  it('accepte le centre et refuse ce qui est au-delà des bords', () => {
    expect(dansLeCadre({ lat: 46.6, lon: 2.4 }, FRANCE)).toBe(true);
    // Le cadre couvre ±5° : 51,7 est dehors, 50 est dedans.
    expect(dansLeCadre({ lat: 51.7, lon: 2.4 }, FRANCE)).toBe(false);
    expect(dansLeCadre({ lat: 50, lon: 2.4 }, FRANCE)).toBe(true);
  });

  it('la marge rétrécit le cadre', () => {
    // À 35 % de marge, la demi-hauteur utile passe de 5° à 3,25°.
    expect(dansLeCadre({ lat: 50, lon: 2.4 }, FRANCE, 0.35)).toBe(false);
    expect(dansLeCadre({ lat: 49, lon: 2.4 }, FRANCE, 0.35)).toBe(true);
  });
});

describe('epinglesVisibles', () => {
  it('écarte les circuits sans coordonnées', () => {
    const r = epinglesVisibles([circuit('a', 46, 2), circuit('b', null, null)], FRANCE, null);
    expect(r.map((c) => c.id)).toEqual(['a']);
  });

  it('ne garde que ce qui est DANS le cadre', () => {
    const r = epinglesVisibles(
      [circuit('paris', 48.85, 2.35), circuit('tokyo', 35.6, 139.7)],
      FRANCE,
      null,
    );
    expect(r.map((c) => c.id)).toEqual(['paris']);
  });

  it('le plafond ne découpe pas un DISQUE dans le cadre', () => {
    // Le défaut d'origine : « les 150 plus proches du centre » sur 277
    // circuits répartis dans toute la France vidait les bords — Bretagne et
    // Côte d'Azur disparaissaient alors qu'elles étaient à l'écran.
    //
    // Ici, une grille dense au centre (200 circuits dans un carré d'un degré)
    // et deux circuits aux extrémités. Avec un tri par distance pur, les deux
    // extrêmes sautaient ; le cadre étant plus large que la grille, ils
    // doivent survivre tant que le total tient sous le plafond.
    const grille: Circuit[] = [];
    for (let i = 0; i < 100; i++) {
      grille.push(circuit(`c${i}`, 46.6 + (i % 10) * 0.01, 2.4 + Math.floor(i / 10) * 0.01));
    }
    const bords = [circuit('brest', 48.4, -1.5), circuit('nice', 43.7, 6.2)];
    const r = epinglesVisibles([...grille, ...bords], FRANCE, null, 150);
    expect(r.map((c) => c.id)).toContain('brest');
    expect(r.map((c) => c.id)).toContain('nice');
  });

  it('applique le plafond quand il mord, par proximité du centre', () => {
    // 200 circuits alignés en s'éloignant du centre : on garde les 10 premiers.
    const beaucoup = Array.from({ length: 200 }, (_, i) =>
      circuit(`c${i}`, 46.6 + i * 0.01, 2.4),
    );
    const r = epinglesVisibles(beaucoup, FRANCE, null, 10);
    expect(r).toHaveLength(10);
    // Les plus proches du centre, donc les indices les plus bas.
    expect(r.map((c) => c.id).sort()).toEqual(
      ['c0', 'c1', 'c2', 'c3', 'c4', 'c5', 'c6', 'c7', 'c8', 'c9'].sort(),
    );
  });

  it('garde le circuit SÉLECTIONNÉ même hors cadre, et le dessine en dernier', () => {
    // On le désigne depuis la LISTE, où la distance n'a pas filtré : le faire
    // disparaître au moment même où on le choisit serait absurde.
    const r = epinglesVisibles(
      [circuit('paris', 48.85, 2.35), circuit('tokyo', 35.6, 139.7)],
      FRANCE,
      'tokyo',
    );
    expect(r.map((c) => c.id)).toEqual(['paris', 'tokyo']);
  });

  it('ne DOUBLE pas le circuit sélectionné quand il est déjà visible', () => {
    // Le premier jet ajoutait la sélection sans retirer sa copie : deux
    // marqueurs à la même coordonnée, et React se plaignait des clés.
    const r = epinglesVisibles([circuit('paris', 48.85, 2.35)], FRANCE, 'paris');
    expect(r.map((c) => c.id)).toEqual(['paris']);
  });

  it('un cadre VIDE retombe sur tous les circuits plutôt que sur une carte blanche', () => {
    const large = { latitude: 0, longitude: 0, latitudeDelta: 0.001, longitudeDelta: 0.001 };
    const r = epinglesVisibles([circuit('paris', 48.85, 2.35)], large, null);
    expect(r.map((c) => c.id)).toEqual(['paris']);
  });

  it('le plafond par défaut vaut 150', () => {
    expect(MAX_EPINGLES).toBe(150);
  });
});
