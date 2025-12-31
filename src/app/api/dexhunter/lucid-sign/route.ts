import { NextRequest, NextResponse } from 'next/server';
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';

/**
 * Server-side API route to sign and submit DexHunter transactions using Lucid Evolution.
 * This is needed because:
 * 1. MeshWallet doesn't include stake key witness for swap transactions
 * 2. Lucid Evolution can't run directly in browser due to CORS restrictions on Blockfrost
 */
export async function POST(req: NextRequest) {
  try {
    const { unsignedTxCbor, mnemonic, network } = await req.json();

    if (!unsignedTxCbor) {
      return NextResponse.json(
        { error: 'Missing unsignedTxCbor' },
        { status: 400 }
      );
    }

    if (!mnemonic) {
      return NextResponse.json(
        { error: 'Missing mnemonic' },
        { status: 400 }
      );
    }

    // Get Blockfrost key based on network
    const blockfrostKey = network === 'mainnet'
      ? (process.env.NEXT_PUBLIC_BLOCKFROST_KEY_MAINNET || process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY)
      : (process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD || process.env.NEXT_PUBLIC_BLOCKFROST_PREPROD_API_KEY);

    if (!blockfrostKey) {
      return NextResponse.json(
        { error: `Missing Blockfrost API key for ${network}` },
        { status: 500 }
      );
    }

    // Blockfrost URLs for Lucid Evolution (without /api suffix)
    const blockfrostUrl = network === 'mainnet'
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-preprod.blockfrost.io/api/v0';

    console.log(`[Lucid Sign] Initializing Lucid for ${network}...`);
    console.log(`[Lucid Sign] Using Blockfrost URL: ${blockfrostUrl}`);

    // Initialize Lucid
    const lucid = await Lucid(
      new Blockfrost(blockfrostUrl, blockfrostKey),
      network === 'mainnet' ? 'Mainnet' : 'Preprod'
    );

    // Select wallet from mnemonic (this includes both payment and stake keys)
    lucid.selectWallet.fromSeed(mnemonic);

    console.log('[Lucid Sign] Wallet selected, deserializing tx...');

    // Deserialize the unsigned transaction
    const tx = lucid.fromTx(unsignedTxCbor);

    console.log('[Lucid Sign] Signing with wallet (includes stake key)...');

    // Sign with wallet (this automatically includes stake key witness!)
    const signed = await tx.sign.withWallet().complete();

    console.log('[Lucid Sign] Submitting transaction...');

    // Submit transaction
    const txHash = await signed.submit();

    console.log('[Lucid Sign] Transaction submitted:', txHash);

    return NextResponse.json({
      success: true,
      txHash,
    });

  } catch (error) {
    console.error('[Lucid Sign] Error:', error);
    
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    
    return NextResponse.json(
      { 
        error: errorMessage,
        details: error instanceof Error ? error.stack : undefined
      },
      { status: 500 }
    );
  }
}
