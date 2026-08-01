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

  // Et le chemin du RETOUR. La fiche pilote vivait dans l'onglet Amis : son
  // ouverture depuis le classement faisait CHANGER d'onglet, et l'indicateur
  // sautait le temps de la visite. Elle a suivi le classement dans sa pile le
  // 2026-08-01 — plus de saut, et le « ← » ramène au classement.
  await page.getByLabel('Retour').first().click();
  await expect(page).toHaveURL(/classements/, { timeout: 15_000 });
  await expect(page.getByText('Sophie_K', { exact: false }).first()).toBeVisible();
});

test('MA ligne de classement ouvre MA fiche pilote', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_leaderboard': CLASSEMENT,
    'rpc/get_my_rank': [{ rank: 2, elo: 1210, races: 6, total: 2 }],
    'rpc/get_pilot': [
      { id: UID, username: 'Moi', elo: 1210, elo_exact: true, is_private: false, races: 6, avatar_path: null },
    ],
  });
  await page.goto('/classements');

  // Elle était INERTE : ni tapable, ni annoncée comme telle. Au milieu de
  // lignes qui, elles, s'ouvrent, ça se lit comme une panne — c'est le retour
  // du PO, mot pour mot : « on ne peut pas cliquer sur son profil dans le
  // classement, ça ne fonctionne pas ».
  const ligne = page.getByRole('button', { name: /Moi \(toi\)/ }).first();
  await expect(ligne).toBeVisible({ timeout: 20_000 });
  await expect(ligne).toContainText('›');
  await ligne.click();
  await expect(page).toHaveURL(new RegExp(`pilot/${UID}`), { timeout: 15_000 });

  // Et surtout : le RETOUR existe. La version précédente renvoyait sur
  // l'onglet Profil, une racine d'onglet — zéro bouton retour, téléportation
  // sans marche arrière. La fiche vit dans la pile du classement.
  await page.getByLabel('Retour').first().click();
  await expect(page).toHaveURL(/classements/, { timeout: 15_000 });

  // Le bord droit reste aligné d'une ligne à l'autre : toutes portent
  // désormais un chevron, plus aucune n'a besoin de l'espaceur.
  const bords = await page.evaluate(() =>
    [...document.querySelectorAll('[aria-hidden="true"]')]
      .map((e) => e.getBoundingClientRect())
      // La hauteur écarte le filet damier de l'en-tête, qui porte lui aussi
      // `aria-hidden` (48 × 12).
      .filter((r) => r.width > 0 && r.width < 80 && r.height > 20)
      .map((r) => Math.round(r.right)),
  );
  expect(bords.length).toBeGreaterThanOrEqual(2);
  expect(new Set(bords).size).toBe(1);
});

test('sur MA fiche, aucune commande qui ne veut rien dire', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_pilot': [
      { id: UID, username: 'Moi', elo: 1210, elo_exact: true, is_private: false, races: 6, avatar_path: null },
    ],
  });
  await page.goto(`/pilot/${UID}`);
  await expect(page.getByText('Moi', { exact: false }).first()).toBeVisible({ timeout: 20_000 });

  // On ne s'ajoute pas soi-même en ami, on ne se signale pas, on ne se bloque
  // pas, et on n'a pas de face-à-face contre soi. La fiche est la MÊME que
  // celle des autres : sans garde, elle aurait offert les quatre.
  for (const mot of ['Demander en ami', 'Signaler', 'Bloquer', 'Face-à-face']) {
    await expect(page.getByText(mot, { exact: false })).toHaveCount(0);
  }
});

// Deux jeux : le cas courant, et le PIRE — « 99+ » élargit la pastille rouge
// vers la gauche, donc vers le pictogramme. Le test d'origine n'exerçait que
// le premier, à sept points du seuil.
for (const [notifs, fil] of [[3, 2], [128, 20]] as const) {
test(`la cloche reste une CLOCHE (${notifs}/${fil})`, async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/unread_notifications_count': notifs, 'rpc/unread_feed_count': fil });
  await page.goto('/');
  await expect(page.getByText('Courses', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });

  // Les deux compteurs étaient posés SUR le pictogramme : à 24 px ils en
  // mangeaient la moitié droite, et il ne restait qu'un amas de ronds — un
  // testeur l'a prise pour un menu d'options. Ils doivent border la cloche,
  // pas l'habiter.
  const zone = page.getByLabel(/Quoi de neuf/).first();
  const b = await zone.boundingBox();
  expect(b && b.width >= 44 && b.height >= 44).toBeTruthy();

  const recouvrement = await page.evaluate(() => {
    const bouton = [...document.querySelectorAll('[role="button"]')].find((e) =>
      (e.getAttribute('aria-label') ?? '').includes('Quoi de neuf'),
    );
    const svg = bouton?.querySelector('svg')?.getBoundingClientRect();
    if (!svg || !bouton) return -1;
    // Part de la surface du pictogramme mangée par les pastilles.
    let pris = 0;
    // Enfants DIRECTS seulement : `Text` de react-native-web rend lui aussi un
    // `div`, si bien qu'un `querySelectorAll('div')` comptait chaque pastille
    // deux fois — sa `View` et son libellé — et gonflait la mesure.
    for (const p of bouton.children) {
      if (p.tagName.toLowerCase() === 'svg') continue;
      const r = p.getBoundingClientRect();
      if (r.width === 0) continue;
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
}

test('avec une photo : elle EST le bouton, et un badge le dit', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/profiles': { ...MOI, avatar_path: `${UID}/photo.jpg` },
    // Forme RÉELLE de `createSignedUrls` : un tableau de { path, signedUrl }.
    // Un bouchon approximatif laissait le rond d'initiales à l'écran, et le
    // test mesurait donc autre chose que ce qu'il annonçait.
    'storage/v1': [{ path: `${UID}/photo.jpg`, signedUrl: '/favicon.ico' }],
  });
  await page.goto('/settings/compte');

  // Par nom EXACT : « Retirer ma photo de profil » contient aussi « photo »,
  // et une expression régulière laissait passer la disparition du bouton
  // qu'on teste.
  const photo = page.getByRole('button', { name: 'Changer ma photo', exact: true });
  await expect(photo).toBeVisible({ timeout: 20_000 });
  const b = await photo.boundingBox();
  expect(b && b.height >= 44).toBeTruthy();

  // Retirer le lien texte sans rien mettre à la place aurait reproduit le
  // défaut corrigé au classement : une zone tapable que rien n'annonce. Sur
  // mobile il n'y a même pas de curseur pour deviner.
  await expect(photo.getByText('✎')).toBeVisible();
});

test('sans photo : un seul bouton par action, aux noms distincts', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rest/v1/profiles': { ...MOI, avatar_path: null } });
  await page.goto('/settings/compte');

  // Deux portes vers le même sélecteur (l'avatar et le lien) portaient le
  // MÊME nom accessible : un lecteur d'écran annonçait deux fois la même
  // chose, et la commande vocale ne pouvait pas les distinguer.
  await expect(page.getByRole('button', { name: 'Ajouter une photo', exact: true })).toHaveCount(1);
  await expect(page.getByRole('button', { name: 'Changer ma photo', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retirer ma photo de profil' })).toHaveCount(0);
});
