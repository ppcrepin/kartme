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

  // Et le compteur suit : neuf, pas douze. Laisser « %u sur 12 » aurait rendu
  // le catalogue impossible à finir.
  await expect(page.getByText('0 sur 9 débloqués').first()).toBeVisible();
  await expect(page.getByRole('button', { name: /Kart d’identité/ })).toHaveCount(1);
});

test('un pilote NON admin ne peut pas diffuser le lien de la course', async ({ page }) => {
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

  // Le serveur refusait déjà à un non-admin d'AJOUTER quelqu'un (policy
  // `participations_write_admin`). Mais ce lien contournait la règle par la
  // bande : n'importe quel inscrit diffusait l'URL, et le destinataire se
  // joignait tout seul. Une grille qui grossit sans que son organisateur le
  // sache, c'est la grille de quelqu'un d'autre.
  await expect(page.getByRole('button', { name: /Inviter/ })).toHaveCount(0);
  // Le bloc d'ajout de pilotes ne lui était déjà pas proposé : on le vérifie
  // ici, c'est la même règle.
  await expect(page.getByText('Ajouter des pilotes', { exact: false })).toHaveCount(0);
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

  const champ = page.getByLabel('Précisions (facultatif)');
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
  await expect(page.getByText('0 caractères restants').first()).toBeVisible();
});
