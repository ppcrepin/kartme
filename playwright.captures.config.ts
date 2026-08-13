import { defineConfig, devices } from '@playwright/test';

/**
 * Config dédiée à la campagne de captures App Store — la config principale
 * IGNORE volontairement les specs `_*.spec.ts` pour ne pas ralentir la suite.
 *
 *   npx playwright test -c playwright.captures.config.ts
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/_captures-appstore.spec.ts',
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:8081',
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: { executablePath: process.env.PW_CHROMIUM ?? undefined },
      },
    },
  ],
  webServer: {
    command: 'npx expo start --web --port 8081',
    url: 'http://localhost:8081',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
