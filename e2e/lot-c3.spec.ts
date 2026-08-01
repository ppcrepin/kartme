import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * C3 — les trois décisions PO du 2026-08-01 qui se voient à l'écran :
 * plus de badges qui punissent, l'invitation réservée à l'admin, et un champ
 * libre sur les signalements de karting.
 */
const CIRCUIT = { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true };

const COURSE_A_VENIR = {
  id: 'r1',
  circuit_id: 'c1',
  scheduled_at: new Date(Date.now() + 864e5).toISOString(),
  status: 'upcoming',
  invite_token: 'tok-1',
  completed_at: null,
  circuit: CIRCUIT,
};

const PILOTES = [
  { id: 'p1', profile_id: UID, ghost_id: null, profile: { username: 'Moi', elo: 1210, races: 6, avatar_path: null }, ghost: null },
  { id: 'p2', profile_id: 'u2', ghost_id: null, profile: { username: 'Sophie_K', elo: 1330, races: 9, avatar_path: null }, ghost: null },
];

test.use({ viewport: { width: 390, height: 844 } });

test('les badges qui punissent ont disparu du catalogue', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/user_badges': [] });
  await page.goto('/badges');

  await expect(page.getByText('Kart d’identité').first()).toBeVisible({ timeout: 20_000 });

  // Trois badges décrivaient une mauvaise soirée, dans la MÊME vitrine que les
  // trophées à décrocher. Une vitrine où l'on collectionne ses défaites
  // n'invite personne à revenir (décision PO 2026-08-01).
  for (const disparu of ['Kart-astrophe', 'Voiture balai', 'Tête-à-queue']) {
    await expect(page.getByText(disparu, { exact: false })).toHaveCount(0);
  }

  // Et le compteur suit : jamais douze. Laisser « %u sur 12 » aurait rendu le
  // catalogue impossible à finir. Onze depuis C13, qui a ajouté les deux
  // badges du karting électrique.
  await expect(page.getByText('0 sur 11 débloqués').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Kart d’identité/ })).toHaveCount(1);
});

test('un pilote NON admin ne voit aucune porte vers le lien de la course', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': { ...COURSE_A_VENIR, admin_id: 'u2' },
    'rest/v1/participations': PILOTES,
    'rest/v1/results': [],
  });
  await page.goto('/race/r1');
  await expect(page.getByText('Sophie_K', { exact: false }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });

  // Ce test mesure l'ÉCRAN, et rien d'autre — c'est sa limite, et il faut la
  // dire : masquer un bouton n'est pas une règle. La règle elle-même est tenue
  // par le serveur (`join_race` exige le jeton d'invitation, la colonne
  // `invite_token` n'est plus lisible) et gardée par les scénarios 5 et 6 de
  // supabase/tests/90_join_race_test.sql. C'est là qu'elle se casserait.
  await expect(page.getByRole('button', { name: /Inviter/ })).toHaveCount(0);
  // Le bloc d'ajout de pilotes ne lui était déjà pas proposé : on le vérifie
  // ici, c'est la même règle.
  await expect(page.getByText('Ajouter des pilotes', { exact: false })).toHaveCount(0);

});

test('sans jeton, la porte d’entrée est fermée — et le dit', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': { ...COURSE_A_VENIR, admin_id: 'u2' },
    // Une grille où je ne suis PAS : quelqu'un qui tombe sur la page sans
    // avoir été invité. La page reste lisible — elle n'est pas secrète —,
    // c'est la GRILLE qui est réservée aux invités de l'organisateur.
    'rest/v1/participations': [PILOTES[1]],
    'rest/v1/results': [],
  });
  await page.goto('/race/r1');
  await expect(page.getByText('Sophie_K', { exact: false }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });

  // Un bouton « Rejoindre » qu'on sait voué à un refus serveur vaut moins
  // qu'une phrase qui explique la règle.
  await expect(page.getByText('Seul l’organisateur peut inviter sur cette course.').first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rejoindre la course' })).toHaveCount(0);
});

test('avec le jeton du lien, la porte est ouverte', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': { ...COURSE_A_VENIR, admin_id: 'u2' },
    // Une grille où je ne suis PAS : c'est le cas de quelqu'un qui arrive par
    // le lien de partage.
    'rest/v1/participations': [PILOTES[1]],
    'rest/v1/results': [],
  });
  await page.goto('/race/r1?j=un-jeton');

  await expect(page.getByRole('button', { name: 'Rejoindre la course' }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Seul l’organisateur peut inviter sur cette course.')).toHaveCount(0);
});

test('l’admin, lui, garde le lien et le QR', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/races': { ...COURSE_A_VENIR, admin_id: UID },
    'rest/v1/participations': PILOTES,
    'rest/v1/results': [],
  });
  await page.goto('/race/r1');

  const inviter = page.getByRole('button', { name: /Inviter/ }).first();
  await expect(inviter).toBeVisible({ timeout: 20_000 });
  await inviter.click();
  await expect(page.getByLabel('Fermer')).toHaveCount(1, { timeout: 10_000 });
});

test('le signalement d’un karting accepte des précisions, et dit qui les lira', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {});
  await page.goto('/circuit-report');

  // Le nom accessible du champ PORTE la mention de modération : c'est
  // volontaire (un lecteur d'écran annonçait « Précisions, zone de texte »
  // sans jamais dire qui allait lire ce qu'on y tape).
  const champ = page.getByLabel(/Précisions \(facultatif\)/);
  await expect(champ).toBeVisible({ timeout: 20_000 });

  // Le lot d'origine avait REFUSÉ ce champ — « une porte d'entrée pour les
  // insultes ». L'arbitrage le rouvre à une condition, et cette condition doit
  // être ÉCRITE : quelqu'un qui tape un texte dans une application a le droit
  // de savoir qui va le lire.
  await expect(page.getByText(/Lu par la modération uniquement/).first()).toBeVisible();

  // Plafonné à la saisie, pas seulement au serveur : se faire tronquer après
  // l'envoi, sans l'avoir vu venir, fait douter de l'envoi entier.
  await champ.fill('x'.repeat(260));
  expect((await champ.inputValue()).length).toBe(200);
  await expect(page.getByText('Il reste 0 caractère').first()).toBeVisible();
  // Et l'accord suit : « Il reste 1 caractère », pas « 1 caractères ».
  await champ.fill('y'.repeat(199));
  await expect(page.getByText('Il reste 1 caractère').first()).toBeVisible();
});
