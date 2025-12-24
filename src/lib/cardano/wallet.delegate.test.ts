import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as cslStake from './csl-stake';
import { delegateToPool } from './wallet';

describe('wallet delegateToPool integration (mocked CSL)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns success when csl-stake returns success', async () => {
    const fakeWallet = { _mnemonic: 'test test test test test test test test test test test junk' } as any;
    vi.spyOn(cslStake, 'delegateToPoolCSL').mockResolvedValue({ success: true, txHash: 'tx123' } as any);

    const res = await delegateToPool(fakeWallet, 'pool1abc', 'mainnet');
    expect(res.success).toBe(true);
    expect(res.txHash).toBe('tx123');
  });

  it('propagates error when csl-stake returns failure', async () => {
    const fakeWallet = { _mnemonic: 'test test test test test test test test test test test junk' } as any;
    vi.spyOn(cslStake, 'delegateToPoolCSL').mockResolvedValue({ success: false, error: 'fail' } as any);

    const res = await delegateToPool(fakeWallet, 'pool1abc', 'mainnet');
    expect(res.success).toBe(false);
    expect(res.error).toBe('fail');
  });

  it('returns error if mnemonic missing', async () => {
    const fakeWallet = {} as any;
    const res = await delegateToPool(fakeWallet, 'pool1abc', 'mainnet');
    expect(res.success).toBe(false);
    expect(res.error).toContain('Mnemonic not found');
  });
});