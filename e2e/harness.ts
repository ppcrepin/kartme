import type { Page } from '@playwright/test';

/**
 * Harnais commun des tests navigateur : session simulée + réseau intercepté.
 *
 * La garde de routes renvoie vers la connexion sans session — le test de
 * fumée est resté rouge des semaines sans que personne ne le voie, parce
 * qu'aucun pipeline ne le lançait. Depuis, les tests navigateur font partie
 * de la vérification de chaque lot d'écran.
 */
export const UID = '11111111-1111-1111-1111-111111111111';

/**
 * Restreint un localisateur à la SCÈNE ACTIVE.
 *
 * Depuis que les écrans de détail vivent dans le groupe (tabs), chaque scène
 * visitée reste MONTÉE sur web : empilée derrière l'écran actif (zIndex -1,
 * aria-hidden), sans display:none. `getByText` traverse ces scènes cachées et
 * déclenche des violations du mode strict — un « Kart Racer » du formulaire ET
 * un du marqueur de carte resté derrière, par exemple. À intersecter via
 * `.and(sceneActive(page))` sur toute assertion qui suit une navigation.
 */
export function sceneActive(page: Page) {
  return page.locator('xpath=//*[not(ancestor-or-self::*[@aria-hidden="true"])]');
}

/**
 * Neutralise la superposition d'erreurs du serveur de DEV (#error-toast,
 * @expo/metro-runtime) : un simple avertissement React la fait apparaître
 * au-dessus de la barre d'onglets où elle GOBE les clics des tests. Elle
 * n'existe pas dans l'export de production — la masquer ne cache aucun bug
 * de l'app (les erreurs restent visibles dans la console du navigateur).
 */
async function sansToastErreurDev(page: Page) {
  await page.addInitScript(() => {
    addEventListener('DOMContentLoaded', () => {
      const style = document.createElement('style');
      style.textContent = '#error-toast{display:none!important;pointer-events:none!important}';
      document.head.appendChild(style);
    });
  });
}

export async function sessionSimulee(page: Page) {
  await sansToastErreurDev(page);
  await page.addInitScript(() => {
    const dans1h = Math.floor(Date.now() / 1000) + 3600;
    const session = {
      access_token: 'faux', refresh_token: 'faux', token_type: 'bearer',
      expires_in: 3600, expires_at: dans1h,
      user: {
        id: '11111111-1111-1111-1111-111111111111', aud: 'authenticated',
        role: 'authenticated', email: 'test@kartsquad.test',
        app_metadata: {}, user_metadata: {}, created_at: new Date(0).toISOString(),
      },
    };
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith('sb-')) localStorage.removeItem(k);
    }
    // Format supabase-js v2 : la session est stockée TELLE QUELLE, sans
    // l'enveloppe `currentSession` de la v1.
    localStorage.setItem('sb-placeholder-auth-token', JSON.stringify(session));
  });
}

/**
 * Intercepte Supabase avec des réponses par défaut inertes, complétées par
 * les cas propres au test. Aucune requête ne part sur Internet.
 */
export async function reseauSimule(
  page: Page,
  reponses: Record<string, unknown> = {},
) {
  await page.route('**/*.supabase.co/**', async (route) => {
    const url = route.request().url();
    const json = (body: unknown) =>
      route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    for (const [motif, corps] of Object.entries(reponses)) {
      if (url.includes(motif)) return json(corps);
    }
    if (url.includes('/rest/v1/profiles')) return json({ id: UID, deleted_at: null });
    if (url.includes('/auth/v1/user')) return json({ id: UID });
    return json([]);
  });
  await page.route('**/tile.openstreetmap.org/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from([]) }),
  );
}
