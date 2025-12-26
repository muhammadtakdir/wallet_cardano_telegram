"use client";

import React from "react";
import { createWalletFromMnemonic } from '@/lib/cardano';

export default function E2EWithdrawPage() {
  const [result, setResult] = React.useState<any>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    const run = async () => {
      setRunning(true);
      try {
        const { withdrawRewards } = await import("@/lib/cardano/wallet");
        
        // Create Mesh wallet instance and get addresses from it
        const mnemonic = 'test test test test test test test test test test test junk';
        const instance = await createWalletFromMnemonic(mnemonic);
        const paymentAddr = instance.address;
        // Try to get reward addresses from wallet instance (if available)
        let rewardAddr = '';
        try {
          const rewards = await instance.wallet.getRewardAddresses();
          if (rewards && rewards.length > 0) rewardAddr = rewards[0];
        } catch (e) {
          rewardAddr = 'stake_test1upec3pzlkqf0xgz69uerjartvmptwyms7td2ewlq5w4yrmgv0qd64';
        }
        // Fake MeshWallet for testing
        const fakeWallet: any = {
          getUtxos: async () => [
            {
              input: {
                txHash: 'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789',
                outputIndex: 0,
              },
              output: {
                address: paymentAddr,
                amount: [{ unit: 'lovelace', quantity: '10000000' }],
              },
            },
          ],
          getChangeAddress: async () => paymentAddr,
          getRewardAddresses: async () => [rewardAddr],
          signTx: async (tx: any) => tx, // pass-through
          submitTx: async (signed: any) => {
            // Submit via fetch to be intercepted by Playwright
            const body = typeof signed === 'string' ? signed : JSON.stringify(signed);
            const resp = await fetch('/tx/submit', { method: 'POST', body });
            const data = await resp.json();
            return data;
          },
        };

        // Sanity-check fake wallet responses to help debugging in E2E
        const debugUtxos = await fakeWallet.getUtxos();
        const debugChange = await fakeWallet.getChangeAddress();
        const debugRewards = await fakeWallet.getRewardAddresses();
        // Expose debug info on the page so E2E can inspect it
        setResult({ _debug: { debugUtxos, debugChange, debugRewards } });

        if (!debugUtxos || debugUtxos.length === 0) {
          setResult({ success: false, error: 'No UTxOs returned by fake wallet', debugUtxos, debugChange, debugRewards });
          return;
        }
        if (!debugChange) {
          setResult({ success: false, error: 'No change address returned by fake wallet', debugUtxos, debugChange, debugRewards });
          return;
        }
        if (!debugRewards || debugRewards.length === 0) {
          setResult({ success: false, error: 'No reward addresses returned by fake wallet', debugUtxos, debugChange, debugRewards });
          return;
        }

        const res = await withdrawRewards(fakeWallet as any);
        setResult({ ...res, _debug: { debugUtxos, debugChange, debugRewards } });
      } catch (err) {
        setResult({ success: false, error: err instanceof Error ? err.message : String(err), stack: err instanceof Error ? err.stack : undefined });
      } finally {
        setRunning(false);
      }
    };

    run();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>CSL Withdraw E2E Test</h1>
      <p>Running: {running ? "yes" : "no"}</p>
      <pre data-testid="result">{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}
