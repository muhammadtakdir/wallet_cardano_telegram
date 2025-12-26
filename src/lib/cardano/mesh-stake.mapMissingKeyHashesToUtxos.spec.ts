import { describe, it, expect } from 'vitest';
import { mapMissingKeyHashesToUtxos } from './mesh-stake';

describe('mapMissingKeyHashesToUtxos', () => {
  it('maps missing key hashes to offending UTxOs and addresses', () => {
    const errorMessage = 'ConwayUtxowFailure:MissingVKeyWitnessesUTXOW [KeyHashObj 6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445]';
    const utxos = [
      { output: { address: 'addr_test1_vkh_1' }, input: { txHash: 'tx1' }, amount: [] },
      { output: { address: 'addr_test1_vkh_other1' }, input: { txHash: 'tx2' }, amount: [] },
    ];
    const resolvePaymentKeyHash = (addr: string) => {
      if (String(addr).startsWith('addr_test1_vkh_')) return '6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445';
      if (String(addr).startsWith('addr_test1_vkh_other')) return 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
      return undefined;
    };
    const result = mapMissingKeyHashesToUtxos({ errorMessage, utxos, resolvePaymentKeyHash });
    expect(result.missingKeyHashes).toContain('6efc3a3c5f0c81d61b40df0cd75432ef6382c6d6aa705ea14ad45445');
    expect(result.offendingUtxos.some((u: any) => u.address === 'addr_test1_vkh_1')).toBe(true);
    expect(result.offendingAddrs).toContain('addr_test1_vkh_1');
  });
});
