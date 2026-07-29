import { expect, test } from '@playwright/test';

import { reseauSimule, sessionSimulee } from './harness';

/**
 * Fiche circuit (A11) dans un vrai navigateur.
 *
 * Les trois promesses à tenir : le record et le tableau s'affichent ; un
 * profil privé garde son TEMPS mais perd son NOM ; une fiche sans chrono
 * lance un défi au lieu de montrer un tableau vide.
 */

const PAGE_ACTIVE = {
  id: 'c1', name: 'Sologne Karting', city: 'Salbris', lat: 47.36, lon: 2.05,
  aliases: 'Karting de Salbris', website: 'https://exemple.fr', phone: '+33 2 00 00 00 00',
  is_indoor: false, races_count: 14, pilots_count: 9,
  last_race_at: '2026-07-12T10:00:00Z', my_races_count: 3, my_best_lap_ms: 49870,
  laps_all: 3, laps_year: 3, laps_month: 3,
};

const TOP = [
  { rank: 1, pilot_id: 'p1', username: 'Martin_R', best_lap_ms: 47312, achieved_at: '2026-01-12T10:00:00Z', is_me: false },
  { rank: 2, pilot_id: null, username: null, best_lap_ms: 48101, achieved_at: '2026-03-03T10:00:00Z', is_me: false },
  { rank: 3, pilot_id: '11111111-1111-1111-1111-111111111111', username: 'Moi', best_lap_ms: 49870, achieved_at: '2026-07-12T10:00:00Z', is_me: true },
];

test.use({ viewport: { width: 390, height: 844 } });

test('la fiche affiche record, tableau, et anonymise le privé', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_circuit_page': [PAGE_ACTIVE],
    'rpc/get_circuit_top_times': TOP,
  });
  await page.goto('/circuit/c1');

  await expect(page.getByText('Sologne Karting', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Record du circuit')).toBeVisible();
  // .first() : le temps du record apparaît deux fois, en grand ET au rang 1.
  await expect(page.getByText('0:47.312', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Martin_R', { exact: true }).first()).toBeVisible();
  // Le privé : son temps est là, son nom est « Pilote privé ».
  await expect(page.getByText('0:48.101', { exact: true })).toBeVisible();
  await expect(page.getByText('Pilote privé', { exact: true })).toBeVisible();
  // Ma ligne et mon meilleur perso.
  await expect(page.getByText('Ton meilleur tour ici : 0:49.870')).toBeVisible();
  // La vie du circuit.
  await expect(page.getByText('14 courses · 9 pilotes', { exact: false })).toBeVisible();
});

test('une fiche sans chrono lance un défi, pas un tableau vide', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/get_circuit_page': [
      { ...PAGE_ACTIVE, id: 'c9', name: 'Karting Désert', races_count: 0, pilots_count: 0,
        my_races_count: 0, my_best_lap_ms: null, laps_all: 0, laps_year: 0, laps_month: 0,
        website: null, phone: null, last_race_at: null },
    ],
    'rpc/get_circuit_top_times': [],
  });
  await page.goto('/circuit/c9');

  await expect(page.getByText('Karting Désert', { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Sois le premier à inscrire ton nom', { exact: false })).toBeVisible();
  await expect(page.getByText('Record du circuit')).toHaveCount(0);
  await expect(page.getByText('Créer une course ici', { exact: true })).toBeVisible();
});

test('la fiche s’ouvre depuis l’onglet Kartings', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, {
    'rpc/nearby_circuits': [
      { id: 'c1', name: 'Sologne Karting', city: 'Salbris', is_official: true, lat: 47.36, lon: 2.05, km: 12 },
    ],
    'rpc/get_circuit_page': [PAGE_ACTIVE],
    'rpc/get_circuit_top_times': TOP,
  });
  await page.goto('/kartings');
  await page.getByText('Sologne Karting', { exact: true }).first().click();
  await page.getByText('Voir la fiche', { exact: true }).click();
  await expect(page.getByText('Record du circuit')).toBeVisible({ timeout: 20_000 });
});
