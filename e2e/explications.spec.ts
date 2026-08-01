import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * C2 — « je ne comprends pas ce que valent les grades » (test utilisateur du
 * 2026-08-01). Le savoir existait, mais sur un écran à deux taps du profil et
 * invisible depuis le classement. Ces tests vérifient qu'il est désormais là
 * où la question se pose : sous le médaillon lui-même.
 */
const MOI = { id: UID, username: 'Moi', elo: 1210, races: 6, deleted_at: null, avatar_path: null };

test.use({ viewport: { width: 390, height: 844 } });

test('taper son médaillon explique le grade, et ce qui reste à faire', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/profiles': MOI });
  await page.goto('/profil');

  const medaille = page.getByRole('button', { name: /voir ce que vaut ce grade/ }).first();
  await expect(medaille).toBeVisible({ timeout: 20_000 });

  // 44 px : `hitSlop` est inerte sur `Pressable` en react-native-web, et le
  // médaillon du profil n'en fait que 42.
  const b = await medaille.boundingBox();
  expect(b && b.width >= 44 && b.height >= 44).toBeTruthy();

  await medaille.click();

  // Rookie = 1000–1299, Missile des Stands démarre à 1300 : à 1210 il reste
  // 90 points. La fiche doit dire les trois.
  await expect(page.getByText('Elo 1000 – 1299').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Ton Elo : 1210').first()).toBeVisible();
  await expect(page.getByText(/Encore 90 points avant Missile des Stands/).first()).toBeVisible();

  // L'échelle entière est DANS la feuille : un lien « voir l'échelle » aurait
  // fait changer d'onglet depuis le classement, le défaut corrigé au lot C1.
  await expect(page.getByText('Les six grades').first()).toBeVisible();
  await expect(page.getByText('Légende du Bitume').first()).toBeVisible();

  await page.getByLabel('Fermer').first().click();
  await expect(page.getByText('Les six grades')).toHaveCount(0);
});

test('la fiche d’un badge s’ouvre DEVANT les yeux, pas sous la grille', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/user_badges': [
      { badge_key: 'kart_didentite', unlocked_at: '2026-07-14T10:00:00Z', race_id: null },
    ],
    'rest/v1/profiles': MOI,
  });
  await page.goto('/badges');

  const premier = page.getByRole('button', { name: /Kart d’identité/ }).first();
  await expect(premier).toBeVisible({ timeout: 20_000 });
  await premier.click();

  // Le détail vivait dans une carte SOUS une grille de douze cellules : taper
  // un badge de la première rangée ne montrait rien sans défiler. On tapait,
  // il ne se passait « rien ». La feuille se pose forcément dans le cadre.
  const condition = page.getByText('Jouer sa première course.').first();
  await expect(condition).toBeVisible({ timeout: 10_000 });
  // En attente ACTIVE, et non une mesure unique : la feuille monte de 80 px en
  // 220 ms, si bien qu'une mesure prise pendant le glissement la trouve encore
  // sous le bord — vert en solo, rouge dans la campagne complète, pour une
  // raison qui n'a rien à voir avec le défaut testé.
  await expect
    .poll(async () => {
      const b = await condition.boundingBox();
      return b ? b.y >= 0 && b.y + b.height <= 844 : false;
    }, { timeout: 5_000 })
    .toBe(true);

  await expect(page.getByText(/Décroché le/).first()).toBeVisible();
});

test('un badge NON décroché dit comment le décrocher', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/user_badges': [], 'rest/v1/profiles': MOI });
  await page.goto('/badges');

  const cible = page.getByRole('button', { name: /Champagne/ }).first();
  await expect(cible).toBeVisible({ timeout: 20_000 });
  await cible.click();

  await expect(page.getByText('Remporter sa première victoire.').first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(page.getByText('Pas encore décroché.').first()).toBeVisible();
});

test('dans une LIGNE tapable, le médaillon ne vole pas le tap', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': [
      { rank: 1, profile_id: 'u2', ghost_id: null, username: 'Sophie_K', elo: 1330, races: 9, is_me: false, avatar_path: null },
    ],
    'rpc/get_my_rank': [{ rank: 1, elo: 1210, races: 6, total: 1 }],
  });
  await page.goto('/classements');

  const ligne = page.getByRole('button', { name: /Sophie_K/ }).first();
  await expect(ligne).toBeVisible({ timeout: 20_000 });

  // Un bouton DANS un bouton aurait rendu le classement à nouveau « pas
  // cliquable » — l'affordance qu'un testeur cherchait sans la trouver. Le
  // médaillon n'est explicable que là où il est seul.
  await expect(page.getByRole('button', { name: /voir ce que vaut ce grade/ })).toHaveCount(0);

  const medaille = ligne.getByText('MS').first();
  await expect(medaille).toBeVisible();
  await medaille.click();
  await expect(page).toHaveURL(/pilot\/u2/, { timeout: 15_000 });
});

test('la jauge du profil annonce le seuil à atteindre', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/profiles': MOI });
  await page.goto('/profil');
  await expect(page.getByText('Moi', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });

  // « plus que 90 » ne disait pas 90 vers QUOI : il manquait le chiffre du
  // palier (retour de test — « la jauge mériterait des repères »).
  await expect(page.getByText(/Encore 90 pts/).first()).toBeVisible();
  await expect(page.getByText(/à partir de 1300/).first()).toBeVisible();
});
