import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee } from './harness';

/**
 * Le fil d'actualité (A15) : bandeau « Ça bouge » sur l'accueil, écran Actu à
 * deux onglets, double compteur sur la cloche. Décisions PO figées ici :
 * montées ET chutes annoncées, badges inclus, jamais de section vide.
 */
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
    kind: 'race_upcoming', actor_username: 'Paul_H', race_id: 'r9',
    circuit_name: 'Sologne Karting', scheduled_at: new Date(maintenant + 2 * 864e5).toISOString(),
  }),
  item(2, {
    kind: 'race_result', actor_username: 'Lena', race_id: 'r8',
    circuit_name: 'Kart Racer', winner_username: 'Lena', my_position: 2, my_elo_delta: 12,
    pilots_count: 4, guests_count: 1,
  }),
  // La CHUTE d'un ami est annoncée — décision PO, contre la recommandation.
  item(3, { kind: 'grade_friend', actor_username: 'Marc', band_from: 3, band_to: 2, elo: 985 }),
];

test.use({ viewport: { width: 390, height: 844 } });

test('accueil : bandeau « Ça bouge », libellés français, « Tout voir » ouvre le fil', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_feed': FIL,
    'rpc/unread_feed_count': 2,
    'rpc/unread_notifications_count': 3,
  });
  await page.goto('/');

  await expect(page.getByText('Ça bouge', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Paul_H a prévu une course', { exact: true })).toBeVisible();
  await expect(page.getByText('🏆 Lena gagne à Kart Racer', { exact: true })).toBeVisible();
  await expect(page.getByText('Toi : 2ᵉ · ▲ +12', { exact: true })).toBeVisible();
  await expect(page.getByText('Marc retombe Roue Libre', { exact: true })).toBeVisible();

  // Double compteur : le rouge (3, on t'attend) ET l'or (2, ça bouge) sont
  // TOUS DEUX visibles — l'audit avait trouvé l'or recouvrant le rouge.
  await expect(page.getByText('3', { exact: true }).and(sceneActive(page))).toBeVisible();
  await expect(page.getByText('2', { exact: true }).and(sceneActive(page))).toBeVisible();

  await page.getByText('Tout voir', { exact: false }).click();
  await expect(page.getByText('Tes amis', { exact: true })).toBeVisible();
  await expect(page.getByText('Marc retombe Roue Libre', { exact: true }).and(sceneActive(page))).toBeVisible();
});

test('accueil sans actualité : aucun bandeau — jamais de section vide', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/get_feed': [] });
  await page.goto('/');
  await expect(page.getByText('Créer une course', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('Ça bouge', { exact: true })).toHaveCount(0);
});

test('écran Actu : deux onglets, le fil ne se marque vu QUE s’il est affiché', async ({ page }) => {
  const marquages: string[] = [];
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_feed': FIL,
    'rpc/list_notifications': [],
  });
  await page.route('**/rpc/mark_feed_seen**', (route) => {
    marquages.push('vu');
    return route.fulfill({ status: 200, contentType: 'application/json', body: 'null' });
  });

  // Arrivée sur « Pour toi » : rien ne doit être marqué vu (revue : une
  // pastille qui meurt sans avoir montré son contenu a menti).
  await page.goto('/notifications');
  await expect(page.getByText('Pour toi', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(800);
  expect(marquages).toHaveLength(0);

  // Bascule sur « Tes amis » : le fil s'affiche, ALORS il se marque vu.
  await page.getByText('Tes amis', { exact: true }).click();
  await expect(page.getByText('Paul_H a prévu une course', { exact: true })).toBeVisible();
  await expect
    .poll(() => marquages.length, { timeout: 5_000 })
    .toBeGreaterThan(0);
});
