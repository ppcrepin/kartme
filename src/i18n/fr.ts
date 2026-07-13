/**
 * Catalogue français — langue de lancement.
 * Toutes les chaînes visibles de l'app passent par ici (socle i18n).
 * Pour ajouter une langue : dupliquer ce fichier (ex. en.ts) et l'enregistrer
 * dans le catalogue de src/i18n/index.ts.
 */
export const fr = {
  app: {
    name: 'KartSquad',
    tagline: 'Le karting entre amis, façon Elo.',
  },
  tabs: {
    races: 'Courses',
    rankings: 'Classements',
    friends: 'Amis',
    profile: 'Profil',
  },
  common: {
    createRace: 'Créer une course',
    cancel: 'Annuler',
    soon: 'Bientôt disponible',
  },
  screens: {
    racesEmpty: 'Aucune course pour le moment. Crée la première !',
    rankingsEmpty: 'Les classements arriveront avec tes premières courses.',
    friendsEmpty: 'Invite tes amis pour lancer la compétition.',
    profileSubtitle: 'Ton Elo, tes grades et tes badges apparaîtront ici.',
  },
  states: {
    success: 'Succès',
    warning: 'Avertissement',
    error: 'Erreur',
    info: 'Information',
  },
  gallery: {
    title: 'Design System',
    subtitle: 'Les briques visuelles de KartSquad (lot 0.2).',
    open: 'Voir le design system',
    typography: 'Typographie',
    buttons: 'Boutons',
    card: 'Carte de course',
    avatars: 'Avatars',
    tags: 'Tags & filtres',
    grades: 'Médaillons de grade',
    gauge: 'Jauge de progression',
    banners: 'Bandeaux d’état',
  },
} as const;
