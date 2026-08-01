import { defineConfig, devices } from '@playwright/test';

/**
 * Tests end-to-end sur la cible web (Expo). Le serveur de dev est démarré
 * automatiquement par Playwright avant la suite.
 * Docs : https://playwright.dev/docs/test-configuration
 */
export default defineConfig({
  testDir: './e2e',
  // Les specs d'audit visuel (captures + mesures, sans assertion) se nomment
  // `_*.spec.ts` : elles sont écrites pour une campagne, pas pour la suite, et
  // une seule oubliée dans le dépôt ralentit tous les lancements suivants.
  testIgnore: '**/_*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Chromium est pré-installé dans l'environnement d'exécution ; sans ce
        // chemin, Playwright cherche une version qu'il faudrait télécharger.
        // Chromium est pré-installé dans certains environnements ; PW_CHROMIUM
        // évite alors un téléchargement inutile. Absent, Playwright utilise sa
        // propre copie.
        launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined },
      },
    },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
