import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as meshStake from './mesh-stake';
import { delegateToPool } from './wallet';

describe('wallet delegateToPool integration (mocked Mesh)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when mesh-stake returns success', async () => {
    const fakeWallet = { getUtxos: async () => [{}], getChangeAddress: async () => 'addr1', getRewardAddresses: async () => ['reward1'] } as any;
    vi.spyOn(meshStake, 'delegateToPoolMesh').mockResolvedValue({ success: true, txHash: 'tx123' } as any);

    const res = await delegateToPool(fakeWallet as any, 'pool1abc', 'mainnet');
    expect(res.success).toBe(true);
    expect(res.txHash).toBe('tx123');
  });

  it('propagates error when mesh-stake returns failure (no mnemonic fallback)', async () => {
    const fakeWallet = { getUtxos: async () => [{}], getChangeAddress: async () => 'addr1', getRewardAddresses: async () => ['reward1'] } as any;
    vi.spyOn(meshStake, 'delegateToPoolMesh').mockResolvedValue({ success: false, error: 'fail' } as any);

    const res = await delegateToPool(fakeWallet as any, 'pool1abc', 'mainnet');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Mesh delegation failed');
  });

  it('returns error if wallet missing required methods', async () => {
    const fakeWallet = {} as any;
    const res = await delegateToPool(fakeWallet, 'pool1abc', 'mainnet');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Mesh delegation failed');
  });
});