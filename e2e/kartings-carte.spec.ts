import { expect, test } from '@playwright/test';

import { reseauSimule, sessionSimulee } from './harness';

/**
 * La carte des kartings — le bug signalé au test utilisateur du 2026-08-01 :
 * « au clic sur certains kartings, retient la localisation précédente au lieu
 * de la vue courante ».
 *
 * Il tenait à un écart entre le DESSIN et la ZONE DE CLIC : la boîte du
 * marqueur faisait 16 px pour une pastille visible de 10 px au zoom « loin ».
 * Les six pixels invisibles recouvraient la pastille du voisin — et Leaflet
 * empile ses marqueurs par latitude, le plus au sud au-dessus. On visait un
 * karting, on en sélectionnait un autre, systématiquement le précédent dans la
 * liste triée par distance. Rien dans le type, le lint ou la lecture ne pouvait
 * le montrer : il faut cliquer, aux vraies coordonnées, sur une vraie carte.
 */
const CIRCUITS = Array.from({ length: 12 }, (_, i) => ({
  id: `c${i}`,
  name: `Karting ${i}`,
  city: `Ville ${i}`,
  is_official: true,
  // Un chapelet nord-sud serré, comme l'Île-de-France ou Rhône-Alpes sur le
  // vrai référentiel : c'est là que les zones de clic se chevauchaient.
  lat: 47.6 - i * 0.28,
  lon: 2.3 + (i % 2) * 0.35,
  km: 10 + i,
}));

test.use({ viewport: { width: 390, height: 844 } });

/** Les épingles réellement DANS le cadre de la carte, avec leur centre. */
async function epinglesVisibles(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const carte = document.querySelector('.leaflet-container')?.getBoundingClientRect();
    if (!carte) return [];
    return [...document.querySelectorAll('.leaflet-marker-icon')]
      .map((m) => {
        const r = m.querySelector('.ks-pin')?.getBoundingClientRect();
        return r ? { titre: m.getAttribute('title') ?? '', x: r.x + r.width / 2, y: r.y + r.height / 2 } : null;
      })
      .filter((p): p is { titre: string; x: number; y: number } => {
        if (!p) return false;
        // Une marge de 12 px : une épingle à ras du bord n'est pas un cas
        // représentatif, et son centre peut tomber hors du conteneur.
        return p.x > carte.left + 12 && p.x < carte.right - 12
          && p.y > carte.top + 12 && p.y < carte.bottom - 12;
      });
  });
}

test('un tap sur une épingle sélectionne CELLE-LÀ', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/nearby_circuits': CIRCUITS });
  await page.goto('/kartings');
  await expect(page.getByText('Karting 0', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  const epingles = await epinglesVisibles(page);
  // Sans épingle dans le cadre, le test ne prouverait rien — mieux vaut qu'il
  // échoue bruyamment que de passer à vide.
  expect(epingles.length).toBeGreaterThanOrEqual(4);

  const rates: string[] = [];
  for (const e of epingles) {
    await page.mouse.click(e.x, e.y);
    await page.waitForTimeout(350);
    const obtenu = await page.evaluate(
      () => document.querySelector('.ks-pin-on')?.parentElement?.getAttribute('title') ?? 'aucun halo',
    );
    if (obtenu !== e.titre) rates.push(`visé « ${e.titre} » → « ${obtenu} »`);
  }
  expect(rates).toEqual([]);
});

test('la zone de clic d’une épingle ne dépasse pas son dessin', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/nearby_circuits': CIRCUITS });
  await page.goto('/kartings');
  await expect(page.getByText('Karting 0', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // La garantie de fond, indépendante du zoom : la BOÎTE du marqueur ne prend
  // aucun clic, seule la pastille en prend. C'est ce qui empêche le défaut de
  // revenir si les tailles changent un jour.
  const verdict = await page.evaluate(() => {
    const m = document.querySelector('.leaflet-marker-icon');
    const pin = m?.querySelector('.ks-pin');
    if (!m || !pin) return 'aucune épingle';
    const boite = getComputedStyle(m).pointerEvents;
    const pastille = getComputedStyle(pin).pointerEvents;
    return `boîte=${boite} pastille=${pastille}`;
  });
  expect(verdict).toBe('boîte=none pastille=auto');
});

test('choisir un karting hors cadre ramène la carte dessus', async ({ page }) => {
  await sessionSimulee(page);
  await reseauSimule(page, { 'rpc/nearby_circuits': CIRCUITS });
  await page.goto('/kartings');
  await expect(page.getByText('Karting 0', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
  await page.waitForTimeout(1500);

  // Choisir dans la LISTE sous la carte ne bougeait jamais la vue : on pouvait
  // sélectionner un karting du sud avec la carte centrée sur le nord, et
  // l'épingle choisie se retrouvait hors écran, sans halo visible. C'est la
  // seconde moitié du signalement — « au lieu de la vue courante ».
  await page.getByText('Liste', { exact: true }).click();
  await page.getByText('Karting 11', { exact: true }).first().click();
  await page.waitForTimeout(500);
  await page.getByText('Carte', { exact: true }).click();
  await page.waitForTimeout(1500);

  const visible = await page.evaluate(() => {
    const carte = document.querySelector('.leaflet-container')?.getBoundingClientRect();
    const halo = document.querySelector('.ks-pin-on')?.getBoundingClientRect();
    if (!carte || !halo) return 'pas de halo';
    const dedans = halo.x > carte.left && halo.right < carte.right
      && halo.y > carte.top && halo.bottom < carte.bottom;
    return dedans ? 'dans le cadre' : 'hors cadre';
  });
  expect(visible).toBe('dans le cadre');
});
