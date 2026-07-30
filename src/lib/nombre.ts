/**
 * Nombres à la française : séparateur de milliers en espace INSÉCABLE.
 *
 * « 1200 m » et « 128400 » s'affichaient collés, alors que la fiche circuit
 * promet « 1 200 m × 8 m » dans son propre commentaire. Un chiffre à cinq ou
 * six positions sans séparateur se relit lettre à lettre.
 *
 * `toLocaleString('fr-FR')` est écarté volontairement : il rend selon l'ICU
 * embarquée, qui varie d'un moteur à l'autre (espace fine insécable U+202F sur
 * un Chromium récent, espace insécable U+00A0 ailleurs, espace ordinaire dans
 * un Hermes compilé sans ICU) — donc un affichage qui change de forme selon
 * l'appareil, et une césure de ligne possible au milieu d'un nombre là où
 * l'espace n'est pas insécable.
 */
const INSECABLE = ' ';

/** Formate un entier : `1200` → « 1 200 ». Les décimales sont conservées. */
export function nombreFr(n: number): string {
  if (!Number.isFinite(n)) return '—';
  const negatif = n < 0;
  const [entier, decimales] = Math.abs(n).toString().split('.');
  // Groupes de trois depuis la DROITE.
  const groupe = entier.replace(/\B(?=(\d{3})+(?!\d))/g, INSECABLE);
  return `${negatif ? '-' : ''}${groupe}${decimales ? `,${decimales}` : ''}`;
}

/**
 * Accord d'un nom avec son nombre : `pluriel(1, 'course')` → « 1 course »,
 * `pluriel(2, 'course')` → « 2 courses ».
 *
 * Remplace les libellés en « %n course(s) », dont la parenthèse était VISIBLE
 * par l'utilisateur au milieu d'une phrase (« encore 2 course(s) »). En
 * français, 0 et 1 prennent le singulier.
 */
export function pluriel(n: number, singulier: string, plurielForce?: string): string {
  const mot = Math.abs(n) >= 2 ? (plurielForce ?? `${singulier}s`) : singulier;
  return `${nombreFr(n)} ${mot}`;
}
