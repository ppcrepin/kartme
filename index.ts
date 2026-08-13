/**
 * Le point d'entrée NATIF de l'application (le web a le sien : index.web.ts).
 *
 * Deux étages, dans cet ordre strict :
 *   1. la boîte noire — le listener d'erreurs fatales, posé à la première
 *      instruction du bundle ;
 *   2. le SAS (src/components/sas.tsx) — un écran minimal qui se monte seul,
 *      PUIS charge la vraie application dans un try/catch. Après six builds
 *      TestFlight plantés au lancement sans jamais livrer leur message
 *      d'erreur, c'est la seule construction qui ne dépend d'aucun mécanisme
 *      interne de React Native : voir le commentaire du sas.
 *
 * Surtout ne rien importer d'autre ici : chaque import de ce fichier
 * s'exécute AVANT le sas, donc hors de sa protection.
 */
import '@/lib/boite-noire';

import { registerRootComponent } from 'expo';

import { Sas } from '@/components/sas';

registerRootComponent(Sas);
