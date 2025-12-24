# Running tests locally

Quick commands to run tests non-interactively from the terminal:

- Install: npm ci
- Install Playwright browsers (required for E2E): npx playwright install --with-deps

Run unit tests:
- npm run test:unit

Run e2e tests (Playwright):
- npm run test:e2e

Run everything (unit + e2e):
- npm run test:all

Run full CI-style flow (install, build, install browsers, tests):
- npm run ci:test

Notes:
- E2E tests run headless and start the dev server automatically via playwright.config.ts
- All external network calls used by tests are intercepted/mocked; you do not need Blockfrost keys to run the tests locally.
- If you prefer to run e2e while the dev server is already running, set "reuseExistingServer: true" in playwright.config.ts (already enabled).

Mesh-only staking (DEV)
- To force the app to use Mesh-based staking only (no fallback to CSL), set the environment variable MESH_ONLY=true or NEXT_PUBLIC_MESH_ONLY=true when running dev or tests.
- Example (PowerShell):
  $env:NEXT_PUBLIC_MESH_ONLY = "true"; npm run dev
  $env:NEXT_PUBLIC_MESH_ONLY = "true"; npm run test:all

