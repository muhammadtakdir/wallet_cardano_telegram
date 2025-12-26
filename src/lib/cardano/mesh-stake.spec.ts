import { describe, it, expect, vi, afterEach } from 'vitest';
import { delegateToPoolMesh } from './mesh-stake';
import * as meshCore from '@meshsdk/core';

describe('delegateToPoolMesh - payment key hash mapping', () => {
  // install a default mock MeshTxBuilder to avoid ESM export spying issues
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

  afterEach(() => {
    vi.restoreAllMocks();
    (globalThis as any).__MeshTxBuilderMock = _origMeshTxBuilder;
  });

  it('excludes UTxOs whose payment key hash is not in the wallet payment key set', async () => {
    // Arrange: mock resolvePaymentKeyHash via global hook (ESM-friendly)
    const origResolve = (globalThis as any).__resolvePaymentKeyHash;
    (globalThis as any).__resolvePaymentKeyHash = (addr: string) => {
      if (String(addr).includes('nonowned')) return 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'.slice(0, 56);
      if (String(addr).includes('owned')) return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'.slice(0, 56);
      throw new Error('could not resolve');
    };

    const wallet: any = {
      getUtxos: async () => [
        { output: { address: 'addr_nonowned_1' }, input: { txHash: 'tx1' }, amount: [] },
      ],
      getChangeAddress: async () => 'addr_owned_change',
      getRewardAddresses: async () => ['addr_reward'],
      getUsedAddresses: async () => [],
      getUnusedAddresses: async () => [],
    };

    // Act
    const res = await delegateToPoolMesh(wallet as any, 'pool1', 'testnet' as any);

    

    // restore resolvePaymentKeyHash override
    (globalThis as any).__resolvePaymentKeyHash = origResolve;

    // Assert
    expect(res.success).toBe(false);
    expect(res._debug).toBeDefined();
    expect(Array.isArray(res._debug.excludedUtxos)).toBe(true);
    expect(res._debug.excludedUtxos.length).toBeGreaterThan(0);
    expect(res._debug.walletPaymentKeyHashes).toBeDefined();
    expect(res._debug.walletPaymentKeyHashes.some((h: string) => h.startsWith('aa'))).toBe(true);
  });

  it('maps MissingVKeyWitnesses keyhash from submit error to offending UTxOs and addresses', async () => {
    const missingHash = '6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445';

    // Mock resolvePaymentKeyHash via global hook so offending address maps to the missing hash
    const origResolve2 = (globalThis as any).__resolvePaymentKeyHash;
    (globalThis as any).__resolvePaymentKeyHash = (addr: string) => {
      if (String(addr).includes('offending')) return missingHash;
      if (String(addr).includes('owned')) return 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'.slice(0, 56);
      throw new Error('could not resolve');
    };

    // Mock MeshTxBuilder via global hook to avoid ESM spy limitations
    const origMeshTxBuilder = (globalThis as any).__MeshTxBuilderMock;
    (globalThis as any).__MeshTxBuilderMock = function () {
      return {
        registerStakeCertificate() { return this; },
        delegateStakeCertificate() { return this; },
        changeAddress() { return this; },
        selectUtxosFrom() { return this; },
        complete: async () => ({ unsigned: true }),
      } as any;
    };

    const wallet: any = {
      getUtxos: async () => [
        { output: { address: 'addr_offending_1' }, input: { txHash: 'tx1' }, amount: [] },
      ],
      getChangeAddress: async () => 'addr_owned_change',
      getRewardAddresses: async () => ['addr_reward'],
      getUsedAddresses: async () => ['addr_offending_1'],
      getUnusedAddresses: async () => [],
      signTx: async () => ({ signed: true }),
      submitTx: async () => {
        throw new Error(`ConwayUtxowFailure: MissingVKeyWitnessesUTXOW (KeyHash ${missingHash})`);
      },
    };

    // Act
    const res = await delegateToPoolMesh(wallet as any, 'pool1', 'testnet' as any);

    

    // restore global MeshTxBuilder mock
    (globalThis as any).__MeshTxBuilderMock = origMeshTxBuilder;

    // restore resolvePaymentKeyHash override
    (globalThis as any).__resolvePaymentKeyHash = origResolve2;

    // Assert
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/missing signature|MissingVKeyWitnesses|missing signature\(s\)/i);
    expect(res._debug).toBeDefined();
    expect(Array.isArray(res._debug.missingKeyHashes)).toBe(true);
    expect(res._debug.missingKeyHashes).toContain(missingHash);
    expect(Array.isArray(res._debug.offendingUtxos)).toBe(true);
    expect(res._debug.offendingUtxos.length).toBeGreaterThan(0);
    expect(res._debug.offendingUtxos[0].address).toMatch(/offending/);
  });
});