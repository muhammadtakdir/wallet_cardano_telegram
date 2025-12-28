"use client";

import React from "react";
import { createWalletFromMnemonic, delegateToPool, getAddressUtxos } from "@/lib/cardano";

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
        const instance = await createWalletFromMnemonic(mnemonic, network as any);

        // Ensure the Mesh wallet has UTxOs in Mesh format (convert Blockfrost format to Mesh expected format)
        try {
          const bfUtxos = await getAddressUtxos(instance.address, network as any);
          const meshUtxos = (bfUtxos || []).map((u: any) => ({
            input: {
              txHash: u.tx_hash || u.input?.txHash,
              outputIndex: (u.output_index ?? u.outputIndex ?? u.input?.outputIndex ?? 0)
            },
            output: { address: instance.address, amount: u.amount || u.output?.amount }
          }));
          // Override getUtxos to return the converted format (some Mesh versions expect this shape)
          try {
            (instance.wallet as any).getUtxos = async () => meshUtxos;
          } catch (e) {
            // ignore if we cannot override
          }
        } catch (e) {
          // ignore
        }

        const res = await delegateToPool(instance.wallet, poolId, network as any);
        // Include UTox debug for E2E troubleshooting
        let debugUtxos: any = null;
        try {
          if ((instance.wallet as any).getUtxos) {
            debugUtxos = await (instance.wallet as any).getUtxos();
          }
        } catch (e) {
          debugUtxos = { error: String(e) };
        }

        setResult({ result: res, debugUtxos });
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
