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

// Écran COURT, et badge de la DERNIÈRE rangée : le premier jet visait le
// premier badge sur 844 px de haut, où l'ancienne carte de détail tombait
// encore dans le cadre — il serait passé au vert AVANT la correction, donc il
// ne prouvait rien (relevé par la relecture adversariale). Ici l'ancienne
// carte, dessinée sous douze cellules, était hors de portée par construction.
test.describe(() => {
  test.use({ viewport: { width: 390, height: 568 } });

  test('la fiche d’un badge s’ouvre DEVANT les yeux, pas sous la grille', async ({ page }) => {
    await sessionSimulee(page);
    await reseauSimule(page, {
      'rest/v1/user_badges': [{ badge_key: 'push', unlocked_at: '2026-07-14T10:00:00Z', race_id: null }],
      'rest/v1/profiles': MOI,
    });
    await page.goto('/badges');

    // « Push » est le douzième et dernier badge de la grille.
    const dernier = page.getByRole('button', { name: /^Push$/ }).first();
    await expect(dernier).toBeVisible({ timeout: 20_000 });
    await dernier.scrollIntoViewIfNeeded();
    await dernier.click();

    // La preuve que c'est bien une FEUILLE, et non la carte d'autrefois : le
    // dialogue et sa commande de fermeture existent.
    await expect(page.getByLabel('Fermer')).toHaveCount(1, { timeout: 10_000 });

    const condition = page.getByText(/Gagner au moins 45 points d’Elo/).first();
    await expect(condition).toBeVisible();
    // En attente ACTIVE, et non une mesure unique : la feuille monte de 80 px
    // en 220 ms, si bien qu'une mesure prise pendant le glissement la trouve
    // encore sous le bord — vert en solo, rouge dans la campagne complète,
    // pour une raison qui n'a rien à voir avec le défaut testé.
    await expect
      .poll(async () => {
        const b = await condition.boundingBox();
        return b ? b.y >= 0 && b.y + b.height <= 568 : false;
      }, { timeout: 5_000 })
      .toBe(true);

    await expect(page.getByText('Décroché le 14 juil. 2026.').first()).toBeVisible();
  });
});

test('un badge NON décroché dit comment le décrocher', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/user_badges': [], 'rest/v1/profiles': MOI });
  await page.goto('/badges');

  const cible = page.getByRole('button', { name: /Champagne/ }).first();
  await expect(cible).toBeVisible({ timeout: 20_000 });
  await cible.click();

  // La feuille, pas la carte d'autrefois : l'ancienne affichait EXACTEMENT les
  // mêmes deux chaînes, un test qui s'en contente resterait vert si l'on
  // revenait en arrière.
  await expect(page.getByLabel('Fermer')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByText('Remporter sa première victoire.').first()).toBeVisible();
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

test('sur la fiche d’un AUTRE pilote, la feuille ne tutoie pas son Elo', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_pilot': [
      { id: 'u2', username: 'Sophie_K', elo: 1450, elo_exact: true, is_private: false, races: 12, avatar_path: null },
    ],
    'rest/v1/profiles': MOI,
  });
  await page.goto('/pilot/u2');

  const medaille = page.getByRole('button', { name: /voir ce que vaut ce grade/ }).first();
  await expect(medaille).toBeVisible({ timeout: 20_000 });
  await medaille.click();

  // Le défaut relevé par les DEUX audits : la feuille affichait « Ton niveau »
  // et « Ton Elo : 1450 » sur la fiche de quelqu'un d'autre. Un utilisateur y
  // lisait son propre Elo à 1450 — une information fausse, pas une maladresse
  // de ton.
  await expect(page.getByText('Elo de Sophie_K : 1450').first()).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText('Ton Elo', { exact: false })).toHaveCount(0);
  await expect(page.getByText('Ton niveau', { exact: false })).toHaveCount(0);
  // Le corps explicatif aussi : « tu en gagnes » n'a pas de sens ici.
  await expect(page.getByText(/^L’Elo est un compteur de points/).first()).toBeVisible();
});

