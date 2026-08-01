import { readFileSync } from 'fs';
import { join } from 'path';
import { crc32, inflateSync } from 'zlib';

import { colors } from '@/constants/theme';

/**
 * Les icônes de l'application (lot C6).
 *
 * Elles sont GÉNÉRÉES (`npm run icons` → `scripts/logo.py`) et committées : un
 * binaire committé sans garde-fou est un binaire que personne ne relit. Ces
 * tests répondent aux questions qu'on se pose six mois plus tard — « est-ce
 * toujours notre damier, ou l'icône Expo par défaut est-elle revenue ? », « le
 * fichier est-il seulement valide ? », « y a-t-il encore quelque chose
 * dessus ? ».
 *
 * Le décodeur ci-dessous ne gère que le PNG que notre script produit (RGBA 8
 * bits, filtre « None ») : ce n'est pas un décodeur général, et il ne prétend
 * pas l'être — il n'a qu'un seul producteur à lire. En revanche il VÉRIFIE les
 * sommes de contrôle : l'encodeur est écrit à la main, un CRC faux passerait
 * inaperçu ici et ferait rejeter le fichier par un vrai décodeur.
 */
const RACINE = join(__dirname, '..', '..', 'assets', 'images');

/** Les teintes viennent du thème, pas d'une copie : c'est justement la dérive
 *  entre l'icône et l'interface qu'on veut empêcher. */
function rvb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}
const ROUGE = rvb(colors.accent);
const CARBONE = rvb(colors.bg);

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
  expect(d[24]).toBe(8); // profondeur
  expect(d[25]).toBe(6); // RGBA

  let i = 8;
  const morceaux: Buffer[] = [];
  const noms: string[] = [];
  while (i + 12 <= d.length) {
    const len = d.readUInt32BE(i);
    const nomBloc = d.subarray(i + 4, i + 8).toString('latin1');
    // La somme de contrôle porte sur le NOM + le corps. Notre encodeur la
    // calcule à la main ; un décalage d'un octet dans la découpe donnerait un
    // fichier que Chrome refuse et que ce test aurait laissé passer.
    const attendu = d.readUInt32BE(i + 8 + len);
    expect(crc32(d.subarray(i + 4, i + 8 + len)) >>> 0).toBe(attendu);
    noms.push(nomBloc);
    if (nomBloc === 'IDAT') morceaux.push(d.subarray(i + 8, i + 8 + len));
    i += 12 + len;
  }
  // Fichier COMPLET : les trois blocs obligatoires, dans l'ordre, et rien qui
  // traîne après la fin. Un IEND manquant, c'est une image tronquée.
  expect(noms).toEqual(['IHDR', 'IDAT', 'IEND']);
  expect(i).toBe(d.length);

  const brut = inflateSync(Buffer.concat(morceaux));
  const pas = largeur * 4;
  expect(brut.length).toBe(hauteur * (pas + 1));
  const px = Buffer.alloc(hauteur * pas);
  for (let y = 0; y < hauteur; y++) {
    // Filtre « None » sur chaque ligne : c'est ce qu'écrit notre script.
    expect(brut[y * (pas + 1)]).toBe(0);
    brut.copy(px, y * pas, y * (pas + 1) + 1, y * (pas + 1) + 1 + pas);
  }
  return { largeur, hauteur, px };
}

function proche(px: Buffer, o: number, teinte: [number, number, number], tol: number): boolean {
  return (
    Math.abs(px[o] - teinte[0]) <= tol &&
    Math.abs(px[o + 1] - teinte[1]) <= tol &&
    Math.abs(px[o + 2] - teinte[2]) <= tol
  );
}

/**
 * Part des pixels proches d'une teinte, sur le TOTAL de l'image.
 *
 * Et non sur les seuls pixels opaques : sur une image à 78 % transparente, la
 * proportion « parmi les opaques » vaut mécaniquement 1,0 et l'assertion ne
 * dit plus rien. C'était le cas de l'écran de démarrage.
 */
function part(img: Image, teinte: [number, number, number], tolerance = 24): number {
  let n = 0;
  for (let o = 0; o < img.px.length; o += 4) {
    if (img.px[o + 3] >= 128 && proche(img.px, o, teinte, tolerance)) n++;
  }
  return n / (img.px.length / 4);
}

/** Part des pixels ENCRÉS (opaques), quelle que soit leur couleur. */
function encre(img: Image): number {
  let n = 0;
  for (let o = 3; o < img.px.length; o += 4) if (img.px[o] >= 128) n++;
  return n / (img.px.length / 4);
}

