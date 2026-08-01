import { expect, test } from '@playwright/test';

import { reseauSimule, sceneActive, sessionSimulee } from './harness';

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

  // 2. Aller sur la carte. SÉLECTION EN DEUX TEMPS (retour PO) : un tap
  //    montre la fiche, seul « Choisir ce karting » valide et ramène.
  await page.getByText('Choisir sur la carte').click();
  await expect(page.getByText('Choisir un circuit', { exact: true })).toBeVisible();
  await page.getByText('Kart Racer', { exact: true }).click();
  // Toujours sur la carte : rien ne s'est engagé tout seul.
  await expect(page.getByText('Choisir un circuit', { exact: true })).toBeVisible();
  await page.getByText('Choisir ce circuit', { exact: true }).click();

  // 3. Retour au formulaire : la piste est sélectionnée ET la date n'a pas
  //    bougé. `sceneActive` : la carte reste montée derrière le formulaire —
  //    son marqueur « Kart Racer » déclencherait le mode strict.
  await expect(page.getByText('Kart Racer', { exact: true }).and(sceneActive(page))).toBeVisible();
  await expect(page.getByText('Modifier', { exact: true }).and(sceneActive(page))).toBeVisible();
  await expect(page.getByText(texteDate, { exact: true }).and(sceneActive(page))).toBeVisible();
});

test('rouvrir la création après un passage donne un formulaire NEUF', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/nearby_circuits': CIRCUITS });

  // Premier passage : choisir une piste sur la carte, revenir, quitter.
  await page.goto('/race/create');
  await page.getByText('Choisir sur la carte').click();
  await page.getByText('Kart Racer', { exact: true }).first().click();
  await page.getByText('Choisir ce circuit', { exact: true }).click();
  await expect(page.getByText('Modifier', { exact: true }).and(sceneActive(page))).toBeVisible();
  await page.getByText('← Courses', { exact: true }).click();

  // Second passage : l'écran doit être REMONTÉ, pas exhumé avec son état.
  // C'est le verrou de toute une famille de bugs (busy bloqué, confirmations
  // déployées, choix résiduels) née quand les écrans de détail restaient
  // montés à vie dans le navigateur d'onglets.
  // Par RÔLE, pas par texte : la checklist de prise en main affiche une ligne
  // « Créer une course » au-dessus du bouton, et un `.first()` sur le texte
  // attraperait la ligne. Elle route au même endroit aujourd'hui — donc le
  // test passerait par chance, et casserait le jour où elle est cochée.
  await page.getByRole('button', { name: 'Créer une course', exact: true }).click();
  await expect(page.getByText('Choisir sur la carte').and(sceneActive(page))).toBeVisible();
  await expect(page.getByText('Modifier', { exact: true }).and(sceneActive(page))).toHaveCount(0);
});

test('« ← Courses » fonctionne même sans historique (lien profond, PWA relancée)', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/nearby_circuits': CIRCUITS });

  // Arrivée DIRECTE sur la création : aucun historique derrière. Le bouton
  // appelait router.back() sans filet — et ne faisait rien.
  await page.goto('/race/create');
  await page.getByText('← Courses', { exact: true }).click();
  // `sceneActive` : le formulaire peut rester monté derrière — seule la liste
  // des courses de la SCÈNE ACTIVE prouve que le retour a eu lieu.
  await expect(
    page.getByRole('button', { name: 'Créer une course', exact: true }).and(sceneActive(page)),
  ).toBeVisible({ timeout: 20_000 });
});
