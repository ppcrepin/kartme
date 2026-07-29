import { expect, test } from '@playwright/test';

import { reseauSimule, sessionSimulee } from './harness';

/**
 * Le pont création de course → carte → retour (décision PO 2026-07-29).
 *
 * La promesse à tenir : choisir une piste sur la carte SANS perdre ce qui est
 * déjà saisi dans le formulaire. C'est la friction qui motivait le lot — avant,
 * explorer la carte signifiait abandonner la création et repartir de zéro.
 */
const CIRCUITS = [
  { id: 'c1', name: 'Kart Racer', city: 'Saran', is_official: true, lat: 47.95802, lon: 1.89454, km: 12.1 },
  { id: 'c2', name: 'Sologne Karting', city: 'Salbris', is_official: true, lat: 47.36013, lon: 2.04984, km: 88.4 },
];

test.use({ viewport: { width: 390, height: 844 } });

test('choisir sur la carte préserve la date déjà saisie', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/nearby_circuits': CIRCUITS });

  await page.goto('/race/create');
  await expect(page.getByText('Choisir sur la carte')).toBeVisible({ timeout: 20_000 });

  // 1. Modifier la date : ouvrir le calendrier, choisir le jour 28. La valeur
  //    par défaut serait recréée à l'identique par un remontage — seule une
  //    valeur MODIFIÉE prouve que l'état a survécu.
  await page.getByText('▼').click();
  await page.getByText('28', { exact: true }).first().click();
  const champDate = page.getByText(/·\s\d{2}:\d{2}/);
  await expect(champDate).toContainText('28');
  const texteDate = (await champDate.textContent()) ?? '';

  // 2. Aller sur la carte, choisir une piste dans la liste.
  await page.getByText('Choisir sur la carte').click();
  await expect(page.getByText('Choisir un karting', { exact: true })).toBeVisible();
  await page.getByText('Kart Racer', { exact: true }).click();

  // 3. Retour au formulaire : la piste est sélectionnée ET la date n'a pas bougé.
  await expect(page.getByText('Kart Racer', { exact: true })).toBeVisible();
  await expect(page.getByText('Modifier', { exact: true })).toBeVisible();
  await expect(page.getByText(texteDate, { exact: true })).toBeVisible();
});
