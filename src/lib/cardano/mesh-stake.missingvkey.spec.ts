import { describe, it, expect, afterEach } from 'vitest';
import { delegateToPoolMesh } from './mesh-stake';

// Patch global for test
const origResolvePaymentKeyHash = globalThis.__resolvePaymentKeyHash;
globalThis.__resolvePaymentKeyHash = (addr: string) => {
  // Simulate a valid KeyHash address (hex string, 56 chars)
  if (String(addr).startsWith('addr_test1_vkh_')) return '6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445';
  if (String(addr).startsWith('addr_test1_vkh_other')) return 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  throw new Error('could not resolve');
};

// Provide a MeshTxBuilder mock for this test file as well
const _origMeshTxBuilder = (globalThis as any).__MeshTxBuilderMock;
(globalThis as any).__MeshTxBuilderMock = function () {
  return {
    registerStakeCertificate() { return this; },
    delegateStakeCertificate() { return this; },
    changeAddress() { return this; },
    selectUtxosFrom() { return this; },
    complete: async () => ({ unsigned: true }),
  } as any;
};

describe('delegateToPoolMesh - MissingVKeyWitnesses error mapping', () => {
  afterEach(() => {
    globalThis.__resolvePaymentKeyHash = origResolvePaymentKeyHash;
  });

  it('maps MissingVKeyWitnesses error to offending address and key hash', async () => {
    // Use valid KeyHash address format for MeshTxBuilder
    const wallet: any = {
      getUtxos: async () => [
        { output: { address: 'addr_test1_vkh_1' }, input: { txHash: 'tx1' }, amount: [] },
        { output: { address: 'addr_test1_vkh_other1' }, input: { txHash: 'tx2' }, amount: [] },
      ],
      getChangeAddress: async () => 'addr_test1_vkh_1',
      getRewardAddresses: async () => ['addr_test1_vkh_1'],
      getUsedAddresses: async () => ['addr_test1_vkh_1'],
      getUnusedAddresses: async () => [],
      signTx: async () => { throw new Error('ConwayUtxowFailure:MissingVKeyWitnessesUTXOW [KeyHashObj 6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445]'); },
      submitTx: async () => { throw new Error('should not reach'); },
    };

    const res = await delegateToPoolMesh(wallet as any, 'pool1', 'testnet' as any);
    expect(res.success).toBe(false);
    expect(res.error).toContain('missing signature');
    expect(res.error).toContain('6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445');
    expect(res._debug).toBeDefined();
    expect(res._debug.missingKeyHashes).toContain('6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445');
    expect(res._debug.offendingUtxos.some((u: any) => u.address === 'addr_test1_vkh_1')).toBe(true);
  });

  // restore globals
  (globalThis as any).__resolvePaymentKeyHash = origResolvePaymentKeyHash;
  (globalThis as any).__MeshTxBuilderMock = _origMeshTxBuilder;
});