test('la feuille et la carte disent LA MÊME chose sur la calibration', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/profiles': MOI });
  await page.goto('/profil');

  // La carte du profil et la feuille lisent la même source (les courses
  // terminées) : c'est leur ACCORD qu'on teste, pas une valeur en dur. Sans
  // cette réserve, la feuille affirmait un objectif chiffré que l'écran juste
  // derrière, à deux pixels de là, déclarait provisoire.
  const medaille = page.getByRole('button', { name: /voir ce que vaut ce grade/ }).first();
  // Le compte se prend APRÈS le chargement du profil, sinon il vaut zéro parce
  // que la carte n'existe pas encore — et le test comparait alors l'absence
  // d'écran à la présence de feuille.
  await expect(medaille).toBeVisible({ timeout: 20_000 });
  const carteEnCalibration = await page.getByText(/En calibration/).count();

  await medaille.click();
  await expect(page.getByText('Les six grades').first()).toBeVisible({ timeout: 10_000 });

  const feuilleEnCalibration = await page.getByText(/de calibration/).count();
  expect(feuilleEnCalibration > 0).toBe(carteEnCalibration > 0);
});

test('sur la vitrine d’un AUTRE pilote, un badge dit à quoi il correspond', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_pilot': [
      { id: 'u9', username: 'Zoe_P', elo: 1400, elo_exact: true, is_private: false, races: 12, avatar_path: null },
    ],
    'rest/v1/user_badges': [
      { badge_key: 'champagne', unlocked_at: '2026-07-12T20:00:00Z', race_id: 'r1' },
    ],
  });
  await page.goto('/pilot/u9');

  // La vitrine ne montrait que des pictogrammes MUETS : on voyait que Zoe
  // avait décroché quelque chose, jamais quoi (demande PO 2026-08-01). Le
  // canal d'explication existait depuis C2 et ne servait que sur SA propre
  // vitrine.
  const badge = page.getByRole('button', { name: 'Champagne !' }).first();
  await expect(badge).toBeVisible({ timeout: 20_000 });

  // 44 px : c'est une commande, et `hitSlop` est inerte en react-native-web.
  const b = await badge.boundingBox();
  expect(b && b.width >= 44 && b.height >= 44).toBeTruthy();

  await badge.click();
  await expect(page.getByText('Remporter sa première victoire.').first()).toBeVisible({
    timeout: 10_000,
  });

  // Et la date est attribuée à ZOE. Une date nue (« Décroché le 12 juil. ») se
  // lirait comme la sienne — c'est le piège déjà corrigé sur les grades, où
  // « Ton Elo : 1450 » s'affichait sur la fiche de quelqu'un d'autre.
  await expect(page.getByText(/Décroché par Zoe_P le/).first()).toBeVisible();
  await expect(page.getByText(/^Décroché le/)).toHaveCount(0);
});

test('un pseudo contenant « % » ne casse pas la phrase', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_pilot': [
      // `%d` est le jeton de la DATE dans le libellé. Injecté avant lui, le
      // pseudo était relu par la substitution suivante : « Décroché par
      // 10012 juil. 2026u top le %d. » — pseudo mutilé, gabarit à l'écran.
      // Rien n'interdit « % » dans un pseudo (3 à 20 caractères, filtre de
      // mots ; aucune restriction de casse ni de ponctuation).
      { id: 'u8', username: '100%du top', elo: 1400, elo_exact: true, is_private: false, races: 12, avatar_path: null },
    ],
    'rest/v1/user_badges': [
      { badge_key: 'champagne', unlocked_at: '2026-07-12T20:00:00Z', race_id: 'r1' },
    ],
  });
  await page.goto('/pilot/u8');
  await page.getByRole('button', { name: 'Champagne !' }).first().click({ timeout: 20_000 });

  await expect(page.getByText('Décroché par 100%du top le 12 juil. 2026.').first()).toBeVisible({
    timeout: 10_000,
  });
  // Aucun gabarit NON RÉSOLU ne doit atteindre l'écran. On cible « le %d. » et
  // « %p » : un « %d » nu se trouve dans le pseudo lui-même, c'est tout le sel
  // du cas.
  await expect(page.getByText(/le %d\./)).toHaveCount(0);
  await expect(page.getByText(/%p/)).toHaveCount(0);
});
