import { NextResponse } from 'next/server';

const BLOCKFROST_API_URL = process.env.BLOCKFROST_API_URL || "https://cardano-mainnet.blockfrost.io/api/v0";
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_PROJECT_ID || "";
const DEXHUNTER_API_URL = "https://api.dexhunter.io/community";

/**
 * Fetch token info from DexHunter API
 * Returns decimals, name, ticker, and image
 */
async function fetchFromDexHunter(unit: string): Promise<{
  decimals: number | null;
  name: string | null;
  ticker: string | null;
  logo: string | null;
}> {
  try {
    // DexHunter uses policy_id.asset_name format
    const policyId = unit.slice(0, 56);
    const assetNameHex = unit.slice(56);
    const tokenId = assetNameHex ? `${policyId}.${assetNameHex}` : policyId;
    
    const res = await fetch(`${DEXHUNTER_API_URL}/tokens/${tokenId}`, {
      headers: {
        'Accept': 'application/json',
      },
      // Short timeout to not block if DexHunter is slow
      signal: AbortSignal.timeout(3000),
    });
    
    if (!res.ok) {
      return { decimals: null, name: null, ticker: null, logo: null };
    }
    
    const data = await res.json();
    
    return {
      decimals: data.decimals !== undefined ? parseInt(String(data.decimals)) : null,
      name: data.name || null,
      ticker: data.ticker || data.symbol || null,
      logo: data.image || data.logo || null,
    };
  } catch (error) {
    console.log(`[token-info] DexHunter fallback failed for ${unit}:`, error);
    return { decimals: null, name: null, ticker: null, logo: null };
  }
}

/**
 * Fetch token metadata including decimals from Blockfrost + DexHunter fallback
 * GET /api/dexhunter/token-info?unit={policyId+assetName}
 * 
 * Priority for decimals:
 * 1. Blockfrost onchain_metadata.decimals
 * 2. Blockfrost metadata.decimals (registry)
 * 3. DexHunter API decimals
 * 4. Default to 0
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unit = searchParams.get('unit');
  
  if (!unit || unit.length < 56) {
    return NextResponse.json({ error: 'Invalid unit parameter' }, { status: 400 });
  }

  try {
    // Fetch asset info from Blockfrost
    const res = await fetch(`${BLOCKFROST_API_URL}/assets/${unit}`, {
      headers: {
        'project_id': BLOCKFROST_API_KEY,
      },
    });
    
    // Also fetch from DexHunter in parallel as fallback
    const dexHunterPromise = fetchFromDexHunter(unit);
    
    if (!res.ok) {
      // Asset not found in Blockfrost - try DexHunter
      const dexHunterData = await dexHunterPromise;
      return NextResponse.json({
        unit,
        decimals: dexHunterData.decimals ?? 0,
        name: dexHunterData.name,
        ticker: dexHunterData.ticker,
        logo: dexHunterData.logo,
      });
    }
    
    const data = await res.json();
    const dexHunterData = await dexHunterPromise;
    
    // Extract metadata from various possible locations
    const onchainMetadata = data.onchain_metadata || {};
    const metadata = data.metadata || {};
    
    // CIP-26/68 compliant tokens store decimals in different locations
    // Check all possible paths for decimals
    let decimals: number | null = null;
    
    // 1. Check onchain_metadata.decimals (CIP-25/26)
    if (onchainMetadata.decimals !== undefined) {
      decimals = parseInt(String(onchainMetadata.decimals));
    }
    // 2. Check metadata.decimals (registry metadata)
    else if (metadata.decimals !== undefined) {
      decimals = parseInt(String(metadata.decimals));
    }
    // 3. Check top-level decimals
    else if (data.decimals !== undefined) {
      decimals = parseInt(String(data.decimals));
    }
    // 4. Check CIP-68 format (onchain_metadata could have nested structure)
    else if (onchainMetadata.extra && onchainMetadata.extra.decimals !== undefined) {
      decimals = parseInt(String(onchainMetadata.extra.decimals));
    }
    // 5. Fallback to DexHunter decimals
    else if (dexHunterData.decimals !== null) {
      decimals = dexHunterData.decimals;
    }
    
    // Default to 0 if still null
    if (decimals === null || isNaN(decimals)) {
      decimals = 0;
    }
    
    // Name - check multiple sources
    const name = 
      onchainMetadata.name || 
      metadata.name || 
      dexHunterData.name ||
      (data.asset_name ? hexToString(data.asset_name) : null) ||
      null;
    
    // Ticker
    const ticker = 
      onchainMetadata.ticker || 
      metadata.ticker || 
      dexHunterData.ticker ||
      null;
    
    // Logo - prefer Blockfrost, fallback to DexHunter
    let logo = 
      onchainMetadata.logo || 
      onchainMetadata.image || 
      metadata.logo || 
      dexHunterData.logo ||
      null;
    
    // If logo is IPFS, convert to gateway URL
    if (logo && typeof logo === 'string') {
      if (logo.startsWith('ipfs://')) {
        logo = `https://ipfs.io/ipfs/${logo.slice(7)}`;
      } else if (logo.startsWith('ipfs/')) {
        logo = `https://ipfs.io/${logo}`;
      }
    }
    
    console.log(`[token-info] ${unit}: decimals=${decimals}, name=${name}, ticker=${ticker}, hasLogo=${!!logo}`);
    
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
    // Try DexHunter as last resort
    const dexHunterData = await fetchFromDexHunter(unit);
    return NextResponse.json({
      unit,
      decimals: dexHunterData.decimals ?? 0,
      name: dexHunterData.name,
      ticker: dexHunterData.ticker,
      logo: dexHunterData.logo,
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
