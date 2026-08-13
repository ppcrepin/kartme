import { ReactNode, useSyncExternalStore } from 'react';

/**
 * Portail de la feuille NATIVE — le remplaçant du `Modal` de React Native.
 *
 * Pourquoi il existe : sur iOS (builds TestFlight 8 à 11), fermer une feuille
 * portée par le `Modal` natif faisait renaître l'application entière — arbre
 * React neuf, session relue trop tôt, pilote éjecté vers l'écran de
 * connexion. Sans rapport de plantage, sans sortie visible de l'app : le
 * journal de session (N9) a établi les renaissances, le PO a établi qu'aucun
 * fichier de plantage n'existait. On cesse donc de confier nos fenêtres au
 * composant natif : la feuille devient une simple vue superposée, dessinée
 * par nous.
 *
 * Pour passer PAR-DESSUS la barre d'onglets (la raison d'être du Modal
 * d'origine), la vue doit vivre À LA RACINE de l'arbre, pas dans l'écran
 * appelant. D'où ce portail : `Sheet` publie son contenu, `HotePortail` —
 * monté une fois dans `_layout`, après le navigateur — le rend au-dessus de
 * tout.
 *
 * UNE seule feuille à la fois : c'est déjà le cas partout dans l'app, et un
 * empilement de feuilles serait un problème de conception, pas de portail.
 */

let contenu: ReactNode = null;
/**
 * Qui a publié le contenu affiché. L'écran de course monte DEUX <Sheet>
 * (ajout de pilote, partage QR) : sans propriétaire, la feuille FERMÉE qui
 * se re-rend effaçait la feuille OUVERTE de l'autre. Une feuille ne peut
 * effacer que SA propre publication.
 */
let proprietaire: symbol | null = null;
const abonnes = new Set<() => void>();

export function publierFeuille(qui: symbol, n: ReactNode): void {
  contenu = n;
  proprietaire = qui;
  for (const a of abonnes) a();
}

export function effacerFeuille(qui: symbol): void {
  if (proprietaire !== qui) return;
  contenu = null;
  proprietaire = null;
  for (const a of abonnes) a();
}

function sAbonner(signal: () => void): () => void {
  abonnes.add(signal);
  return () => {
    abonnes.delete(signal);
  };
}

function instantane(): ReactNode {
  return contenu;
}

export function HotePortail() {
  const noeud = useSyncExternalStore(sAbonner, instantane, instantane);
  return noeud ? <>{noeud}</> : null;
}
