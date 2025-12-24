import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run tests inside `src/` and exclude external packages and e2e tests
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    exclude: ['node_modules/**', 'tests/e2e/**', 'playwright.config.ts'],
    environment: 'node',
  },
});