import { NextRequest, NextResponse } from 'next/server';
import { Lucid, Blockfrost } from '@lucid-evolution/lucid';

/**
 * Server-side API route to sign and submit DexHunter transactions using Lucid Evolution.
 * 
 * SECURITY NOTES:
 * - Mnemonic is received from client but NEVER logged or stored
 * - Used only for in-memory transaction signing
 * - Request is processed and mnemonic is immediately discarded
 * - This route should only be accessible from same-origin requests
 */

// Rate limiting map (simple in-memory, resets on server restart)
const requestCounts = new Map<string, { count: number; resetTime: number }>();
const RATE_LIMIT = 10; // requests per minute
const RATE_WINDOW = 60000; // 1 minute

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = requestCounts.get(ip);
  
  if (!record || now > record.resetTime) {
    requestCounts.set(ip, { count: 1, resetTime: now + RATE_WINDOW });
    return true;
  }
  
  if (record.count >= RATE_LIMIT) {
    return false;
  }
  
  record.count++;
  return true;
}

export async function POST(req: NextRequest) {
  // Get client IP for rate limiting
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0] || 
             req.headers.get('x-real-ip') || 
             'unknown';
  
  // Check rate limit
  if (!checkRateLimit(ip)) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait a moment.' },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { unsignedTxCbor, mnemonic, network } = body;

    // Validate required fields without logging sensitive data
    if (!unsignedTxCbor || typeof unsignedTxCbor !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing unsignedTxCbor' },
        { status: 400 }
      );
    }

    if (!mnemonic || typeof mnemonic !== 'string') {
      return NextResponse.json(
        { error: 'Invalid or missing mnemonic' },
        { status: 400 }
      );
    }

    // Basic mnemonic validation (24 words for Cardano)
    const wordCount = mnemonic.trim().split(/\s+/).length;
    if (wordCount !== 24 && wordCount !== 15 && wordCount !== 12) {
      return NextResponse.json(
        { error: 'Invalid mnemonic format' },
        { status: 400 }
      );
    }

    // Validate network
    if (network && !['mainnet', 'preprod', 'preview'].includes(network)) {
      return NextResponse.json(
        { error: 'Invalid network' },
        { status: 400 }
      );
    }

    const selectedNetwork = network || 'mainnet';

    // Get Blockfrost key based on network
    const blockfrostKey = selectedNetwork === 'mainnet'
      ? (process.env.NEXT_PUBLIC_BLOCKFROST_KEY_MAINNET || process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY)
      : (process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD || process.env.NEXT_PUBLIC_BLOCKFROST_PREPROD_API_KEY);

    if (!blockfrostKey) {
      console.error(`[Lucid Sign] Missing Blockfrost API key for ${selectedNetwork}`);
      return NextResponse.json(
        { error: 'Server configuration error' },
        { status: 500 }
      );
    }

    // Blockfrost URLs
    const blockfrostUrl = selectedNetwork === 'mainnet'
      ? 'https://cardano-mainnet.blockfrost.io/api/v0'
      : 'https://cardano-preprod.blockfrost.io/api/v0';

    console.log(`[Lucid Sign] Processing ${selectedNetwork} transaction...`);

    // Initialize Lucid
    const lucid = await Lucid(
      new Blockfrost(blockfrostUrl, blockfrostKey),
      selectedNetwork === 'mainnet' ? 'Mainnet' : 'Preprod'
    );

    // Select wallet from mnemonic (in-memory only, not stored)
    lucid.selectWallet.fromSeed(mnemonic);

    // Deserialize and sign the transaction
    const tx = lucid.fromTx(unsignedTxCbor);
    const signed = await tx.sign.withWallet().complete();

    // Submit transaction
    const txHash = await signed.submit();

    console.log(`[Lucid Sign] Transaction submitted: ${txHash}`);

    return NextResponse.json({
      success: true,
      txHash,
    });

  } catch (error) {
    // Log error without sensitive data
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[Lucid Sign] Error:', errorMessage);
    
    // Return sanitized error message
    let userMessage = 'Transaction signing failed';
    if (errorMessage.includes('insufficient')) {
      userMessage = 'Insufficient funds for transaction';
    } else if (errorMessage.includes('network')) {
      userMessage = 'Network error. Please try again.';
    } else if (errorMessage.includes('witness')) {
      userMessage = 'Transaction signature error';
    }
    
    return NextResponse.json(
      { error: userMessage },
      { status: 500 }
    );
  }
}

