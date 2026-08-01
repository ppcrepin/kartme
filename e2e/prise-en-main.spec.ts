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
  await expect(page.getByText('Un circuit, une date. Trente secondes.', { exact: true })).toBeVisible();
  await expect(page.getByText('L’ordre d’arrivée — les points s’échangent tout seuls.', { exact: true })).toHaveCount(0);

  // On cible la LIGNE, pas son texte : « Créer une course » nomme aussi le
  // gros bouton du bas de l'accueil, et deux commandes homonymes ne se
  // distinguent ni pour le test ni pour un lecteur d'écran.
  await page.getByLabel('Étape 1 sur 3 · Créer une course').click();
  await expect(page).toHaveURL(/race\/create/, { timeout: 15_000 });
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
  await expect(page).toHaveURL(/race\/r1/, { timeout: 15_000 });
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
    page.getByText(
      'On fige les partants, puis on met l’ordre d’arrivée — les points s’échangent tout seuls.',
      { exact: true },
    ),
  ).toBeVisible();
});

test('inscrit par un ami, sans rien créer : la checklist reste à 0/3', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    // Rien en tant qu'admin…
    'rest/v1/races': [],
    // …mais une course d'un AMI où l'on m'a mis sur la grille. C'est le profil
    // exact que la checklist vise : quelqu'un qui découvre l'app par un lien.
    'rest/v1/participations': [{ race: { ...course('upcoming'), admin_id: 'u2' } }],
  });
  await page.goto('/');

  // Les deux premières étapes NE DOIVENT PAS se cocher : il n'a rien créé et
  // n'a ajouté personne. `listMyRaces` fusionne « mes courses » et « celles où
  // je suis inscrit » — s'en servir tel quel affichait 2/3 à quelqu'un qui n'a
  // rien fait, puis l'envoyait sur une course dont il n'est pas admin, où ni
  // « + Ajouter » ni « Saisir le classement » n'existent.
  await expect(page.getByText('0/3', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('C’est parti ›', { exact: true })).toBeVisible();
  await expect(page.getByText('Un circuit, une date. Trente secondes.', { exact: true })).toBeVisible();
});

test('le « ✕ » chasse la checklist, et elle revient au palier suivant', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/races': [], 'rest/v1/participations': [] });
  await page.goto('/');
  await expect(page.getByText('0/3', { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByLabel('Masquer cette aide').click();
  await expect(page.getByText('Ta première course', { exact: true })).toHaveCount(0);

  // Rechargement : elle reste chassée. Un simple booléen suffirait ici — c'est
  // la suite qui exige de mémoriser le PALIER.
  await page.reload();
  await expect(page.getByText('Courses', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Ta première course', { exact: true })).toHaveCount(0);

  // Le pilote s'y met vraiment : une course existe. La carte revient, à 1/3.
  // (Sans le palier mémorisé, la rechasser ici la ferait revenir aussitôt —
  //  une croix qui ne ferme rien.)
  await reseauSimule(page, {
    'rest/v1/races': [course('upcoming')],
    'rest/v1/participations': [{ race_id: 'r1' }],
  });
  await page.reload();
  await expect(page.getByText('1/3', { exact: true })).toBeVisible({ timeout: 20_000 });

  // LE comportement neuf : on la rechasse à 1/3, et elle RESTE chassée à 1/3.
  // Un booléen remis à faux à chaque palier passerait tout ce qui précède et
  // échouerait ici — c'est la seule assertion qui distingue les deux modèles.
  await page.getByLabel('Masquer cette aide').click();
  await page.reload();
  await expect(page.getByText('Courses', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Ta première course', { exact: true })).toHaveCount(0);
});

test('« À venir » : la plus proche en tête, les oubliées à la fin', async ({ page }) => {
  await sessionSimulee(page);
  const dans = (j: number) => ({
    ...course('upcoming'),
    id: `r${j}`,
    scheduled_at: new Date(Date.now() + j * 864e5).toISOString(),
  });
  await reseauSimule(page, {
    // Servies dans le désordre : c'est au client de trancher. Deux courses
    // EN RETARD (J-20, J-5) — leur date est passée mais leur classement n'a
    // jamais été saisi, donc elles restent « à venir ». Un tri croissant NU
    // les mettrait en tête, au-dessus de la course de demain : c'est
    // exactement ce que le jeu de données précédent, tout en futur, ne
    // pouvait pas voir.
    'rest/v1/races': [dans(30), dans(-20), dans(2), dans(-5), dans(12)],
    'rest/v1/participations': [],
  });
  await page.goto('/');
  await expect(page.getByText('Sologne Karting', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  // On lit les jours DANS les cartes de course, pas au hasard de la page : la
  // pastille de la cloche est un nombre nu placé plus haut dans le DOM, et un
  // balayage global la ramasserait le jour où une fixture la peuple.
  const cartes = page.getByLabel(/^Course du /);
  const jours: string[] = [];
  for (let i = 0; i < (await cartes.count()); i++) {
    jours.push(((await cartes.nth(i).getAttribute('aria-label')) ?? '').split(' ')[2]);
  }
  const jour = (j: number) => String(new Date(Date.now() + j * 864e5).getDate());
  // Le futur d'abord, du plus proche au plus lointain ; puis les oubliées, la
  // plus récente en tête (c'est celle dont on se souvient assez pour la classer).
  expect(jours).toEqual([jour(2), jour(12), jour(30), jour(-5), jour(-20)]);
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
