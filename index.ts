/**
 * Le point d'entrée de l'application. Ce fichier existe pour UNE raison :
 * installer la boîte noire AVANT tout le reste.
 *
 * Avec `"main": "expo-router/entry"`, le premier code applicatif à s'exécuter
 * était `src/app/_layout.tsx` — mais expo-router et ses dépendances
 * (reanimated, worklets, gesture-handler, screens…) s'initialisent AVANT lui.
 * Une erreur fatale dans cette zone échappait à tous les filets : builds 3,
 * 4 et 5, trois plantages muets au lancement, l'alerte de la boîte noire
 * jamais affichée. Certaines de ces bibliothèques lèvent précisément ce
 * genre d'erreur à l'import quand leur partie native manque — par exemple
 * react-native-worklets : « Native part of Worklets doesn't seem to be
 * initialized » (NativeWorklets.native.js, constructeur).
 *
 * Ici, la boîte noire s'enregistre à la PREMIÈRE instruction du bundle :
 * il ne reste plus une seule ligne de JavaScript applicatif ou de
 * bibliothèque hors de sa portée. (Le cœur de React Native lui-même reste
 * hors champ, mais ses erreurs à lui produisent des rapports natifs lisibles.)
 */
import '@/lib/boite-noire';
import 'expo-router/entry';
