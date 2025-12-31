import { NextResponse } from 'next/server';

const BLOCKFROST_API_URL = process.env.BLOCKFROST_API_URL || "https://cardano-mainnet.blockfrost.io/api/v0";
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_PROJECT_ID || "";

// Known tokens with decimals (fallback when not in metadata)
// Format: policyId + assetNameHex -> decimals
const KNOWN_TOKEN_DECIMALS: Record<string, number> = {
  // NIGHT token (6 decimals like ADA)
  "0691b2fe8b1d8b2a9fcc7e270b57eafc8f90b22af4b2b05e4ce7992e4e49474854": 6,
  // SNEK
  "279c909f348e533da5808898f87f9a14bb2c3dfbbacccd631d927a3f534e454b": 0,
  // MIN (Minswap)
  "29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e": 6,
  // MILK
  "8a1cfae21368b8bebbbed9800fec304e95cce39a2a57dc35e2e3ebaa4d494c4b": 0,
  // WMT (World Mobile)
  "1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e": 6,
  // INDY
  "533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0494e4459": 6,
  // DJED
  "8db269c3ec630e06ae29f74bc39edd1f87c819f1056206e879a1cd61446a65644d6963726f555344": 6,
  // iUSD
  "f66d78b4a3cb3d37afa0ec36461e51ecbde00f26c8f0a68f94b6988069555344": 6,
  // COPI
  "b6a7467ea1deb012808ef4e87b5ff371e85f7142d7b356a40d9b42a0436f726e75636f70696173205b76696120436861696e506f72742e696f5d": 6,
  // HOSKY
  "a0028f350aaabe0545fdcb56b039bfb08e4bb4d8c4d7c3c7d481c235484f534b59": 0,
};

/**
 * Fetch token metadata including decimals from Blockfrost
 * GET /api/dexhunter/token-info?unit={policyId+assetName}
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unit = searchParams.get('unit');
  
  if (!unit || unit.length < 57) {
    return NextResponse.json({ error: 'Invalid unit parameter' }, { status: 400 });
  }

  try {
    // Fetch asset info from Blockfrost
    const res = await fetch(`${BLOCKFROST_API_URL}/assets/${unit}`, {
      headers: {
        'project_id': BLOCKFROST_API_KEY,
      },
    });
    
    if (!res.ok) {
      // Asset not found - check known tokens fallback
      const knownDecimals = KNOWN_TOKEN_DECIMALS[unit];
      return NextResponse.json({
        unit,
        decimals: knownDecimals ?? 0,
        name: null,
        ticker: null,
        logo: null,
      });
    }
    
    const data = await res.json();
    
    // Extract metadata from various possible locations
    const onchainMetadata = data.onchain_metadata || {};
    const metadata = data.metadata || {};
    
    // CIP-26/68 compliant tokens store decimals in different locations
    // Check all possible paths for decimals
    let decimals: number = 0;
    
    // 1. Check onchain_metadata.decimals (CIP-25/26)
    if (onchainMetadata.decimals !== undefined) {
      decimals = parseInt(String(onchainMetadata.decimals)) || 0;
    }
    // 2. Check metadata.decimals (registry metadata)
    else if (metadata.decimals !== undefined) {
      decimals = parseInt(String(metadata.decimals)) || 0;
    }
    // 3. Check top-level decimals
    else if (data.decimals !== undefined) {
      decimals = parseInt(String(data.decimals)) || 0;
    }
    // 4. Check CIP-68 format (onchain_metadata could have nested structure)
    else if (onchainMetadata.extra && onchainMetadata.extra.decimals !== undefined) {
      decimals = parseInt(String(onchainMetadata.extra.decimals)) || 0;
    }
    // 5. Fallback to known tokens list
    else if (KNOWN_TOKEN_DECIMALS[unit] !== undefined) {
      decimals = KNOWN_TOKEN_DECIMALS[unit];
    }
    
    // Name - check multiple sources
    const name = 
      onchainMetadata.name || 
      metadata.name || 
      (data.asset_name ? hexToString(data.asset_name) : null) ||
      null;
    
    // Ticker
    const ticker = 
      onchainMetadata.ticker || 
      metadata.ticker || 
      null;
    
    // Logo
    const logo = 
      onchainMetadata.logo || 
      onchainMetadata.image || 
      metadata.logo || 
      null;
    
    console.log(`[token-info] ${unit}: decimals=${decimals}, name=${name}, ticker=${ticker}`);
    
    return NextResponse.json({
      unit,
      policyId: data.policy_id,
      assetName: data.asset_name,
      fingerprint: data.fingerprint,
      decimals,
      name,
      ticker,
      logo,
      quantity: data.quantity,
    });
  } catch (error) {
    console.error('Error fetching token info:', error);
    return NextResponse.json({
      unit,
      decimals: 0,
      name: null,
      ticker: null,
      logo: null,
    });
  }
}

// Helper to decode hex string to UTF-8
function hexToString(hex: string): string | null {
  try {
    if (/^[0-9a-fA-F]+$/.test(hex)) {
      const decoded = Buffer.from(hex, 'hex').toString('utf8');
      // Only return if it looks like printable text
      if (/^[\x20-\x7E]+$/.test(decoded)) {
        return decoded;
      }
    }
  } catch {
    // Ignore decode errors
  }
  return null;
}
