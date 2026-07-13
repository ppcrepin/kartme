/**
 * KartSquad — jetons de design "Editorial Grand Prix / Rosso Corsa".
 * Source de vérité visuelle : docs/cahier-des-charges.md §9 et docs/ecrans-complets.html.
 * Thème sombre unique au lancement (pas de mode clair).
 */

export const colors = {
  bg: '#0a0706', // fond principal (noir chaud)
  bgVignette: '#241210', // halo radial haut
  surface: '#171110', // cartes
  surface2: '#1f1613',
  line: '#2c1f1c', // séparateurs / bordures
  line2: '#3a2a25', // bordures accentuées
  ink: '#f2ede9', // texte principal (blanc cassé chaud)
  inkDim: '#a08d87', // texte secondaire
  inkDim2: '#8a746d', // texte discret
  accent: '#e10600', // Rosso Corsa (marque)
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
  legende: '#e10600', // rouge (marque)
} as const;

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
