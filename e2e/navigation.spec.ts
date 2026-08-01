import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * Les frottements de navigation relevés au test utilisateur du 2026-08-01.
 *
 * Ils ont un point commun : chaque onglet porte sa PROPRE pile d'écrans, si
 * bien qu'un écran rangé dans le mauvais onglet fait changer d'onglet à son
 * ouverture — et le « ← » remonte alors une pile où l'on n'est jamais passé.
 * Cela ne se voit ni au type, ni au lint, ni à la lecture : il faut cliquer.
 */
const MOI = { id: UID, username: 'Moi', elo: 1210, races: 6, deleted_at: null, avatar_path: null };

const CLASSEMENT = [
  { rank: 1, profile_id: 'u2', ghost_id: null, username: 'Sophie_K', elo: 1330, races: 9, is_me: false, avatar_path: null },
  { rank: 2, profile_id: UID, ghost_id: null, username: 'Moi', elo: 1210, races: 6, is_me: true, avatar_path: null },
];

test.use({ viewport: { width: 390, height: 844 } });

test('l’échelle des grades revient au PROFIL, pas au classement', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/profiles': MOI });
  await page.goto('/profil');

  // L'écran vivait dans l'onglet Classement alors qu'on n'y accède QUE d'ici :
  // l'ouvrir changeait d'onglet, et « ← » déposait le pilote sur le tableau
  // des scores. Il vit maintenant dans l'onglet Profil.
  await page.getByText('Échelle des grades', { exact: false }).first().click({ timeout: 20_000 });
  await expect(page).toHaveURL(/grades/, { timeout: 15_000 });
  await page.getByLabel('Retour').first().click();
  await expect(page).toHaveURL(/profil/, { timeout: 15_000 });
});

test('une ligne de classement DIT qu’elle s’ouvre, et elle s’ouvre', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
  });
  await page.goto('/classements');

  const ligne = page.getByRole('button', { name: /Sophie_K/ }).first();
  await expect(ligne).toBeVisible({ timeout: 20_000 });

  // La ligne était tapable depuis toujours — mais RIEN ne le disait : la
  // colonne de droite ne portait qu'une médaille de grade, et une médaille ne
  // signifie pas « ouvre-moi ». Un testeur en a conclu que le classement
  // n'était pas cliquable. Le chevron est l'affordance qui manquait.
  await expect(ligne).toContainText('›');

  await ligne.click();
  await expect(page).toHaveURL(/pilot\/u2/, { timeout: 15_000 });
});

test('la cloche reste une CLOCHE : les pastilles ne la recouvrent pas', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/unread_notifications_count': 3, 'rpc/unread_feed_count': 2 });
  await page.goto('/');
  await expect(page.getByText('Courses', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });

  // Les deux compteurs étaient posés SUR le pictogramme : à 24 px ils en
  // mangeaient la moitié droite, et il ne restait qu'un amas de ronds — un
  // testeur l'a prise pour un menu d'options. Ils doivent border la cloche,
  // pas l'habiter.
  const zone = page.getByLabel(/Ta boîte/).first();
  const b = await zone.boundingBox();
  expect(b && b.width >= 44 && b.height >= 44).toBeTruthy();

  const recouvrement = await page.evaluate(() => {
    const bouton = [...document.querySelectorAll('[role="button"]')].find((e) =>
      (e.getAttribute('aria-label') ?? '').includes('Ta boîte'),
    );
    const svg = bouton?.querySelector('svg')?.getBoundingClientRect();
    if (!svg || !bouton) return -1;
    // Part de la surface du pictogramme mangée par les pastilles.
    let pris = 0;
    for (const p of bouton.querySelectorAll('div')) {
      const r = p.getBoundingClientRect();
      if (r.width === 0 || r.width > 40) continue; // les pastilles seulement
      const l = Math.max(0, Math.min(r.right, svg.right) - Math.max(r.left, svg.left));
      const h = Math.max(0, Math.min(r.bottom, svg.bottom) - Math.max(r.top, svg.top));
      pris += l * h;
    }
    return pris / (svg.width * svg.height);
  });
  // Moins d'un dixième : la silhouette de la cloche reste entière. À 26 % —
  // la valeur mesurée avant correction — il ne restait qu'un amas de ronds.
  expect(recouvrement).toBeGreaterThanOrEqual(0);
  expect(recouvrement).toBeLessThan(0.1);
});

test('la photo de profil est le bouton — plus besoin de l’écrire', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/profiles': { ...MOI, avatar_path: `${UID}/photo.jpg` },
    'storage/v1': { signedURL: '/favicon.ico' },
  });
  await page.goto('/settings/compte');

  // Taper une photo pour la changer est un geste universel : le lien
  // « Changer la photo » était un mot de plus pour une chose qu'on fait sans
  // y penser. Il ne survit que pour AJOUTER une première photo.
  const photo = page.getByRole('button', { name: /photo/i }).first();
  await expect(photo).toBeVisible({ timeout: 20_000 });
  const b = await photo.boundingBox();
  expect(b && b.height >= 44).toBeTruthy();
});
