// CSL-based staking helpers removed. Use Mesh-based flows in `mesh-stake.ts` instead.

export function parseAssetUnit(_unit: string) {
  throw new Error('parseAssetUnit is removed. Use Mesh flows or reimplement as needed.');
}

export function parsePoolKeyHash(_poolId: string) {
  throw new Error('parsePoolKeyHash is removed. Use Mesh flows instead.');
}

export async function delegateToPoolCSL() {
  throw new Error('CSL staking implementation removed. Use Mesh-based delegation via `delegateToPoolMesh` in `mesh-stake.ts`.');
}


