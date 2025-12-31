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
    
    // Extract metadata
    const onchainMetadata = data.onchain_metadata || {};
    const metadata = data.metadata || {};
    
    // Decimals: check multiple sources
    const decimals = 
      onchainMetadata.decimals ?? 
      metadata.decimals ?? 
      data.decimals ?? 
      0;
    
    // Name
    const name = 
      onchainMetadata.name || 
      metadata.name || 
      data.asset_name || 
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
    
    return NextResponse.json({
      unit,
      policyId: data.policy_id,
      assetName: data.asset_name,
      fingerprint: data.fingerprint,
      decimals: typeof decimals === 'number' ? decimals : parseInt(decimals) || 0,
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
