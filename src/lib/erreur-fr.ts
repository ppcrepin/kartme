/**
 * L'application est exclusivement en français : aucune chaîne technique
 * anglaise ne doit atteindre l'écran.
 *
 * Nos fonctions SQL lèvent des exceptions MÉTIER déjà rédigées en français
 * (« Ce pilote n'est plus joignable. ») : elles passent telles quelles, et
 * c'est voulu — elles disent précisément ce qui bloque. Un refus TECHNIQUE de
 * Postgres ou de PostgREST, lui, sort en anglais brut (« permission denied for
 * function get_metrics », « new row violates row-level security policy ») et
 * n'apprend rien à un pilote.
 *
 * Le filtre vivait recopié dans trois écrans, avec TROIS listes de motifs
 * différentes — celui du tableau de bord n'en avait aucune et affichait
 * l'anglais mot pour mot. Un seul endroit, désormais.
 */

/** Motifs des erreurs techniques que Postgres/PostgREST rendent en anglais. */
const TECHNIQUE =
  /row-level security|permission denied|violates|duplicate key|invalid input|syntax error|does not exist|null value|out of range|deadlock|could not|failed to fetch|networkerror|jwt|function .* does not/i;

/**
 * Rend le message à afficher : celui du serveur s'il est déjà en français,
 * sinon le repli fourni.
 *
 * @param repli phrase française à servir quand le message est technique — donc
 *   propre à l'écran appelant, qui seul sait quoi proposer ensuite.
 */
export function messageFr(e: unknown, repli: string): string {
  const m = e instanceof Error ? e.message.trim() : '';
  if (!m) return repli;
  // Un message sans une seule lettre accentuée NI un mot-outil français est
  // presque sûrement anglais, même s'il échappe à la liste ci-dessus : cette
  // seconde barrière évite qu'un futur message de la bibliothèque cliente
  // passe faute d'avoir été prévu.
  const semblePasFrancais = !/[àâçéèêëîïôùûüœ]|\b(le|la|les|un|une|des|ce|cette|tu|ton|ta|pas|plus|déjà|trop)\b/i.test(m);
  return TECHNIQUE.test(m) || semblePasFrancais ? repli : m;
}
