import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 120000,
  webServer: {
    command: 'npm run dev',
    port: 3000,
    timeout: 180000,
    reuseExistingServer: true,
  },
  use: {
    headless: true,
    viewport: { width: 1280, height: 720 },
    actionTimeout: 20000,
    navigationTimeout: 120000,
  },
});