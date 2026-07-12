import { expect, test } from '@playwright/test';

/**
 * Smoke test du shell : l'app web démarre et les 4 onglets sont présents.
 */
test('le shell affiche les 4 onglets', async ({ page }) => {
  await page.goto('/');

  for (const label of ['Courses', 'Classements', 'Amis', 'Profil']) {
    await expect(page.getByText(label, { exact: true }).first()).toBeVisible();
  }
});
