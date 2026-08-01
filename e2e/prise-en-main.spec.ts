import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * La checklist « ta première course » (retour de test réel du 2026-08-01 :
 * « pour un nouvel utilisateur, ce n'est pas si simple à utiliser »).
 *
 * Ce qui est vérifié ici n'est pas l'apparence de la carte mais sa PROMESSE :
 * elle se coche toute seule au fil des gestes réels, elle ne propose jamais
 * que le prochain pas, et elle disparaît pour de bon dès la première course
 * terminée. Une checklist qui resterait après coup deviendrait du bruit, et
 * une checklist qui ne se cocherait pas serait un mensonge.
 */
const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const course = (statut: string) => ({
  id: 'r1',
  admin_id: UID,
  circuit_id: 'c1',
  scheduled_at: new Date(Date.now() + 3 * 864e5).toISOString(),
  status: statut,
  invite_token: 'tok-1',
  completed_at: statut === 'completed' ? new Date().toISOString() : null,
  circuit: CIRCUIT,
});

test.use({ viewport: { width: 390, height: 844 } });

test('aucune course : la checklist s’affiche à 0/3 et mène à la création', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/races': [], 'rest/v1/participations': [] });
  await page.goto('/');

  await expect(page.getByText('Ta première course', { exact: true })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('0/3', { exact: true })).toBeVisible();

  // Seule l'étape courante porte son aide et son appel : proposer les trois
  // d'un coup, c'est reproduire le mur de choix qu'on vient de démonter.
  await expect(page.getByText('C’est parti ›', { exact: true })).toBeVisible();
  await expect(page.getByText('Un karting, une date. Trente secondes.', { exact: true })).toBeVisible();
  await expect(page.getByText('L’ordre d’arrivée — les points s’échangent tout seuls.', { exact: true })).toHaveCount(0);

  // On cible la LIGNE, pas son texte : « Créer une course » nomme aussi le
  // gros bouton du bas de l'accueil, et deux commandes homonymes ne se
  // distinguent ni pour le test ni pour un lecteur d'écran.
  await page.getByLabel('Étape 1 sur 3 · Créer une course').click();
  await expect(page).toHaveURL(/race\/create/);
});

test('course créée mais grille vide : 1/3, et l’étape suivante ouvre la course', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': [course('upcoming')],
    // Une seule participation : une course où l'on est seul n'est pas une
    // grille remplie — la 2e étape reste à faire.
    'rest/v1/participations': [{ race_id: 'r1' }],
  });
  await page.goto('/');

  await expect(page.getByText('1/3', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Continuer ›', { exact: true })).toBeVisible();
  await expect(
    page.getByText('Tes amis en un tap ; les autres, au pseudo ou en invité.', { exact: true }),
  ).toBeVisible();

  await page.getByLabel('Étape 2 sur 3 · Ajouter des pilotes').click();
  await expect(page).toHaveURL(/race\/r1/);
});

test('grille remplie : 2/3, il ne reste que le classement', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': [course('upcoming')],
    'rest/v1/participations': [{ race_id: 'r1' }, { race_id: 'r1' }, { race_id: 'r1' }],
  });
  await page.goto('/');

  await expect(page.getByText('2/3', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(
    page.getByText('L’ordre d’arrivée — les points s’échangent tout seuls.', { exact: true }),
  ).toBeVisible();
});

test('une course terminée : la checklist a fini son travail et disparaît', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': [course('completed')],
    'rest/v1/participations': [{ race_id: 'r1' }, { race_id: 'r1' }],
  });
  await page.goto('/');

  // On attend un repère de l'accueil AVANT de conclure à l'absence : sinon le
  // test passerait sur une page pas encore chargée.
  await expect(page.getByText('Courses', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Ta première course', { exact: true })).toHaveCount(0);
});
