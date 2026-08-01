import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee, UID } from './harness';

/**
 * La fiche pilote, atteinte d'un tap sur « Voir son profil » juste après avoir
 * accepté un lien d'ami — le geste qui suit IMMÉDIATEMENT la conversion du
 * canal d'acquisition n°1.
 *
 * L'audit navigateur l'a trouvée bloquante : en panne réseau comme sur un
 * identifiant inconnu, l'écran restait sur un squelette gris MUET,
 * indéfiniment. `refresh().catch(() => {})` avalait l'erreur et il n'existait
 * aucun état terminal — ni message, ni « Réessayer ». Pas un seul test ne
 * couvrait ces deux cas, alors que l'écran d'invitation juste avant les
 * distingue proprement.
 */
const PILOTE = 'bbbb2222-3333-4444-5555-666677778888';

test.use({ viewport: { width: 390, height: 844 } });

test('une panne réseau sur la fiche pilote le DIT et propose de réessayer', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page);
  await page.route('**/rpc/get_pilot**', (route) =>
    route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' }),
  );
  await page.goto(`/pilot/${PILOTE}`);

  await expect(
    page.getByText(/Impossible de charger cette fiche/).and(sceneActive(page)).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Réessayer', { exact: true }).and(sceneActive(page)).first()).toBeVisible();
  // Et JAMAIS le message anglais du serveur.
  await expect(page.getByText(/boom/)).toHaveCount(0);
});

test('« Réessayer » relance réellement l’appel', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page);
  let appels = 0;
  await page.route('**/rpc/get_pilot**', (route) => {
    appels += 1;
    return route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' });
  });
  await page.goto(`/pilot/${PILOTE}`);
  await expect(page.getByText('Réessayer', { exact: true }).and(sceneActive(page)).first()).toBeVisible({
    timeout: 20_000,
  });

  const avant = appels;
  await page.getByText('Réessayer', { exact: true }).and(sceneActive(page)).first().click();
  await expect.poll(() => appels, { timeout: 10_000 }).toBeGreaterThan(avant);
});

test('un pilote introuvable le dit, SANS « Réessayer »', async ({ page }) => {
  await sessionSimulee(page);
  // Le serveur répond bien, mais ne connaît pas ce pilote : réessayer
  // n'aboutira jamais, le bouton n'a rien à faire là.
  await reseauSimule(page, { 'rpc/get_pilot': [] });
  await page.goto(`/pilot/${PILOTE}`);

  await expect(
    page.getByText(/Ce pilote n’est plus là/).and(sceneActive(page)).first(),
  ).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Réessayer', { exact: true })).toHaveCount(0);
  // Le libellé a suivi la destination : l'écran « Amis » n'existe plus depuis
  // la fusion du 2026-08-01, et un bouton qui promet un écran disparu ment.
  await expect(
    page.getByText('Voir le classement', { exact: true }).and(sceneActive(page)).first(),
  ).toBeVisible();
});

/**
 * Les zones tapables. `hitSlop` est présent partout dans le code mais
 * react-native-web NE L'IMPLÉMENTE PAS sur `Pressable` : le contournement
 * supposé était inopérant sur la seule cible livrée aujourd'hui.
 */
test('les zones tapables tiennent le plancher de 44 px', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rest/v1/profiles': { id: UID, username: 'Moi', elo: 1210, races: 6, deleted_at: null, avatar_path: null },
  });
  // Le lien d'invitation a suivi le PROFIL : l'onglet Amis a fusionné dans le
  // classement le 2026-08-01.
  await page.goto('/profil');

  const bouton = page.getByText('Inviter un ami', { exact: true }).first();
  await expect(bouton).toBeVisible({ timeout: 20_000 });

  // Un bouton pilule : 39 px auparavant, sur TOUS les écrans de l'app.
  await page.goto('/historique');
  const retour = page.getByRole('button', { name: 'Retour' }).and(sceneActive(page)).first();
  await expect(retour).toBeVisible({ timeout: 20_000 });
  const zone = await retour.boundingBox();
  expect(zone).not.toBeNull();
  expect(zone!.height).toBeGreaterThanOrEqual(44);
  expect(zone!.width).toBeGreaterThanOrEqual(44);
});
