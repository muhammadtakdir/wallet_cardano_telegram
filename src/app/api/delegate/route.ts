import { NextRequest, NextResponse } from 'next/server';
import { delegateToPool } from '@/lib/cardano/wallet';

export async function POST(req: NextRequest) {
  try {
    const { mnemonic, poolId, network } = await req.json();
    if (!mnemonic || !poolId || !network) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 });
    }
    // Create wallet instance from mnemonic (server-only)
    const { createWalletFromMnemonic } = await import('@/lib/cardano/wallet');
    const walletInstance = await createWalletFromMnemonic(mnemonic, network);
    const result = await delegateToPool(walletInstance.wallet, poolId, network);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
