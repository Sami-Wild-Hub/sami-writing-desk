import { defineConfig, devices } from '@playwright/test';

const environment = (globalThis as typeof globalThis & {
  process?: { env?: Record<string, string | undefined> };
}).process?.env ?? {};
const repository = (environment.GITHUB_REPOSITORY ?? '').split('/')[1];
const projectSite = repository && !repository.endsWith('.github.io');
const basePath = environment.GITHUB_ACTIONS === 'true' && projectSite ? `/${repository}/` : '/';
const previewUrl = `http://127.0.0.1:4322${basePath}`;

// The browser tests sign in against a stubbed Firebase (tests/book-views.spec.ts), so they
// run on a separate build in dist-stub that carries the stub config; dist stays untouched.
const stubFirebaseEnv = {
  PUBLIC_FIREBASE_API_KEY: 'novel-stub-key',
  PUBLIC_FIREBASE_AUTH_DOMAIN: 'novel-stub.firebaseapp.com',
  PUBLIC_FIREBASE_PROJECT_ID: 'novel-stub',
  PUBLIC_FIREBASE_DATABASE_URL: 'https://novel-stub.firebaseio.com',
  PUBLIC_FIREBASE_APP_ID: '1:1:web:novelstub',
  PUBLIC_FAMILY_HOUSEHOLD_ID: 'novel-stub-house',
};

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  retries: 0,
  reporter: 'line',
  use: {
    baseURL: previewUrl,
    ...devices['Desktop Chrome'],
    viewport: { width: 390, height: 844 },
    colorScheme: 'light',
  },
  webServer: {
    command: 'node ./node_modules/astro/astro.js build --outDir dist-stub && node ./node_modules/astro/astro.js preview --outDir dist-stub --host 127.0.0.1 --port 4322',
    env: stubFirebaseEnv,
    url: previewUrl,
    reuseExistingServer: false,
    timeout: 240_000,
  },
});
