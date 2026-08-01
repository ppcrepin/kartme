/**
 * LA MARQUE — le seul endroit à toucher quand le logo change.
 *
 * L'image de podium partagée (lot C4) est la première chose que verront des
 * gens qui ne connaissent pas l'application : c'est elle qui porte l'identité.
 * Le logo, lui, doit encore changer (décision PO : « un vrai damier, sur deux
 * rangs », « damier rouge sur fond carbone » — lot C6, en dernier). Tout ce qui
 * dessine la marque vit donc ICI, et nulle part ailleurs : le jour où le logo
 * change, un seul fichier bouge.
 *
 * Rien dans ce module ne dépend de React ni de react-native : ce sont des
 * primitives de dessin sur un contexte 2D, testables telles quelles.
 */
import { colors } from '@/constants/theme';

/** Le nom, tel qu'il s'écrit. */
export const MARQUE = 'KartSquad';

/**
 * Le nom d'un fichier exporté. Il porte la marque, il est LU (barre de
 * téléchargement, feuille de partage système) : il vit donc ici, avec le reste.
 * Codé en dur ailleurs, il aurait survécu au changement de logo.
 */
export function fichierMarque(quoi: string): string {
  return `${MARQUE.toLowerCase()}-${quoi}.png`;
}

/**
 * Le MOTIF du damier, partagé par le filet de l'interface
 * (`components/ui/checkered-rule`) et l'image de podium. Les deux avaient
 * divergé — un rang contre deux, `#3a0f0c` contre le fond carbone — si bien que
 * l'image partagée ne ressemblait plus au filet de l'application.
 */
export const RANGS_DAMIER = 2;
/** Nombre de cases par rang dans le filet d'interface. */
export const CARREAUX_DAMIER = 24;
/** La case « creuse » du filet d'interface : un carbone très légèrement rougi,
 *  qui garde le motif visible sur les fonds de carte comme sur le fond. */
export const CREUX_DAMIER = '#3a0f0c';

/** La police d'affichage, si elle a fini de charger (voir `policeMarque`). */
const FAMILLE_TITRE = 'Fraunces_900Black';

/**
 * Le contexte 2D dont on a besoin. Déclaré ici plutôt qu'importé de `lib.dom` :
 * ce module est aussi compilé pour la cible native, où `CanvasRenderingContext2D`
 * n'existe pas.
 */
export type Contexte2D = {
  fillStyle: string;
  font: string;
  textAlign: 'left' | 'center' | 'right';
  textBaseline: 'top' | 'middle' | 'alphabetic' | 'bottom';
  fillRect: (x: number, y: number, w: number, h: number) => void;
  fillText: (texte: string, x: number, y: number) => void;
  measureText: (texte: string) => { width: number };
};

/**
 * La police d'un texte de marque. Retombe sur une pile générique si Fraunces
 * n'est pas chargée : `canvas` n'attend pas les polices, et un `fillText` lancé
 * trop tôt dessine dans la police par défaut sans prévenir. L'appelant doit
 * avoir attendu `document.fonts.ready` — mais si la police a échoué (réseau
 * coupé), l'image doit rester correcte, juste moins signée.
 */
export function policeMarque(taille: number, disponible: boolean): string {
  return disponible
    ? `${taille}px "${FAMILLE_TITRE}", Georgia, serif`
    : `700 ${taille}px Georgia, "Times New Roman", serif`;
}

/**
 * Le filet damier, sur DEUX rangs (décision PO 2026-08-01).
 *
 * Le filet actuel de l'application n'a qu'un rang, ce qui lui donne l'air d'une
 * ligne de pointillés — « un petit peu trop un logo fin sur ligne droite qui
 * fait penser à des petits pointillés sur lesquels on doit cliquer ». Deux
 * rangs décalés donnent un vrai damier de drapeau.
 *
 * `carreau` est le côté d'une case ; la hauteur totale vaut donc 2 × `carreau`.
 */
export function dessinerDamier(
  ctx: Contexte2D,
  x: number,
  y: number,
  largeur: number,
  carreau: number,
): void {
  const colonnes = Math.ceil(largeur / carreau);
  for (let rang = 0; rang < 2; rang++) {
    for (let col = 0; col < colonnes; col++) {
      // Décalage d'un rang à l'autre : c'est lui qui fait le damier plutôt que
      // deux lignes de tirets superposées.
      const plein = (col + rang) % 2 === 0;
      ctx.fillStyle = plein ? colors.accent : colors.bg;
      const l = Math.min(carreau, x + largeur - (x + col * carreau));
      ctx.fillRect(x + col * carreau, y + rang * carreau, l, carreau);
    }
  }
}

/**
 * La signature en pied d'image : damier, nom, et l'adresse où l'on s'inscrit.
 * Renvoie la hauteur occupée, pour que l'appelant n'ait pas à la deviner.
 */
export function dessinerSignature(
  ctx: Contexte2D,
  x: number,
  y: number,
  largeur: number,
  url: string,
  policeDispo: boolean,
): number {
  const carreau = Math.round(largeur / 36);
  dessinerDamier(ctx, x, y, largeur, carreau);

  const hautNom = y + carreau * 2 + 44;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = policeMarque(52, policeDispo);
  ctx.fillStyle = colors.ink;
  ctx.fillText(MARQUE, x, hautNom);

  // L'adresse est le seul élément UTILE à un inconnu qui voit passer l'image :
  // elle s'aligne à droite, à la même ligne de base, pour ne pas se lire comme
  // une légende du nom.
  ctx.textAlign = 'right';
  ctx.font = `500 30px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.fillStyle = colors.inkDim;
  ctx.fillText(url, x + largeur, hautNom + 18);

  return carreau * 2 + 44 + 62;
}
