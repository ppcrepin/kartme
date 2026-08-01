import { readFileSync } from 'fs';
import { join } from 'path';
import { inflateSync } from 'zlib';

/**
 * Les icônes de l'application (lot C6).
 *
 * Elles sont GÉNÉRÉES (`scripts/logo.py`) et committées : un binaire committé
 * sans garde-fou est un binaire que personne ne relit. Ces tests répondent aux
 * deux questions qu'on se pose six mois plus tard — « est-ce toujours notre
 * damier, ou l'icône Expo par défaut est-elle revenue ? » et « le fichier
 * est-il seulement valide ? ».
 *
 * Le décodeur ci-dessous ne gère que le PNG que notre script produit (RGBA 8
 * bits, filtre « None ») : ce n'est pas un décodeur général, et il ne prétend
 * pas l'être — il n'a qu'un seul producteur à lire.
 */
const RACINE = join(__dirname, '..', '..', 'assets', 'images');

/** Rouge de marque et carbone (src/constants/theme.ts). */
const ROUGE: [number, number, number] = [0xe1, 0x06, 0x00];
const CARBONE: [number, number, number] = [0x0a, 0x07, 0x06];

interface Image {
  largeur: number;
  hauteur: number;
  px: Buffer;
}

function lirePng(nom: string): Image {
  const d = readFileSync(join(RACINE, nom));
  expect(d.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const largeur = d.readUInt32BE(16);
  const hauteur = d.readUInt32BE(20);
  const profondeur = d[24];
  const type = d[25];
  expect(profondeur).toBe(8);
  expect(type).toBe(6); // RGBA

  let i = 8;
  const morceaux: Buffer[] = [];
  while (i < d.length) {
    const len = d.readUInt32BE(i);
    const nomBloc = d.subarray(i + 4, i + 8).toString('latin1');
    if (nomBloc === 'IDAT') morceaux.push(d.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  const brut = inflateSync(Buffer.concat(morceaux));
  const pas = largeur * 4;
  const px = Buffer.alloc(hauteur * pas);
  for (let y = 0; y < hauteur; y++) {
    // Filtre « None » sur chaque ligne : c'est ce qu'écrit notre script.
    expect(brut[y * (pas + 1)]).toBe(0);
    brut.copy(px, y * pas, y * (pas + 1) + 1, y * (pas + 1) + 1 + pas);
  }
  return { largeur, hauteur, px };
}

/** Part des pixels OPAQUES proches d'une teinte donnée. */
function part(img: Image, teinte: [number, number, number], tolerance = 24): number {
  let n = 0;
  let total = 0;
  for (let o = 0; o < img.px.length; o += 4) {
    if (img.px[o + 3] < 128) continue;
    total++;
    if (
      Math.abs(img.px[o] - teinte[0]) <= tolerance &&
      Math.abs(img.px[o + 1] - teinte[1]) <= tolerance &&
      Math.abs(img.px[o + 2] - teinte[2]) <= tolerance
    ) {
      n++;
    }
  }
  return total === 0 ? 0 : n / total;
}

describe('les icônes portent la marque', () => {
  const tailles: [string, number, number][] = [
    ['icon.png', 1024, 1024],
    ['favicon.png', 48, 48],
    ['splash-icon.png', 512, 512],
    ['android-icon-foreground.png', 512, 512],
    ['android-icon-background.png', 512, 512],
    ['android-icon-monochrome.png', 432, 432],
  ];

  it.each(tailles)('%s est un PNG valide de %i × %i', (nom, l, h) => {
    const img = lirePng(nom);
    expect(img.largeur).toBe(l);
    expect(img.hauteur).toBe(h);
  });

  it.each([['icon.png'], ['favicon.png'], ['splash-icon.png']])(
    '%s est un damier ROUGE, pas le bleu d’Expo',
    (nom) => {
      const img = lirePng(nom);
      // Assez de rouge pour que le damier soit le sujet, pas un liseré.
      expect(part(img, ROUGE)).toBeGreaterThan(0.15);
      // Et AUCUN bleu : l'icône livrée jusqu'ici était le chevron Expo par
      // défaut, sur un dégradé bleu. C'est l'assertion qui compte vraiment.
      let bleus = 0;
      for (let o = 0; o < img.px.length; o += 4) {
        if (img.px[o + 3] < 128) continue;
        if (img.px[o + 2] > img.px[o] + 40) bleus++;
      }
      expect(bleus).toBe(0);
    },
  );

  it('l’icône d’application est posée sur le CARBONE du thème', () => {
    const img = lirePng('icon.png');
    // Le fond domine : le damier est une bande, pas un remplissage.
    expect(part(img, CARBONE)).toBeGreaterThan(0.5);
    // Entièrement opaque : une icône d'application à trous laisse voir le fond
    // de la grille du système, et le damier perd son contraste.
    //
    // UNE assertion, pas un million : `expect` par pixel mettait 59 secondes
    // sur 1024 × 1024, pour la même conclusion.
    let translucides = 0;
    for (let o = 3; o < img.px.length; o += 4) if (img.px[o] !== 255) translucides++;
    expect(translucides).toBe(0);
  });

  it('le premier plan Android est TRANSPARENT hors du damier', () => {
    // Il se pose sur `android-icon-background`, qui porte le carbone. Opaque,
    // il masquerait ce fond et le masque du système taillerait dans un carré.
    const img = lirePng('android-icon-foreground.png');
    let transparents = 0;
    for (let o = 3; o < img.px.length; o += 4) if (img.px[o] === 0) transparents++;
    expect(transparents / (img.px.length / 4)).toBeGreaterThan(0.4);
  });

  it('le monochrome n’a AUCUNE couleur', () => {
    // Le système le recolorie : seule la forme compte, et un rouge résiduel s'y
    // verrait comme une salissure sur un thème clair.
    const img = lirePng('android-icon-monochrome.png');
    let colores = 0;
    for (let o = 0; o < img.px.length; o += 4) {
      if (img.px[o + 3] < 128) continue;
      if (img.px[o] !== img.px[o + 1] || img.px[o + 1] !== img.px[o + 2]) colores++;
    }
    expect(colores).toBe(0);
  });

  it('le fond Android est le carbone plein', () => {
    const img = lirePng('android-icon-background.png');
    expect(part(img, CARBONE, 2)).toBe(1);
  });
});
