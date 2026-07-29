import { expect, test } from '@playwright/test';

import { reseauSimule, sessionSimulee } from './harness';

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
