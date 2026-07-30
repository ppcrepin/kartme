/**
 * Déclare les imports de feuilles de style pour TypeScript.
 *
 * `import 'leaflet/dist/leaflet.css'` (carte des kartings) est un import « à
 * effet de bord » : il ne rend aucune valeur, il demande au bundler d'inclure
 * la feuille. TypeScript exige quand même de savoir à quoi correspond le
 * chemin, faute de quoi il lève TS2882.
 *
 * ── Pourquoi ce fichier existe, alors que tout passait ────────────────────
 * La déclaration venait jusqu'ici de `expo-env.d.ts`, qui référence
 * `expo/types`. Or ce fichier est GÉNÉRÉ par Expo et volontairement ignoré par
 * git (Expo le recommande, et son propre en-tête le dit). Il existe donc sur
 * une machine où le serveur de développement a déjà tourné, et NULLE PART
 * ailleurs — en particulier pas sur un exécutant d'intégration continue, qui
 * part d'un dépôt propre.
 *
 * Le typage ne tenait donc qu'à un artefact local. Cela n'a jamais été visible
 * parce que la CI ne se déclenchait pas sur la branche de travail : sa
 * première exécution a échoué là-dessus, sur du code que personne n'avait
 * touché depuis des semaines.
 *
 * Une déclaration VERSIONNÉE ferme le sujet : elle ne dépend d'aucune
 * génération, elle vaut pour tout le monde, et elle survit à un
 * `git clean -xfd`.
 */

declare module '*.css';
