/**
 * KartSquad — jetons de design "Editorial Grand Prix / Rosso Corsa".
 * Source de vérité visuelle : docs/cahier-des-charges.md §9 et docs/ecrans-complets.html.
 * Thème sombre unique au lancement (pas de mode clair).
 */

/** Voir `colors.accentTexte` — sorti du littéral pour servir aussi aux grades. */
const accentTexteBrut = '#ff5c45';

export const colors = {
  bg: '#0a0706', // fond principal (noir chaud)
  bgVignette: '#241210', // halo radial haut
  surface: '#171110', // cartes
  surface2: '#1f1613',
  line: '#2c1f1c', // séparateurs / bordures
  line2: '#3a2a25', // bordures accentuées
  ink: '#f2ede9', // texte principal (blanc cassé chaud)
  inkDim: '#a08d87', // texte secondaire
  // Texte discret. Éclairci de #8a746d, qui donnait 4,06 à 4,27:1 selon le
  // fond — sous le seuil AA de 4,5 alors qu'il porte des choses qui comptent :
  // le « ✕ » de retrait d'un pilote, le marqueur « ABD » d'un abandon, les
  // chevrons de navigation. Reste nettement en retrait de `inkDim`.
  inkDim2: '#957f76',
  accent: '#e10600', // Rosso Corsa (marque) — APLATS : fonds, bordures, pastilles
  /**
   * Le même rouge, éclairci, réservé au TEXTE posé sur fond sombre.
   *
   * `#e10600` plafonne à 3,6:1 sur nos cartes, là où la norme AA en demande
   * 4,5 sous 18,7 px. Ce n'est pas un détail de conformité : le rouge saturé
   * sur carbone est ce qui se lit le plus mal en plein soleil — au bord d'une
   * piste, précisément. Et pour qui distingue mal le rouge, un lien de 13 px
   * dans cette teinte disparaît purement et simplement.
   *
   * Arbitrage PO 2026-08-01 : la marque ne bouge PAS là où on la voit
   * (boutons pleins, pastilles sélectionnées, épingles, courbe Elo) — seule
   * la teinte du texte rouge change. 5,8 à 6,6:1 selon le fond.
   */
  accentTexte: accentTexteBrut,
  pos: '#6fae82', // gain d'Elo (toujours doublé d'un signe ▲/+)
  gold: '#e2c14d', // liseré premium / focus
} as const;

/**
 * États sémantiques — distincts du rouge de marque (#e10600).
 * L'erreur est en rose-corsa pour ne jamais se confondre avec la marque.
 * Règle d'accessibilité : toujours doublés d'une icône/signe, jamais la couleur seule.
 */
export const states = {
  ok: '#5fb27d', // succès
  warn: '#e9a23b', // avertissement
  err: '#ff3d71', // erreur (rose-corsa)
  info: '#5b9bd5', // information
} as const;

/**
 * Rampe de couleur des 6 grades (du plus bas au plus haut) :
 * minéral → métal → chaleur. L'apex (Légende) porte le rouge de la marque.
 */
export const gradeColors = {
  kartambolage: '#a89c8f', // pierre
  roueLibre: '#b9793f', // bronze
  rookie: '#cfd4d8', // argent
  missile: '#ecc63f', // jaune
  fusee: '#ef7f27', // orange
  legende: '#e10600', // rouge (marque) — APLAT du médaillon
} as const;

/**
 * Les mêmes couleurs de grade, en version TEXTE.
 *
 * Cinq des six passent le seuil AA telles quelles (5,2 à 13,4:1) ; « Légende »
 * porte le rouge de marque et plafonne à 3,76:1. Ce n'est pas un cas de niche
 * réservé aux 2100 Elo : l'écran « Grades » liste les six paliers, nommés dans
 * leur couleur, à TOUT LE MONDE — c'est le nom du grade le plus convoité de
 * l'app qui était le moins lisible.
 *
 * Le médaillon (`GradeMedal`) garde `gradeColors` : c'est un aplat, et il doit
 * rester du Rosso Corsa.
 */
export const gradeTextColors = {
  ...gradeColors,
  legende: accentTexteBrut,
} as const;

/**
 * OR, ARGENT, BRONZE — les rangs 1, 2 et 3, partout où un rang s'affiche
 * (décision PO 2026-08-01 : « le premier en or, deuxième en argent, troisième
 * en bronze, dès qu'il y a un classement »).
 *
 * Un podium se lit à la couleur avant de se lire au chiffre : c'est le seul
 * repère qui survit à un coup d'œil de trois dixièmes de seconde sur une liste
 * de vingt lignes. Les trois teintes étaient déjà dans l'image de podium
 * partagée — elles vivent ici pour que l'écran et l'image ne divergent pas.
 *
 * Sur le carbone : 10,4:1, 11,6:1 et 5,6:1. Le bronze est le plus juste et
 * reste au-dessus du seuil AA.
 */
export const podiumColors = ['#e2c14d', '#cfd4d8', '#c1793f'] as const;

/**
 * Le VERT du karting électrique (C13, décision PO 2026-08-01 : promouvoir ces
 * circuits). Il ne sert qu'à ça — c'est la seule teinte de l'application qui
 * désigne une CATÉGORIE de piste, et pas un état ou un niveau.
 *
 * Il est toujours accompagné d'un éclair, jamais employé seul : entre ce vert
 * et le rouge de marque, un daltonien deutéranope ne voit qu'une nuance.
 */
export const electriqueColor = '#3ddc84';

/**
 * La couleur d'un rang, ou `null` au-delà du podium — `null` et non une teinte
 * neutre : l'appelant garde ainsi SA couleur par défaut, qui n'est pas la même
 * sur une liste de classement et sur une pastille pleine.
 */
export function couleurRang(rang: number): string | null {
  return podiumColors[rang - 1] ?? null;
}

export const radius = {
  sharp: 3, // angles nets (cartes, champs, médailles)
  card: 10, // cartes du design system
  pill: 999, // boutons d'action
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

export const fonts = {
  // Fraunces (serif d'affichage, OFL) via @expo-google-fonts/fraunces.
  serif: 'Fraunces_700Bold', // titres
  serifBlack: 'Fraunces_900Black', // gros titres / médaillons
  sans: 'System', // labels, boutons, texte courant
} as const;
