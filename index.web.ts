/**
 * Le point d'entrée WEB : l'entrée officielle d'expo-router, sans détour.
 *
 * Le sas de lancement (index.ts) est un dispositif de diagnostic NATIF —
 * le web n'a jamais planté, son rendu statique (une page HTML par route)
 * repose sur cette entrée-là, et l'y intercaler ne ferait que dégrader ce
 * qui fonctionne. Metro choisit ce fichier pour la plateforme web par
 * l'extension `.web.ts`, exactement comme pour les composants.
 */
import 'expo-router/entry';
