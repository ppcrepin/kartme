/**
 * Repliage de texte pour la recherche « à la française ».
 *
 * Personne ne tape « Kévin » avec l'accent dans un champ de recherche, ni
 * « Château » à la bonne casse. Une comparaison brute exclurait donc de la
 * liste exactement les noms qu'on cherche.
 *
 * Le repli ci-dessous existait déjà en deux exemplaires (l'explorateur de
 * kartings, le filtre de pseudos) : c'est le genre de doublon qui finit par
 * diverger silencieusement, et deux champs de recherche qui ne trouvent pas
 * les mêmes noms sont un bug qu'on ne sait plus reproduire.
 */

/** Minuscules, sans accents. Le repli utilisé par toutes nos recherches. */
export function sansAccent(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}
