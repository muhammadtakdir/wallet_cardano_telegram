import { NextResponse } from 'next/server';

const BLOCKFROST_API_URL = process.env.BLOCKFROST_API_URL || "https://cardano-mainnet.blockfrost.io/api/v0";
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_PROJECT_ID || "";

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
      // Asset not found or error
      return NextResponse.json({
        unit,
        decimals: 0,
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
