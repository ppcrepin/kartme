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

/**
 * Minuscules, sans accents. Le repli utilisé par toutes nos recherches.
 *
 * La plage est écrite en ÉCHAPPEMENTS (`̀`–`ͯ`, les diacritiques
 * combinants) et non en caractères nus : des marques combinantes sans lettre
 * de base sont invisibles à la relecture et ne survivent ni à une
 * normalisation NFC du fichier, ni à un copier-coller malheureux. Dans un
 * fichier dont la raison d'être est d'empêcher une divergence silencieuse,
 * c'est le minimum.
 */
export function sansAccent(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

/**
 * Forme COLLÉE : replié, puis débarrassé de tout ce qui n'est ni lettre ni
 * chiffre. C'est le miroir exact de `public.kart_normalize` côté serveur.
 *
 * À utiliser dès qu'un filtre client doit trouver les mêmes noms qu'une
 * requête SQL : « sophie k », « Sophie_K » et « sophiek » doivent désigner le
 * même pilote des deux côtés du réseau. Effet de bord utile : `%` et `_`
 * disparaissent, donc une saisie ne peut pas se transformer en joker `LIKE`.
 */
export function formeCollee(input: string): string {
  return sansAccent(input).replace(/[^a-z0-9]/g, '');
}