/**
 * Le MOTIF, lu dans le repère de la bande.
 *
 * On échantillonne au centre de chaque case attendue, sur les deux rangs, après
 * rotation inverse de l'inclinaison. C'est le seul test qui prouve qu'il s'agit
 * d'un DAMIER — deux rangs décalés — et pas de deux lignes de tirets
 * superposées, ni d'un aplat, ni du motif dessiné droit. Une couverture de
 * rouge « supérieure à 15 % » passerait pour n'importe lequel des trois.
 */
const ANGLE = (-12 * Math.PI) / 180;
function casesDuDamier(img: Image, colonnes: number): string[][] {
  const carreau = img.largeur / colonnes;
  const c = img.largeur / 2;
  const cos = Math.cos(ANGLE);
  const sin = Math.sin(ANGLE);
  const rangs: string[][] = [];
  for (let rang = 0; rang < 2; rang++) {
    const ligne: string[] = [];
    // Centre vertical du rang dans le repère de la bande : −½ carreau pour le
    // rang du haut, +½ pour celui du bas.
    const v = (rang - 0.5) * carreau;
    for (let col = 0; col < colonnes; col++) {
      // Les frontières de cases tombent sur les multiples de `carreau` à partir
      // du CENTRE (le script fait `floor(u / carreau)`) : viser le milieu d'une
      // case demande donc un demi-carreau de décalage. Sans lui on
      // échantillonnait pile sur les bords, et on lisait des teintes mélangées.
      const u = (col - Math.floor(colonnes / 2) + 0.5) * carreau;
      // Rotation directe : du repère de la bande vers celui de l'image.
      const x = Math.round(c + u * cos - v * sin);
      const y = Math.round(c + u * sin + v * cos);
      if (x < 0 || y < 0 || x >= img.largeur || y >= img.hauteur) {
        ligne.push('?');
        continue;
      }
      const o = (y * img.largeur + x) * 4;
      // « Plein » = encré ET pas le fond. Un seul critère pour les cinq cibles :
      // le creux est tantôt transparent (démarrage, Android), tantôt carbone
      // (icône, favicon), et le plein tantôt rouge, tantôt blanc (monochrome).
      const plein = img.px[o + 3] >= 128 && !proche(img.px, o, CARBONE, 40);
      ligne.push(plein ? '#' : '.');
    }
    rangs.push(ligne);
  }
  return rangs;
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
      expect(part(img, ROUGE)).toBeGreaterThan(0.1);
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

  // Le motif lui-même, cible par cible, avec la densité que le script leur
  // donne. Le rang du bas est décalé d'une case : c'est LA définition du
  // damier, et c'est ce que le PO a demandé (« un vrai damier, sur deux rangs »).
  it.each([
    ['icon.png', 5],
    ['favicon.png', 3],
    ['splash-icon.png', 5],
    ['android-icon-foreground.png', 6],
    ['android-icon-monochrome.png', 6],
  ] as [string, number][])('%s alterne bien sur DEUX rangs décalés', (nom, colonnes) => {
    const img = lirePng(nom);
    const [haut, bas] = casesDuDamier(img, colonnes);
    // La bande court d'un bord à l'autre ET penche : ses cases extrêmes sortent
    // du cadre par le haut ou par le bas. On ne juge que celles qui y sont —
    // mais il en faut assez pour que le motif soit prouvé, pas deviné.
    const dedans = [...Array(colonnes).keys()].filter((c) => haut[c] !== '?' && bas[c] !== '?');
    expect(dedans.length).toBeGreaterThanOrEqual(colonnes - 2);
    for (const col of dedans) {
      // Un rang plein là où l'autre est creux, à chaque colonne.
      expect(`${nom} col ${col}: ${haut[col]}${bas[col]}`).toMatch(/(#\.|\.#)$/);
    }
    // Et l'alternation LE LONG du rang : sans elle, deux barres pleines
    // décalées passeraient le test précédent.
    expect(dedans.map((c) => haut[c]).join('')).toMatch(/^(#\.)+#?$|^(\.#)+\.?$/);
  });

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

  // Un fichier VIDE (entièrement transparent) passait toutes les assertions
  // ci-dessous, qui ne comptent que des pixels absents. Le plancher d'encre est
  // ce qui distingue « transparent autour du motif » de « pas de motif ».
  it.each([
    ['splash-icon.png', 0.1, 0.35],
    ['android-icon-foreground.png', 0.08, 0.3],
    ['android-icon-monochrome.png', 0.08, 0.3],
  ] as [string, number, number][])('%s a bien de l’encre dessus', (nom, min, max) => {
    const e = encre(lirePng(nom));
    expect(e).toBeGreaterThan(min);
    // Et pas trop : une image pleine n'est plus un drapeau, c'est un aplat.
    expect(e).toBeLessThan(max);
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
