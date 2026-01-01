import { NextResponse } from 'next/server';

const BLOCKFROST_API_URL = process.env.BLOCKFROST_API_URL || "https://cardano-mainnet.blockfrost.io/api/v0";
const BLOCKFROST_API_KEY = process.env.BLOCKFROST_PROJECT_ID || "";

// DexHunter API for verified token info
const DEXHUNTER_API_URL = "https://api-us.dexhunterv3.app";
const DEXHUNTER_API_KEY = process.env.DEXHUNTER_API_HEADER || "";

// Cardano Token Registry CDN (maintained by Cardano Foundation)
const TOKEN_REGISTRY_URL = "https://tokens.cardano.org/metadata";

/**
 * Fetch from Cardano Token Registry (CDN maintained by CF)
 * This is the authoritative source for registered fungible tokens
 */
async function fetchFromTokenRegistry(unit: string): Promise<{
  decimals: number | null;
  name: string | null;
  ticker: string | null;
  logo: string | null;
}> {
  try {
    const url = `${TOKEN_REGISTRY_URL}/${unit}`;
    
    const res = await fetch(url, { 
      signal: AbortSignal.timeout(5000),
      headers: { 'Accept': 'application/json' }
    });
    
    if (!res.ok) {
      console.log(`[token-info] Token Registry returned ${res.status} for ${unit}`);
      return { decimals: null, name: null, ticker: null, logo: null };
    }

    const data = await res.json();
    
    console.log(`[token-info] Token Registry data for ${unit}:`, {
      name: data.name?.value,
      ticker: data.ticker?.value,
      decimals: data.decimals?.value,
      hasLogo: !!data.logo?.value,
    });
    
    // Logo in registry can be base64 or IPFS
    let logo = data.logo?.value || null;
    if (logo && !logo.startsWith('data:') && !logo.startsWith('http')) {
      // Assume it's base64 PNG
      logo = `data:image/png;base64,${logo}`;
    }
    
    return {
      decimals: data.decimals?.value !== undefined ? parseInt(String(data.decimals.value)) : null,
      name: data.name?.value || null,
      ticker: data.ticker?.value || null,
      logo: logo,
    };
  } catch (error) {
    console.log(`[token-info] Token Registry failed for ${unit}:`, error);
    return { decimals: null, name: null, ticker: null, logo: null };
  }
}

/**
 * Fetch token info from DexHunter API
 * DexHunter has comprehensive data for verified tokens
 */
async function fetchFromDexHunter(tokenId: string): Promise<{
  decimals: number | null;
  name: string | null;
  ticker: string | null;
  logo: string | null;
}> {
  if (!DEXHUNTER_API_KEY) {
    return { decimals: null, name: null, ticker: null, logo: null };
  }
  
  try {
    const url = `${DEXHUNTER_API_URL}/swap/token/${tokenId}`;
    
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: {
        'X-Partner-Id': DEXHUNTER_API_KEY,
        'Accept': 'application/json'
      }
    });
    
    if (!res.ok) {
      console.log(`[token-info] DexHunter returned ${res.status} for ${tokenId}`);
      return { decimals: null, name: null, ticker: null, logo: null };
    }

    const data = await res.json();
    
    console.log(`[token-info] DexHunter data for ${tokenId}:`, {
      name: data.name,
      ticker: data.ticker,
      decimals: data.decimals,
      hasLogo: !!data.image,
    });
    
    // DexHunter image URLs are already HTTP
    let logo = data.image || data.logo || null;
    
    return {
      decimals: data.decimals !== undefined ? parseInt(String(data.decimals)) : null,
      name: data.name || null,
      ticker: data.ticker || null,
      logo: logo,
    };
  } catch (error) {
    console.log(`[token-info] DexHunter failed for ${tokenId}:`, error);
    return { decimals: null, name: null, ticker: null, logo: null };
  }
}

/**
 * Convert IPFS URL to HTTP gateway URL
 */
function ipfsToHttp(url: string | null): string | null {
  if (!url) return null;
  if (url.startsWith('data:')) return url; // Base64
  if (url.startsWith('ipfs://')) {
    return url.replace('ipfs://', 'https://ipfs.io/ipfs/');
  }
  if (url.startsWith('ipfs/')) {
    return `https://ipfs.io/${url}`;
  }
  return url;
}

