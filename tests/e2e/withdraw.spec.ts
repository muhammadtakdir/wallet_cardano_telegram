import { test, expect } from '@playwright/test';

test('full browser E2E: withdrawRewards submits tx', async ({ page }) => {
  // Intercept account info (withdrawable rewards) for any stake address
  await page.route('**/accounts/**', route => {
    const pathname = new URL(route.request().url()).pathname;
    const stakeAddress = pathname.split('/').pop();
    const body = {
      stake_address: stakeAddress,
      withdrawable_amount: '5000000',
      active: true,
      pool_id: null,
    };
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
  });

  // Intercept tx submit
  await page.route('**/tx/submit', route => {
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify('txhash_withdraw_123') });
  });

  await page.goto('http://localhost:3000/test/e2e-withdraw');

  const pre = await page.locator('pre[data-testid="result"]');
  // Wait a bit for the page to populate
  await page.waitForTimeout(1000);
  const text = await pre.textContent();
  console.log('E2E withdraw result:', text);

  await expect(pre).toHaveText(/"success":\s*true/);
  await expect(pre).toHaveText(/txhash_withdraw_123/);
});