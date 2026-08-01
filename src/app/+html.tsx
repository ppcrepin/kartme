import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { MARQUE } from '@/lib/marque';

/**
 * L'enveloppe HTML de chaque page exportée en statique (convention
 * expo-router). Elle ne s'exécute JAMAIS côté client : c'est un gabarit de
 * construction.
 *
 * Elle existe pour trois raisons, toutes liées au lot du logo (C6) :
 *
 *   1. Le MANIFESTE. Sans lui, « ajouter à l'écran d'accueil » sous Chrome
 *      retombe sur le favicon — 48 px — et pose une icône floue sur l'écran
 *      d'accueil, alors qu'une image de 512 px existe.
 *   2. L'icône iOS. Sans `apple-touch-icon`, Safari met une CAPTURE DE LA PAGE
 *      sur l'écran d'accueil. C'est le pire des cas : l'application y perd
 *      toute identité.
 *   3. `theme-color`, qui teinte la barre du navigateur en carbone au lieu du
 *      blanc par défaut — sur une application entièrement sombre, la bande
 *      blanche en haut se voit.
 *
 * Le sous-chemin de déploiement (`/kartme` sous GitHub Pages) est injecté à la
 * CONSTRUCTION : les chemins absolus nus mèneraient à la racine du domaine.
 */
const BASE = (process.env.EXPO_BASE_URL ?? '').replace(/\/$/, '');

export default function Html({ children }: PropsWithChildren) {
  return (
    <html lang="fr">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/* `viewport-fit=cover` : l'application peint son propre fond jusque
            sous l'encoche, et `SafeAreaView` gère les marges. */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />
        {/* Sans lui, l'onglet du navigateur affiche l'URL brute. C'est le même
            centimètre carré que le favicon : le nom et la marque s'y jouent
            ensemble, et une adresse GitHub Pages y fait amateur. Les écrans qui
            posent leur propre titre le remplacent ; celui-ci est le défaut. */}
        <title>{MARQUE}</title>
        <meta name="theme-color" content="#0a0706" />
        <link rel="manifest" href={`${BASE}/manifest.webmanifest`} />
        <link rel="apple-touch-icon" href={`${BASE}/icone-192.png`} />

        {/* Fond posé AVANT le premier rendu : sans lui, la page apparaît en
            blanc le temps du chargement du bundle, sur une application dont
            tous les écrans sont carbone. */}
        <style dangerouslySetInnerHTML={{ __html: `body{background-color:#0a0706}` }} />

        {/* Sans ceci, le défilement du corps casse celui des `ScrollView`
            (recommandation expo-router). */}
        <ScrollViewStyleReset />
      </head>
      <body>{children}</body>
    </html>
  );
}