/**
 * Decode hex string to UTF-8
 */
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

/**
 * Fetch token metadata from DexHunter + Blockfrost + Token Registry
 * GET /api/dexhunter/token-info?unit={policyId+assetName}
 * 
 * Priority for data:
 * 1. DexHunter (best for verified tokens with logos)
 * 2. Blockfrost metadata.decimals (from registry)
 * 3. Blockfrost onchain_metadata (CIP-25/68)
 * 4. Token Registry fallback
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const unit = searchParams.get('unit');
  
  if (!unit || unit.length < 56) {
    return NextResponse.json({ error: 'Invalid unit parameter' }, { status: 400 });
  }

  try {
    // Fetch from all sources in parallel - DexHunter uses same token_id format (policy_id + asset_name_hex)
    const [dexhunterData, blockfrostRes, registryData] = await Promise.all([
      fetchFromDexHunter(unit),
      fetch(`${BLOCKFROST_API_URL}/assets/${unit}`, {
        headers: { 'project_id': BLOCKFROST_API_KEY },
      }),
      fetchFromTokenRegistry(unit)
    ]);
    
    if (!blockfrostRes.ok) {
      // Blockfrost failed, use DexHunter or Token Registry data
      console.log(`[token-info] Blockfrost failed (${blockfrostRes.status}), using fallbacks for ${unit}`);
      return NextResponse.json({
        unit,
        decimals: dexhunterData.decimals ?? registryData.decimals,
        name: dexhunterData.name ?? registryData.name,
        ticker: dexhunterData.ticker ?? registryData.ticker,
        logo: dexhunterData.logo ?? registryData.logo,
      });
    }
    
    const data = await blockfrostRes.json();
    
    // Extract metadata from Blockfrost response
    const onchainMetadata = data.onchain_metadata || {};
    const metadata = data.metadata || {};
    
    // Determine decimals - check multiple sources (DexHunter first for verified tokens)
    let decimals: number | null = null;
    
    // 1. DexHunter decimals (most reliable for verified tokens)
    if (dexhunterData.decimals !== null) {
      decimals = dexhunterData.decimals;
      console.log(`[token-info] ${unit}: decimals from DexHunter = ${decimals}`);
    }
    // 2. Blockfrost metadata.decimals (from registry)
    else if (metadata.decimals !== undefined && metadata.decimals !== null) {
      decimals = parseInt(String(metadata.decimals));
      console.log(`[token-info] ${unit}: decimals from metadata = ${decimals}`);
    }
    // 3. Onchain metadata (CIP-25/68)
    else if (onchainMetadata.decimals !== undefined) {
      decimals = parseInt(String(onchainMetadata.decimals));
      console.log(`[token-info] ${unit}: decimals from onchain = ${decimals}`);
    }
    // 4. Token Registry fallback
    else if (registryData.decimals !== null) {
      decimals = registryData.decimals;
      console.log(`[token-info] ${unit}: decimals from registry = ${decimals}`);
    }
    
    // Validate decimals
    if (decimals !== null && isNaN(decimals)) {
      decimals = null;
    }
    
    // Determine name - DexHunter first for verified tokens
    const name = 
      dexhunterData.name ||
      metadata.name ||
      onchainMetadata.name || 
      registryData.name ||
      (data.asset_name ? hexToString(data.asset_name) : null) ||
      null;
    
    // Determine ticker - DexHunter first for verified tokens
    const ticker = 
      dexhunterData.ticker ||
      metadata.ticker ||
      onchainMetadata.ticker || 
      registryData.ticker ||
      null;
    
    // Determine logo - DexHunter first (they have best logos for verified tokens), then convert IPFS to HTTP
    let logo = 
      dexhunterData.logo ||
      metadata.logo ||
      onchainMetadata.logo || 
      onchainMetadata.image ||
      registryData.logo ||
      null;
    
    logo = ipfsToHttp(logo);
    
    console.log(`[token-info] Final for ${unit}: decimals=${decimals}, name=${name}, ticker=${ticker}, hasLogo=${!!logo}`);
    
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
    console.error('[token-info] Error:', error);
    return NextResponse.json({
      unit,
      decimals: null,
      name: null,
      ticker: null,
      logo: null,
    });
  }
}
