"use client";

import React from "react";
import { createWalletFromMnemonic, delegateToPool } from "@/lib/cardano";

export default function E2EStakePage() {
  const [result, setResult] = React.useState<any>(null);
  const [running, setRunning] = React.useState(false);

  React.useEffect(() => {
    const run = async () => {
      setRunning(true);
      try {
        // Test inputs (can be overridden via query params)
        const url = new URL(window.location.href);
        const mnemonic = url.searchParams.get("mnemonic") || "test test test test test test test test test test test junk";
        const poolId = url.searchParams.get("poolId") || "a".repeat(56);
        const blockfrostKey = url.searchParams.get("key") || "testkey";
        const network = (url.searchParams.get("network") || "preprod") as any;

        // Create a Mesh wallet instance from mnemonic and use delegateToPool wrapper
        const instance = await createWalletFromMnemonic(mnemonic);
        const res = await delegateToPool(instance.wallet, poolId, network as any);
        setResult(res);
      } catch (err) {
        setResult({ success: false, error: err instanceof Error ? err.message : String(err) });
      } finally {
        setRunning(false);
      }
    };

    // Allow page to be visited safely multiple times
    run();
  }, []);

  return (
    <div style={{ padding: 20 }}>
      <h1>CSL Stake E2E Test</h1>
      <p>Running: {running ? "yes" : "no"}</p>
      <pre data-testid="result">{JSON.stringify(result, null, 2)}</pre>
    </div>
  );
}
