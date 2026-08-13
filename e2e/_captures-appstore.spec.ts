import { test } from '@playwright/test';

import { reseauSimule, sessionSimulee, UID } from './harness';

/**
 * Captures d'écran App Store (campagne, hors suite : préfixe `_`).
 *
 * Apple exige des captures au format « iPhone 6,5 pouces » — 1284 × 2778 —
 * alors que l'iPhone du PO produit du 1170 × 2532. L'interface étant le même
 * code sur web et natif, on met en scène un compte de démonstration réaliste
 * (données simulées via le harnais des tests) et on photographie chaque écran
 * à la taille logique 428 × 926 avec un facteur d'échelle 3.
 *
 * Lancement :
 *   npx playwright test -c playwright.captures.config.ts
 * Sortie : captures-appstore/*.png
 */

const MOI = 'Julien_R';

const PROFIL_MOI = {
  id: UID,
  username: MOI,
  elo: 1284,
  races: 14,
  deleted_at: null,
  avatar_path: null,
  is_private: false,
};

const CLASSEMENT = [
  { rank: 1, profile_id: 'u2', ghost_id: null, username: 'Sophie_K', elo: 1352, races: 17, is_me: false, avatar_path: null },
  { rank: 2, profile_id: UID, ghost_id: null, username: MOI, elo: 1284, races: 14, is_me: true, avatar_path: null },
  { rank: 3, profile_id: 'u3', ghost_id: null, username: 'Mehdi_31', elo: 1247, races: 12, is_me: false, avatar_path: null },
  { rank: 4, profile_id: 'u4', ghost_id: null, username: 'Camille', elo: 1198, races: 9, is_me: false, avatar_path: null },
  { rank: 5, profile_id: 'u5', ghost_id: null, username: 'Antoine_74', elo: 1141, races: 11, is_me: false, avatar_path: null },
  { rank: 6, profile_id: 'u6', ghost_id: null, username: 'Lena', elo: 1102, races: 7, is_me: false, avatar_path: null },
  { rank: 7, profile_id: null, ghost_id: 'g1', username: 'Tonton Gégé', elo: 1034, races: 5, is_me: false, avatar_path: null },
  { rank: 8, profile_id: 'u8', ghost_id: null, username: 'Marco', elo: 987, races: 4, is_me: false, avatar_path: null },
];

const maintenant = Date.now();
const item = (n: number, extra: Record<string, unknown>) => ({
  at: new Date(maintenant - n * 36e5).toISOString(),
  actor_id: `a${n}`,
  actor_username: `Pilote${n}`,
  actor_avatar_path: null,
  race_id: null,
  circuit_id: null,
  circuit_name: null,
  scheduled_at: null,
  pilots_count: null,
  guests_count: null,
  winner_username: null,
  my_position: null,
  my_elo_delta: null,
  badge_key: null,
  band_from: null,
  band_to: null,
  elo: null,
  ...extra,
});

const FIL = [
  item(1, {
    kind: 'race_upcoming', actor_username: 'Sophie_K', race_id: 'r9',
    circuit_name: 'Sologne Karting', scheduled_at: new Date(maintenant + 2 * 864e5).toISOString(),
  }),
  item(2, {
    kind: 'race_result', actor_username: MOI, race_id: 'r8',
    circuit_name: 'Circuit Beltoise-Trappes', winner_username: MOI, my_position: 1, my_elo_delta: 18,
    pilots_count: 6, guests_count: 1,
  }),
  item(3, { kind: 'badge_friend', actor_username: 'Mehdi_31', badge_key: 'champagne' }),
  item(5, { kind: 'grade_friend', actor_username: 'Camille', band_from: 4, band_to: 3, elo: 1198 }),
];

const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const COURSE_FINIE = {
  id: 'r1',
  admin_id: UID,
  circuit_id: 'c1',
  scheduled_at: new Date(maintenant - 3 * 36e5).toISOString(),
  status: 'completed',
  invite_token: 'tok-1',
  completed_at: new Date(maintenant - 2 * 36e5).toISOString(),
  circuit: CIRCUIT,
};

const p = (id: string, profileId: string | null, username: string, elo: number) => ({
  id,
  profile_id: profileId,
  ghost_id: profileId ? null : 'g1',
  profile: profileId ? { username, elo, races: 10, avatar_path: null } : null,
  ghost: profileId ? null : { display_name: username, elo },
});

const PARTICIPANTS = [
  p('p1', UID, MOI, 1284),
  p('p2', 'u2', 'Sophie_K', 1352),
  p('p3', 'u3', 'Mehdi_31', 1247),
  p('p4', 'u4', 'Camille', 1198),
  p('p5', null, 'Tonton Gégé', 1034),
];

const r = (
  pid: string,
  position: number,
  eloBefore: number,
  eloAfter: number,
  lap: number | null,
  participation: (typeof PARTICIPANTS)[number],
) => ({
  participation_id: pid,
  position,
  elo_before: eloBefore,
  elo_after: eloAfter,
  elo_delta: eloAfter - eloBefore,
  best_lap_ms: lap,
  dnf: false,
  participation: {
    profile_id: participation.profile_id,
    profile: participation.profile ? { username: participation.profile.username, avatar_path: null } : null,
    ghost: participation.ghost ? { display_name: participation.ghost.display_name } : null,
  },
});

const RESULTATS = [
  r('p1', 1, 1266, 1284, 46012, PARTICIPANTS[0]),
  r('p2', 2, 1361, 1352, 46381, PARTICIPANTS[1]),
  r('p3', 3, 1240, 1247, 47053, PARTICIPANTS[2]),
  r('p4', 4, 1204, 1198, 47740, PARTICIPANTS[3]),
  r('p5', 5, 1041, 1034, null, PARTICIPANTS[4]),
];

