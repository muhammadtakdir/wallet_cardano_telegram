import { test, expect } from '@playwright/test';

// Playwright will start the Next dev server using playwright.config's webServer
// This test intercepts Blockfrost calls and returns mocked responses

const TEST_UTXO = [
  {
    tx_hash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
    output_index: 0,
    amount: [
      { unit: 'lovelace', quantity: '10000000' },
      { unit: '2b28c81dbba6d67e4b5a997c6be1212cba9d60d33f82444ab8b1f218.42414e4b', quantity: '1273639' }
    ]
  }
];

test('full browser E2E: delegateToPool (Mesh) submits tx', async ({ page }) => {
  // Intercept UTxO request
  await page.route('**/addresses/**/utxos', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TEST_UTXO) });
  });

  // Intercept accounts (stake address) - return 404 (not registered yet)
  await page.route('**/accounts/**', route => {
    route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'not found' }) });
  });

  // Intercept pool info (optional) - return minimal pool metadata
  await page.route('**/pools/**', route => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ pool_id: 'a'.repeat(56), hex: '', vrf_key: '', active_stake: '0', live_stake: '0', margin: { numerator: 0, denominator: 1 }, pledge: '0', blocks_minted: 0, reward_account: '' })
    });
  });

  // Intercept tx submit
  await page.route('**/tx/submit', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('txhash_e2e_123') });
  });

  // Visit test page which will run the delegateToPoolCSL function
  await page.goto('http://localhost:3000/test/e2e-stake');

  // Wait for result to be populated
  const pre = await page.locator('pre[data-testid="result"]');
  await expect(pre).toHaveText(/"success":\s*true/);
  await expect(pre).toHaveText(/txhash_e2e_123/);
});