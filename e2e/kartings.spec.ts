import { expect, test, type Page } from '@playwright/test';

/**
 * Tests de l'onglet Kartings dans un VRAI navigateur.
 *
 * Ils existent parce que la page a été livrée deux fois avec des défauts
 * qu'aucune vérification hors navigateur ne pouvait voir : marqueurs absents,
 * page impossible à faire défiler, épingles démesurées. Un export qui se
 * génère ne prouve pas qu'une page fonctionne.
 *
 * On simule une session et on intercepte les appels Supabase : le sujet du
 * test est l'écran, pas le serveur.
 */

const CIRCUITS = [
  { id: 'c1', name: 'Circuit Beltoise-Trappes', city: 'Trappes', is_official: true, lat: 48.75988, lon: 1.99302, aliases: 'BRK · Beltoise Racing Kart', km: 12.4 },
  { id: 'c2', name: 'Kart Racer', city: 'Saran', is_official: true, lat: 47.95802, lon: 1.89454, km: 88.2 },
  { id: 'c3', name: 'Le Karting', city: 'Nantes', is_official: true, lat: 47.20078, lon: -1.57094, km: 301.7 },
  { id: 'c4', name: 'Sologne Karting', city: 'Salbris', is_official: true, lat: 47.36013, lon: 2.04984, km: 150.1 },
  // De quoi faire réellement déborder la page : la liste hors recherche est
  // plafonnée à douze, et c'est le débordement qu'on veut mesurer.
  ...Array.from({ length: 20 }, (_, i) => ({
    id: `f${i}`, name: `Karting ${i}`, city: `Ville ${i}`, is_official: true,
    lat: 43.5 + i * 0.2, lon: 1 + i * 0.15, km: 400 + i,
  })),
];

async function ouvrirKartings(page: Page) {
  // Session simulée : la garde de routes renvoie sinon vers la connexion.
  await page.addInitScript(() => {
    const dans1h = Math.floor(Date.now() / 1000) + 3600;
    const session = {
      access_token: 'faux', refresh_token: 'faux', token_type: 'bearer',
      expires_in: 3600, expires_at: dans1h,
      user: { id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated', role: 'authenticated', email: 'test@kartsquad.test', app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString() },
    };
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    }
    // Format de supabase-js v2 : la session est stockée TELLE QUELLE, sans
    // enveloppe `currentSession` (qui, elle, est la forme de la v1).
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify(session));
  });

  await page.route('**/*.supabase.co/**', async (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    if (url.includes('/rest/v1/rpc/nearby_circuits')) return json(CIRCUITS);
    if (url.includes('/rest/v1/rpc/suggest_circuit')) return json('00000000-0000-0000-0000-000000000001');
    if (url.includes('/rest/v1/profiles')) return json({ id: '11111111-1111-1111-1111-111111111111', deleted_at: null });
    if (url.includes('/auth/v1/user')) return json({ id: '11111111-1111-1111-1111-111111111111' });
    return json([]);
  });

  // Les tuiles ne doivent pas partir sur Internet pendant un test.
  await page.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([]) }),
  );

  await page.goto('/kartings');
  await expect(page.getByText('Kartings', { exact: true }).first()).toBeVisible({ timeout: 20_000 });
}

test.describe('Onglet Kartings', () => {
  test.use({ viewport: { width: 390, height: 844 } }); // iPhone 14

  test('les épingles apparaissent dès l’ouverture, et à la bonne taille', async ({ page }) => {
    await ouvrirKartings(page);
    const pins = page.locator('.ks-pin');
    await expect(pins).toHaveCount(CIRCUITS.length, { timeout: 15_000 });

    // Le défaut vu sur iPhone : à l'échelle de la France, des pastilles qui
    // se recouvrent en une tache rouge. Elles rétrécissent quand on dézoome.
    const boite = await pins.first().boundingBox();
    expect(boite).not.toBeNull();
    expect(boite!.width).toBeLessThanOrEqual(14);
  });

  test('la page défile réellement jusqu’à la liste', async ({ page }) => {
    await ouvrirKartings(page);
    // Attendre que la liste soit peuplée AVANT de mesurer : sur une page vide,
    // il n'y a évidemment rien à faire défiler, et le test passerait à côté.
    await expect(page.getByText('Sologne Karting', { exact: true })).toHaveCount(1, {
      timeout: 15_000,
    });
    // Le blocage signalé : on restait prisonnier de la carte, la liste sous
    // elle étant hors de l'écran et inaccessible. Mesuré, pas supposé — le
    // conteneur de défilement de react-native-web est un div interne.
    const marge = await page.evaluate(
      () =>
        Math.max(
          0,
          ...[...document.querySelectorAll('div')].map((d) => d.scrollHeight - d.clientHeight),
        ),
    );
    expect(marge).toBeGreaterThan(50);

    const cible = page.getByText('Sologne Karting', { exact: true });
    await cible.scrollIntoViewIfNeeded();
    await expect(cible).toBeVisible();
  });

  test('le sélecteur Carte / Liste fait réellement quelque chose', async ({ page }) => {
    await ouvrirKartings(page);
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await page.getByText('Liste', { exact: true }).click();
    await expect(page.locator('.leaflet-container')).toHaveCount(0);
    await page.getByText('Carte', { exact: true }).click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
  });

  test('signaler un karting manquant : le parcours aboutit', async ({ page }) => {
    await ouvrirKartings(page);
    const lien = page.getByText('Un karting manque ou a fermé ? Signale-le', { exact: true });
    await lien.scrollIntoViewIfNeeded();
    await lien.click();

    await expect(page.getByText('Signaler un karting', { exact: true })).toBeVisible();
    await page.getByPlaceholder('Ex. : Karting du Bocage').fill('Karting du Bocage');
    await page.getByPlaceholder('Ex. : Vire').fill('Vire');
    await page.getByText('Envoyer le signalement', { exact: true }).click();
    await expect(page.getByText(/Merci ! Un modérateur va regarder/)).toBeVisible();
  });

  test('signaler une fiche fausse depuis un circuit sélectionné', async ({ page }) => {
    await ouvrirKartings(page);
    // Sélection par la liste (les épingles sont trop petites pour un tap fiable).
    await page.getByText('Kart Racer', { exact: true }).click();
    const lien = page.getByText('Signaler un problème sur cette fiche', { exact: true });
    await lien.scrollIntoViewIfNeeded();
    await lien.click();

    // La cible est affichée, le nom prérempli, et « il manque » n'est pas
    // proposé — la fiche existe.
    await expect(page.getByText('Fiche concernée', { exact: true })).toBeVisible();
    await expect(page.getByText('Il manque', { exact: true })).toHaveCount(0);
    await page.getByText('Le nom ou la ville sont faux', { exact: true }).click();
    await page.getByText('Envoyer le signalement', { exact: true }).click();
    await expect(page.getByText(/Merci ! Un modérateur va regarder/)).toBeVisible();
  });

  test('la recherche trouve par nom, par ville et par sigle', async ({ page }) => {
    await ouvrirKartings(page);
    const champ = page.getByPlaceholder('Chercher un karting par nom ou par ville…');
    await champ.fill('Nantes');
    await expect(page.getByText('Le Karting', { exact: true })).toBeVisible();
    await expect(page.getByText('Sologne Karting', { exact: true })).toHaveCount(0);

    // Le karting de Trappes s'appelle « BRK » pour ceux qui y courent.
    await champ.fill('BRK');
    await expect(page.getByText('Circuit Beltoise-Trappes', { exact: true })).toBeVisible();
  });
});
