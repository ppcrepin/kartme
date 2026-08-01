import { CARREAUX_DAMIER, dessinerDamier, dessinerSignature, fichierMarque, MARQUE, policeMarque, RANGS_DAMIER, type Contexte2D } from './marque';

/**
 * La marque est le seul module que le prochain lot (nouveau logo) doit
 * toucher : son arithmétique doit donc être vérifiable sans navigateur, et son
 * en-tête le revendique. Ces tests rendent la promesse exécutable.
 */
interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  couleur: string;
}

/** Un faux contexte 2D qui note ce qu'on lui demande de peindre. */
function faireContexte(largeurParCaractere = 10) {
  const rects: Rect[] = [];
  const textes: { texte: string; x: number; y: number }[] = [];
  const ctx: Contexte2D = {
    fillStyle: '',
    font: '',
    textAlign: 'left',
    textBaseline: 'top',
    fillRect(x, y, w, h) {
      rects.push({ x, y, w, h, couleur: ctx.fillStyle });
    },
    fillText(texte, x, y) {
      textes.push({ texte, x, y });
    },
    measureText: (texte: string) => ({ width: texte.length * largeurParCaractere }),
  };
  return { ctx, rects, textes };
}

describe('dessinerDamier', () => {
  it('peint deux rangs, décalés l’un par rapport à l’autre', () => {
    // Un rang seul se lit comme une ligne de pointillés : c'est le reproche
    // exact du PO au filet d'origine.
    const { ctx, rects } = faireContexte();
    dessinerDamier(ctx, 0, 0, 100, 10);
    const rangs = new Set(rects.map((r) => r.y));
    expect(rangs.size).toBe(RANGS_DAMIER);
    const premier = rects.filter((r) => r.y === 0)[0];
    const second = rects.filter((r) => r.y === 10)[0];
    expect(premier.couleur).not.toBe(second.couleur);
  });

  it('ne DÉBORDE jamais de la largeur demandée', () => {
    // Largeur non multiple du carreau : c'est le cas qui déborde.
    const { ctx, rects } = faireContexte();
    dessinerDamier(ctx, 0, 0, 95, 10);
    const droite = Math.max(...rects.map((r) => r.x + r.w));
    expect(droite).toBe(95);
    expect(rects.every((r) => r.w > 0)).toBe(true);
  });

  it('respecte l’origine qu’on lui donne', () => {
    const { ctx, rects } = faireContexte();
    dessinerDamier(ctx, 40, 12, 60, 10);
    expect(Math.min(...rects.map((r) => r.x))).toBe(40);
    expect(Math.min(...rects.map((r) => r.y))).toBe(12);
    expect(Math.max(...rects.map((r) => r.x + r.w))).toBe(100);
  });
});

describe('dessinerSignature', () => {
  it('écrit le nom et l’adresse, et rend la hauteur qu’elle occupe', () => {
    const { ctx, textes, rects } = faireContexte();
    const h = dessinerSignature(ctx, 72, 1000, 936, 'exemple.fr/kartme', true);

    expect(textes.map((t) => t.texte)).toEqual([MARQUE, 'exemple.fr/kartme']);
    expect(h).toBeGreaterThan(0);
    // Tout tient DANS la hauteur annoncée : l'appelant s'en sert pour placer le
    // bloc au-dessus, et une hauteur sous-estimée ferait chevaucher les deux.
    const bas = Math.max(...textes.map((t) => t.y), ...rects.map((r) => r.y + r.h));
    expect(bas).toBeLessThanOrEqual(1000 + h);
  });

  it('aligne l’adresse sur le bord droit du bloc', () => {
    const { ctx, textes } = faireContexte();
    dessinerSignature(ctx, 72, 1000, 936, 'exemple.fr', true);
    expect(textes[1].x).toBe(72 + 936);
  });
});

describe('policeMarque', () => {
  it('nomme la police d’affichage quand elle est chargée', () => {
    expect(policeMarque(64, true)).toContain('Fraunces');
  });

  it('retombe sur une pile GRASSE quand elle ne l’est pas', () => {
    // Sans le `700`, le repli s'écrivait en Georgia maigre : l'image partait
    // signée d'un titre qui n'a plus rien de la marque.
    const repli = policeMarque(64, false);
    expect(repli).not.toContain('Fraunces');
    expect(repli).toContain('700');
  });
});

describe('fichierMarque', () => {
  it('dérive le nom de fichier de la MARQUE', () => {
    // Il est lu (barre de téléchargement, feuille de partage système) : codé en
    // dur ailleurs, il aurait survécu au changement de logo.
    expect(fichierMarque('podium')).toBe(`${MARQUE.toLowerCase()}-podium.png`);
  });
});

describe('le motif est PARTAGÉ', () => {
  it('expose les constantes que le filet d’interface consomme', () => {
    // Les deux damiers avaient divergé — un rang ici, deux là — si bien que
    // l'image partagée ne ressemblait plus au filet de l'application.
    expect(RANGS_DAMIER).toBe(2);
    expect(CARREAUX_DAMIER).toBeGreaterThan(0);
  });
});