const CIRCUITS = [
  { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true, lat: 47.36013, lon: 2.04984, km: 4.2 },
  { id: 'c2', name: 'Circuit Beltoise-Trappes', city: 'Trappes', is_official: true, lat: 48.75988, lon: 1.99302, aliases: 'BRK · Beltoise Racing Kart', km: 11.8 },
  { id: 'c3', name: 'Kart Racer', city: 'Saran', is_official: true, lat: 47.95802, lon: 1.89454, km: 24.6 },
  { id: 'c4', name: 'Racing Kart de Cormeilles', city: 'Cormeilles-en-Vexin', is_official: true, lat: 49.10933, lon: 2.03514, km: 31.2 },
  { id: 'c5', name: 'Le Karting', city: 'Nantes', is_official: true, lat: 47.20078, lon: -1.57094, km: 58.9 },
  { id: 'c6', name: 'Karting de Salbris Sud', city: 'Salbris', is_official: true, lat: 47.34, lon: 2.05, km: 74.3 },
];

const HISTORIQUE_ELO = [1000, 1016, 1041, 1029, 1072, 1108, 1145, 1131, 1178, 1203, 1241, 1266, 1259, 1284].map(
  (elo, i) => ({
    elo,
    dnf: false,
    created_at: new Date(maintenant - (14 - i) * 6 * 864e5).toISOString(),
    race: { scheduled_at: new Date(maintenant - (14 - i) * 6 * 864e5).toISOString() },
  }),
);

const BADGES = ['kart_didentite', 'habitue_stands', 'champagne', 'chapeaux_de_roues', 'chef_ecurie', 'sous_tension'].map(
  (badge_key, i) => ({
    badge_key,
    unlocked_at: new Date(maintenant - (8 - i) * 5 * 864e5).toISOString(),
    race_id: 'r1',
  }),
);

/**
 * Historique de courses (écran Profil : tuiles Courses/Victoires/Podiums et
 * section « Mes courses »). Sans lui, le profil affichait « 0 course » sous
 * une courbe de quatorze points — incohérence indigne d'une capture de vitrine.
 */
const NOMS_CIRCUITS = ['Sologne Karting', 'Circuit Beltoise-Trappes', 'Kart Racer', 'Le Karting'];
const HISTORIQUE_COURSES = HISTORIQUE_ELO.map((h, i) => ({
  position: [2, 1, 3, 4, 1, 2, 5, 3, 1, 2, 3, 1, 4, 1][i],
  dnf: false,
  elo_delta: i === 0 ? 0 : HISTORIQUE_ELO[i].elo - HISTORIQUE_ELO[i - 1].elo,
  elo_after: h.elo,
  race: {
    id: `h${i}`,
    scheduled_at: h.race.scheduled_at,
    circuit: { name: NOMS_CIRCUITS[i % NOMS_CIRCUITS.length] },
  },
  participation: { profile_id: UID },
})).reverse();

/** Réponses communes : compteurs discrets, profil, badges. */
const COMMUN = {
  'rest/v1/results': HISTORIQUE_COURSES,
  'rpc/get_leaderboard': CLASSEMENT,
  'rpc/get_my_rank': [{ rank: 2, elo: 1284, races: 14, total: 8 }],
  'rpc/unread_feed_count': 2,
  'rpc/unread_notifications_count': 0,
  'rpc/list_notifications': [],
  'rpc/get_feed': FIL,
  'rest/v1/user_badges': BADGES,
  'rest/v1/elo_history': HISTORIQUE_ELO,
  'rest/v1/profiles': PROFIL_MOI,
};

test.use({ viewport: { width: 428, height: 926 }, deviceScaleFactor: 3 });

async function capturer(
  page: import('@playwright/test').Page,
  chemin: string,
  attendreMs: number,
  fichier: string,
  extra: Record<string, unknown> = {},
) {
  await sessionSimulee(page);
  await reseauSimule(page, { ...COMMUN, ...extra });
  await page.goto(chemin);
  await page.waitForTimeout(attendreMs);
  await page.screenshot({ path: `captures-appstore/${fichier}`, fullPage: false });
}

test('01 — classement', async ({ page }) => {
  await capturer(page, '/classements', 4000, '01-classement.png');
});

test('02 — accueil et fil', async ({ page }) => {
  await capturer(page, '/', 4000, '02-accueil.png');
});

test('03 — course terminée (podium)', async ({ page }) => {
  await capturer(page, '/race/r1', 4000, '03-course.png', {
    'rest/v1/races': COURSE_FINIE,
    'rest/v1/participations': PARTICIPANTS,
    'rest/v1/results': RESULTATS,
  });
});

test('04 — profil (courbe Elo)', async ({ page }) => {
  await capturer(page, '/profil', 4000, '04-profil.png');
});

test('05 — circuits', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    ...COMMUN,
    'rpc/nearby_circuits': CIRCUITS,
    'rpc/my_recent_circuits': [CIRCUITS[0]],
  });
  // VUE LISTE, pas la carte : le réseau de l'environnement bloque les tuiles
  // OpenStreetMap (carte noire), et la carte web ne ressemble de toute façon
  // pas à celle de l'iPhone (Plans d'Apple) — une capture de la liste est
  // fidèle aux DEUX plateformes.
  await page.goto('/kartings');
  await page.getByText('Liste', { exact: true }).first().click({ timeout: 20_000 });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: 'captures-appstore/05-circuits.png', fullPage: false });
});

test('06 — badges', async ({ page }) => {
  await capturer(page, '/badges', 4000, '06-badges.png');
});
