/**
 * DexHunter API Service (Client-side)
 * 
 * Integration with DexHunter API for token swaps.
 * DexHunter aggregates liquidity across multiple DEXes to find the best rates.
 * 
 * This module calls internal API routes (to avoid CORS issues with external API)
 * 
 * API Documentation: https://dexhunter.gitbook.io/dexhunter-partners/trading/swap
 */

// Internal API routes - no CORS issues
const API_ROUTES = {
  quote: '/api/dexhunter/quote',    // -> /swap/estimate
  swap: '/api/dexhunter/swap',      // -> /swap/build  
  sign: '/api/dexhunter/sign',      // -> /swap/sign
  price: '/api/dexhunter/price',    // -> /price
};

/**
 * Token representation
 * Empty string "" = ADA (lovelace)
 * For native tokens: policyId + assetName (hex)
 */
export interface Token {
  id: string; // "" for ADA, or policyId+assetNameHex
  name: string;
  ticker: string;
  decimals: number;
  policyId?: string;
  assetName?: string;
  logo?: string;
}

// Common tokens
export const ADA_TOKEN: Token = {
  id: '',
  name: 'Cardano',
  ticker: 'ADA',
  decimals: 6,
  logo: 'https://assets.coingecko.com/coins/images/975/small/cardano.png',
};

export const NIGHT_TOKEN: Token = {
  id: '0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa4e49474854',
  name: 'NIGHT',
  ticker: 'NIGHT',
  decimals: 6,
  policyId: '0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa',
  assetName: '4e49474854',
  logo: 'https://img.dexhunt.io/cf25831e-6f1d-4c9e-8bb1-c85e41ffaa8d',
};

/**
 * Swap estimate request
 */
export interface SwapEstimateRequest {
  token_in: string;      // "" for ADA
  token_out: string;     // Token unit (policyId + assetName)
  amount_in: number;     // Amount in token units (not lovelace for ADA)
  slippage: number;      // Percentage (e.g., 2 for 2%)
  blacklisted_dexes?: string[];
}

/**
 * Route information from estimate
 */
export interface SwapRoute {
  dex: string;
  pool_id: string;
  token_in: string;
  token_out: string;
  amount_in: string;
  amount_out: string;
}

/**
 * Swap estimate response
 * Note: API may return different fields depending on endpoint version
 */
export interface SwapEstimateResponse {
  total_output: string | number;
  total_output_without_slippage?: string | number;
  price_impact?: string;
  routes?: SwapRoute[];
  splits?: SwapSplit[];  // Alternative to routes
  min_output?: string | number;
  average_price?: number;
  total_fee?: number;
  deposits?: number;
}

/**
 * Swap build request
 */
export interface SwapBuildRequest {
  buyer_address: string; // Wallet address (bech32)
  token_in: string;
  token_out: string;
  amount_in: number;
  slippage: number;
  blacklisted_dexes?: string[];
}

/**
 * Split information for multi-route swaps
 */
export interface SwapSplit {
  dex: string;
  pool_id: string;
  percent: number;
}

/**
 * Swap build response
 */
export interface SwapBuildResponse {
  cbor: string;          // Unsigned transaction CBOR
  splits: SwapSplit[];
  estimated_output: string;
  min_output: string;
  price_impact: string;
}

/**
 * Swap sign request (for DexHunter to add their signatures)
 */
export interface SwapSignRequest {
  txCbor: string;        // Transaction CBOR
  signatures: string;    // Witness set CBOR from wallet.signTx()
}

/**
 * Swap sign response
 */
export interface SwapSignResponse {
  cbor: string;          // Fully signed transaction CBOR
}

/**
 * Token search result
 */
export interface TokenInfo {
  unit: string;
  name: string;
  ticker: string;
  decimals: number;
  logo?: string;
  price_ada?: string;
  market_cap?: string;
  volume_24h?: string;
}

/**
 * DexHunter API Error
 */
