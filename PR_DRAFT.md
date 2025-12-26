Title: e2e(mesh): make Mesh staking E2E pass — add Blockfrost mocks, UTxO shim, and debug info

Summary:
- Improve local Playwright E2E for Mesh-based staking so delegation completes successfully without requiring CSL fallback.
- Add Blockfrost route mocks for `/accounts/:stakeAddress` and `/pools/:poolId` in `tests/e2e/staking.spec.ts`.
- Add an E2E page shim (`src/app/test/e2e-stake/page.tsx`) that converts Blockfrost UTxOs to the Mesh wallet UTxO shape and provides helpful debug output when things fail.
- Surface Mesh stack/debug info from `delegateToPoolMesh` (`_debug.stack`) and propagate into `delegateToPool` when Mesh-only is enabled, to aid local troubleshooting.

Files changed (high level):
- tests/e2e/staking.spec.ts — add Blockfrost mocks
- src/app/test/e2e-stake/page.tsx — UTxO conversion & debug output
- src/lib/cardano/mesh-stake.ts — include _debug stack on failure
- src/lib/cardano/wallet.ts — include Mesh debug info in returned result
- CHANGELOG.md — documented the hotfix
- package.json / lockfile — incidental updates

Testing performed locally:
- `npm run test:unit` (Vitest) — all unit tests passed (some CSL tests skipped intentionally)
- `npm run test:e2e` (Playwright) — both `staking.spec.ts` and `withdraw.spec.ts` passed locally

Notes & rationale:
- This change keeps Playwright E2E local-only (per prior request). No E2E steps were re-enabled in remote CI.
- The UTxO conversion shim is intentionally minimal and used only in the E2E test page to ensure Mesh receives the expected UTxO fields (`input.txHash`, `input.outputIndex`, `output.amount`). We can later extract this into a test helper for reuse.
- Mesh-only staking remains the intended runtime behavior; the PR adds better diagnostics rather than re-enabling CSL fallback.

Requested action from reviewer:
- Review changes and confirm they look good. If approved, I will push `e2e/mesh-stake-fix` to the remote and open a PR with this description.

