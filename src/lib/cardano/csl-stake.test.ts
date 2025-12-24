import { describe, it, expect } from 'vitest';
import { parseAssetUnit, parsePoolKeyHash } from './csl-stake';

describe('csl-stake helpers', () => {
  it('parses policy.asset format', () => {
    const unit = '2b28c81dbba6d67e4b5a997c6be1212cba9d60d33f82444ab8b1f218.42414e4b';
    const { policyIdHex, assetNameHex } = parseAssetUnit(unit);
    expect(policyIdHex).toBe('2b28c81dbba6d67e4b5a997c6be1212cba9d60d33f82444ab8b1f218');
    expect(assetNameHex).toBe('42414e4b');
  });

  it('parses concatenated hex format', () => {
    const policy = '2b28c81dbba6d67e4b5a997c6be1212cba9d60d33f82444ab8b1f218';
    const asset = '42414e4b';
    const unit = policy + asset;
    const { policyIdHex, assetNameHex } = parseAssetUnit(unit);
    expect(policyIdHex).toBe(policy);
    expect(assetNameHex).toBe(asset);
  });

  it('throws on invalid asset unit', () => {
    expect(() => parseAssetUnit('invalidunit')).toThrow();
  });

  it('parses hex pool id into keyhash', () => {
    const poolHex = 'a'.repeat(56);
    const keyhash = parsePoolKeyHash(poolHex);
    // Ed25519KeyHash has to_hex method
    expect(typeof keyhash.to_hex === 'function').toBe(true);
    expect(keyhash.to_hex()).toBe(poolHex.toLowerCase());
  });

  it('throws on invalid pool id', () => {
    expect(() => parsePoolKeyHash('badpoolid')).toThrow();
  });
});