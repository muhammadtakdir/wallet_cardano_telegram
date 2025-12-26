import { it, vi } from 'vitest';
import { delegateToPool } from './wallet';
import * as meshStake from './mesh-stake';

it('simulate delegateToPool (mock Mesh success)', async () => {
  // Mock mesh delegate to simulate success without network calls
  const spy = vi.spyOn(meshStake as any, 'delegateToPoolMesh').mockResolvedValue({ success: true, txHash: 'simulated-tx-123' } as any);

  const fakeWallet: any = { /* minimal wallet object */ };
  const res = await delegateToPool(fakeWallet as any, 'pool1xyz', 'preview' as any);
  // eslint-disable-next-line no-console
  console.log('SIMULATE_DELEGATE result:', JSON.stringify(res, null, 2));

  spy.mockRestore();
});
