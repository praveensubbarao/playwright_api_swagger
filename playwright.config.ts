import { defineConfig } from '@playwright/test';

/**
 * One Playwright project per API under apis/.
 * Add a new project block here when bootstrapping a new SWAGGER_URI.
 *
 * baseURL is read from the env var  <NAME>_BASE_URL  so each API can be
 * pointed at a different environment without touching this file:
 *
 *   PETSTORE_BASE_URL=https://staging.petstore.io/v2/ npm test
 */
export default defineConfig({
  timeout: 30_000,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { open: 'never' }],
  ],
  use: {
    extraHTTPHeaders: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
  },
  projects: [
    // ── SWAGGER_URI_1 ────────────────────────────────────────────────────────
    {
      name: 'petstore',
      testDir: 'apis/petstore/tests',
      use: {
        baseURL: process.env.PETSTORE_BASE_URL ?? 'https://petstore.swagger.io/v2/',
      },
    },

    // ── SWAGGER_URI_2  (uncomment and fill in when adding a new API) ─────────
    // {
    //   name: 'my-other-api',
    //   testDir: 'apis/my-other-api/tests',
    //   use: {
    //     baseURL: process.env.MY_OTHER_API_BASE_URL ?? 'https://my-other-api.example.com/v1/',
    //   },
    // },
  ],
});
