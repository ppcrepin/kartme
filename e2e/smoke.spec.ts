import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee } from './harness';

/**
 * Smoke test du shell : l'app démarre et les 5 onglets sont présents.
 * Session simulée : sans elle, la garde de routes renvoie vers la connexion
 * et le test mesurait un écran qui n'a pas d'onglets.
 */
test('le shell affiche les 5 onglets', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page);
  await page.goto('/');

  for (const label of ['Courses', 'Classements', 'Amis', 'Kartings', 'Profil']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  }
});

/**
 * Décision PO 2026-07-30 : la barre d'onglets reste visible sur les écrans de
 * détail — on se promène d'une section à l'autre sans enchaîner « précédent ».
 * Avant, ces écrans vivaient hors du groupe (tabs) et la barre disparaissait.
 */
test('la barre d’onglets reste visible sur un écran de détail', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_circuit_page': [
      { id: 'c1', name: 'Sologne Karting', city: 'Salbris', lat: 47.36, lon: 2.05,
        aliases: null, website: null, phone: null, is_indoor: false,
        races_count: 14, pilots_count: 9, last_race_at: '2026-07-12T10:00:00Z',
        my_races_count: 0, my_best_lap_ms: null, laps_all: 0, laps_year: 0, laps_month: 0 },
    ],
    'rpc/get_circuit_top_times': [],
    'rpc/nearby_circuits': [],
  });
  await page.goto('/circuit/c1');
  await expect(page.getByText('Sologne Karting', { exact: true }).first()).toBeVisible({
    timeout: 20_000,
  });

  // Les 5 onglets sont là, SUR la fiche circuit — et RIEN QUE ces 5 : un
  // fichier route égaré directement sous (tabs) deviendrait un 6e bouton.
  // Par RÔLE : la liste Kartings est montée sous la fiche dans la pile, et
  // son TITRE caché ferait trébucher un repérage par texte.
  for (const label of ['Courses', 'Classements', 'Amis', 'Kartings', 'Profil']) {
    await expect(page.getByRole('tab', { name: label })).toBeVisible();
  }
  await expect(page.getByRole('tab')).toHaveCount(5);

  // Et ils fonctionnent : sauter DIRECTEMENT de la fiche vers Courses.
  await page.getByRole('tab', { name: 'Courses' }).click();
  await expect(
    page.getByText('Créer une course', { exact: true }).and(sceneActive(page)).first(),
  ).toBeVisible({ timeout: 20_000 });
});
