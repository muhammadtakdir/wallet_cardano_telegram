"use client";

import React from "react";
import { withdrawRewards } from "@/lib/cardano/wallet";
import * as bip39 from 'bip39';
import {
  Bip32PrivateKey,
  BaseAddress,
  Credential,
  RewardAddress,
} from '@emurgo/cardano-serialization-lib-browser';

export default function E2EWithdrawPage() {
  const [result, setResult] = React.useState<any>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    const run = async () => {
      setRunning(true);
      try {
        // Derive a deterministic payment address from mnemonic to ensure a valid KeyHash address
        const mnemonic = 'test test test test test test test test test test test junk';
        const entropy = bip39.mnemonicToEntropy(mnemonic);
        const rootKey = Bip32PrivateKey.from_bip39_entropy(Buffer.from(entropy, 'hex'), Buffer.from(''));
        const accountKey = rootKey.derive(1852 | 0x80000000).derive(1815 | 0x80000000).derive(0 | 0x80000000);
        const paymentKey = accountKey.derive(0).derive(0);
        const paymentPubKey = paymentKey.to_public();
        const stakeKey = accountKey.derive(2).derive(0);
        const stakePubKey = stakeKey.to_public();
        const networkId = 0; // testnet
        const baseAddr = BaseAddress.new(
          networkId,
          Credential.from_keyhash(paymentPubKey.to_raw_key().hash()),
          Credential.from_keyhash(stakePubKey.to_raw_key().hash())
        );
        const paymentAddr = baseAddr.to_address().to_bech32();
        const rewardAddr = RewardAddress.new(networkId, Credential.from_keyhash(stakePubKey.to_raw_key().hash())).to_address().to_bech32();

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
