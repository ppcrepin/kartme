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
  ink: '#f2ede9', // texte principal (blanc cassé chaud)
  inkDim: '#a08d87', // texte secondaire
  inkDim2: '#9c8880', // texte discret
  accent: '#e10600', // Rosso Corsa
  pos: '#6fae82', // gain d'Elo (toujours doublé d'un signe ▲/+)
  gold: '#e2c14d', // apex (Légende du Bitume, médaille d'or)
} as const;

/** Rampe de couleur des 6 grades (du plus bas au plus haut). */
export const gradeColors = {
  kartambolage: '#b06a5c',
  roueLibre: '#c6503f',
  rookie: '#e10600',
  missile: '#f0561f',
  fusee: '#f39a24',
  legende: '#e2c14d',
} as const;

export const radius = {
  sharp: 3, // angles nets (cartes, champs, médailles)
  pill: 999, // boutons d'action
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
} as const;

export const fonts = {
  // Placeholders — la police serif définitive sous licence est un point ouvert (cahier §16.2 / E2).
  serif: 'Georgia',
  sans: 'System',
} as const;