export class DexHunterError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public details?: unknown
  ) {
    super(message);
    this.name = 'DexHunterError';
  }
}

/**
 * Make API request through internal routes (avoids CORS)
 */
async function apiRequest<T>(
  route: string,
  method: 'GET' | 'POST',
  body?: unknown
): Promise<T> {
  console.log(`[DexHunter API] ${method} ${route}`, body);
  
  try {
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (body && method === 'POST') {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(route, options);
    const data = await response.json();

    if (!response.ok) {
      console.error('[DexHunter API] Error response:', data, 'Status:', response.status);
      
      // Map error codes to user-friendly messages
      let userMessage = 'Unable to process swap request';
      
      if (response.status === 400) {
        // Bad request - usually means token not supported or invalid pair
        if (data.message?.includes('not supported') || data.error?.includes('not supported')) {
          userMessage = 'This token is not supported for swapping';
        } else if (data.message?.includes('liquidity') || data.error?.includes('liquidity')) {
          userMessage = 'Insufficient liquidity for this swap pair';
        } else if (data.message?.includes('pair') || data.error?.includes('pair')) {
          userMessage = 'This swap pair is not available';
        } else {
          userMessage = 'This token pair is not available for swapping. Try a different pair or token.';
        }
      } else if (response.status === 404) {
        userMessage = 'Token not found. Please check the token ID.';
      } else if (response.status === 429) {
        userMessage = 'Too many requests. Please wait a moment and try again.';
      } else if (response.status >= 500) {
        userMessage = 'DexHunter service is temporarily unavailable. Please try again later.';
      }
      
      throw new DexHunterError(
        userMessage,
        response.status,
        data
      );
    }

    console.log(`[DexHunter API] Response:`, data);
    return data;
  } catch (error) {
    if (error instanceof DexHunterError) {
      throw error;
    }
    console.error('[DexHunter API] Request failed:', error);
    throw new DexHunterError(
      `Request failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Get token decimals from token ID
 */
function getTokenDecimals(tokenId: string): number {
  // Check popular tokens first
  const popularToken = POPULAR_TOKENS.find(t => t.id === tokenId);
  if (popularToken) return popularToken.decimals;
  // Default to 6 decimals (most common for Cardano tokens)
  return 6;
}

/**
 * Get swap estimate/quote without building transaction
 * Use this to show user expected output before confirming
 * 
 * @param tokenIn - Token ID ("" for ADA)
 * @param tokenOut - Token ID  
 * @param amountIn - Amount in HUMAN readable format (e.g., 5 ADA, 100 NIGHT)
 * @param slippage - Slippage percentage
 */
export async function getSwapEstimate(
  tokenIn: string,
  tokenOut: string,
  amountIn: number,
  slippage: number = 2
): Promise<SwapEstimateResponse> {
  // DexHunter API uses HUMAN READABLE format directly
  // amount_in: 100 means 100 ADA or 100 tokens (not lovelace!)
  console.log(`[getSwapEstimate] Sending amount: ${amountIn} (human readable)`);
  
  return apiRequest<SwapEstimateResponse>(API_ROUTES.quote, 'POST', {
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    slippage,
    blacklisted_dexes: [],
  });
}

/**
 * Build swap transaction
 * Returns unsigned transaction CBOR that needs to be signed by wallet
 * 
 * @param buyerAddress - Wallet address
 * @param tokenIn - Token ID ("" for ADA)
 * @param tokenOut - Token ID
 * @param amountIn - Amount in HUMAN readable format (e.g., 5 ADA, 100 NIGHT)
 * @param slippage - Slippage percentage
 */
export async function buildSwapTransaction(
  buyerAddress: string,
  tokenIn: string,
  tokenOut: string,
  amountIn: number,
  slippage: number = 2
): Promise<SwapBuildResponse> {
  // DexHunter API uses HUMAN READABLE format directly
  // amount_in: 100 means 100 ADA or 100 tokens (not lovelace!)
  console.log(`[buildSwapTransaction] Sending amount: ${amountIn} (human readable)`);
  
  return apiRequest<SwapBuildResponse>(API_ROUTES.swap, 'POST', {
    buyer_address: buyerAddress,
    token_in: tokenIn,
    token_out: tokenOut,
    amount_in: amountIn,
    slippage,
    blacklisted_dexes: [],
  });
}

/**
 * Sign transaction with DexHunter's signatures (if required)
 * Some swaps may require DexHunter to add their signatures
 */
export async function signSwapTransaction(
  txCbor: string,
  witnessSetCbor: string
): Promise<SwapSignResponse> {
  return apiRequest<SwapSignResponse>(API_ROUTES.sign, 'POST', {
    txCbor,
    signatures: witnessSetCbor,
  });
}

/**
 * Search for tokens
 */
export async function searchTokens(query: string): Promise<TokenInfo[]> {
  // Use price endpoint for token list
  try {
    const response = await apiRequest<TokenInfo[]>(`${API_ROUTES.price}?q=${encodeURIComponent(query)}`, 'GET');
    return Array.isArray(response) ? response : [];
  } catch {
    return [];
  }
}

/**
 * Get token price in ADA
 */
export async function getTokenPrice(tokenUnit: string): Promise<string | null> {
  try {
    const response = await apiRequest<{ price?: string }>(`${API_ROUTES.price}?token=${encodeURIComponent(tokenUnit)}`, 'GET');
    return response.price || null;
  } catch {
    return null;
  }
}

/**
 * Format amount for display (divide by decimals)
 * Handles both integer strings and floating point values
 */
export function formatTokenAmount(amount: string | number, decimals: number): string {
  // Handle floating point numbers (from API responses)
  if (typeof amount === 'number' || (typeof amount === 'string' && amount.includes('.'))) {
    const floatVal = typeof amount === 'number' ? amount : parseFloat(amount);
    if (isNaN(floatVal)) return '0';
    // Already a float, just format it
    return floatVal.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '');
  }
  
  // Handle integer strings (lovelace amounts)
  try {
    const amountBigInt = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const wholePart = amountBigInt / divisor;
    const fractionalPart = amountBigInt % divisor;
    
    if (fractionalPart === BigInt(0)) {
      return wholePart.toString();
    }
    
    const fractionalStr = fractionalPart.toString().padStart(decimals, '0');
    // Remove trailing zeros
    const trimmed = fractionalStr.replace(/0+$/, '');
    return `${wholePart}.${trimmed}`;
  } catch {
    // Fallback for any parsing errors
    return String(amount);
  }
}

/**
 * Parse amount from user input (multiply by decimals)
 */
export function parseTokenAmount(amount: string, decimals: number): bigint {
  const parts = amount.split('.');
  const wholePart = parts[0] || '0';
  let fractionalPart = parts[1] || '';
  
  // Pad or truncate fractional part to match decimals
  fractionalPart = fractionalPart.padEnd(decimals, '0').slice(0, decimals);
  
  const combined = wholePart + fractionalPart;
  return BigInt(combined);
}

/**
 * Convert lovelace to ADA
 */
export function lovelaceToAda(lovelace: bigint | string | number): string {
  return formatTokenAmount(lovelace.toString(), 6);
}

/**
 * Convert ADA to lovelace
 */
export function adaToLovelace(ada: string | number): bigint {
  return parseTokenAmount(ada.toString(), 6);
}

/**
 * Popular tokens list for quick selection
 */
export const POPULAR_TOKENS: Token[] = [
  ADA_TOKEN,
  NIGHT_TOKEN,
  {
    id: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c64d494e',
    name: 'Minswap',
    ticker: 'MIN',
    decimals: 6,
    policyId: '29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6',
    assetName: '4d494e',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/29d222ce763455e3d7a09a665ce554f00ac89d2e99a1a83d267170c6.4d494e.png',
  },
  {
    id: '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0494e4459',
    name: 'Indigo Protocol',
    ticker: 'INDY',
    decimals: 6,
    policyId: '533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0',
    assetName: '494e4459',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/533bb94a8850ee3ccbe483106489399112b74c905342cb1792a797a0.494e4459.png',
  },
  {
    id: '8fef2d34078659493ce161a6c7fba4b56afefa8535296a5743f6958741414441',
    name: 'AADA Finance',
    ticker: 'AADA',
    decimals: 6,
    policyId: '8fef2d34078659493ce161a6c7fba4b56afefa8535296a5743f69587',
    assetName: '41414441',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/8fef2d34078659493ce161a6c7fba4b56afefa8535296a5743f69587.41414441.png',
  },
  {
    id: 'c0ee29a85b13209423b10447d3c2e6a50641a15c57770e27cb9d507357696e67526964657273',
    name: 'WingRiders',
    ticker: 'WRT',
    decimals: 6,
    policyId: 'c0ee29a85b13209423b10447d3c2e6a50641a15c57770e27cb9d5073',
    assetName: '57696e67526964657273',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/c0ee29a85b13209423b10447d3c2e6a50641a15c57770e27cb9d5073.57696e67526964657273.png',
  },
  {
    id: '1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e776f726c646d6f62696c65746f6b656e',
    name: 'World Mobile Token',
    ticker: 'WMT',
    decimals: 6,
    policyId: '1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e',
    assetName: '776f726c646d6f62696c65746f6b656e',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/1d7f33bd23d85e1a25d87d86fac4f199c3197a2f7afeb662a0f34e1e.776f726c646d6f62696c65746f6b656e.png',
  },
  {
    id: 'edfd7a1d77bcb8b884c474bdc92a16002d1fb720e454fa6e993444794e4d4b52',
    name: 'NMKR Token',
    ticker: 'NMKR',
    decimals: 6,
    policyId: 'edfd7a1d77bcb8b884c474bdc92a16002d1fb720e454fa6e99344479',
    assetName: '4e4d4b52',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/edfd7a1d77bcb8b884c474bdc92a16002d1fb720e454fa6e99344479.4e4d4b52.png',
  },
  {
    id: '9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d7753554e444145',
    name: 'SundaeSwap',
    ticker: 'SUNDAE',
    decimals: 6,
    policyId: '9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d77',
    assetName: '53554e444145',
    logo: 'https://tokens.muesliswap.com/static/img/tokens/9a9693a9a37912a5097918f97918d15240c92ab729a0b7c4aa144d77.53554e444145.png',
  },
];

/**
 * Sign and submit a DexHunter transaction using Lucid Evolution via server-side API.
 * 
 * SECURITY: Mnemonic is sent via POST to server-side API for signing.
 * - Mnemonic is NOT logged on client or server
 * - Used only for in-memory transaction signing
 * - Server immediately discards after use
 */
export async function signAndSubmitWithLucid(
  unsignedTxCbor: string,
  mnemonic: string,
  network: 'mainnet' | 'preprod' = 'mainnet'
): Promise<string> {
  // Validate inputs
  if (!unsignedTxCbor || !mnemonic) {
    throw new Error('Missing required parameters');
  }

  const response = await fetch('/api/dexhunter/lucid-sign', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      unsignedTxCbor,
      mnemonic,
      network,
    }),
  });

  const result = await response.json();

  if (!response.ok || result.error) {
    throw new Error(result.error || 'Failed to sign and submit transaction');
  }

  return result.txHash;
}

export default {
  getSwapEstimate,
  buildSwapTransaction,
  signSwapTransaction,
  signAndSubmitWithLucid,
  searchTokens,
  getTokenPrice,
  formatTokenAmount,
  parseTokenAmount,
  lovelaceToAda,
  adaToLovelace,
  POPULAR_TOKENS,
  ADA_TOKEN,
};
