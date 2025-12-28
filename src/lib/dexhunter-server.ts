
export const getDexHunterApiKey = () => {
  return process.env.DEXHUNTER_API_HEADER;
};

export const getDexHunterPartnerName = () => {
  return process.env.DEXHUNTER_PARTNER_NAME;
};

export const DEXHUNTER_API_URL = process.env.DEXHUNTER_API_URL || "https://api-us.dexhunterv3.app";

/**
 * Fetch token price in ADA
 * Endpoint: GET /swap/averagePrice/ADA/{token_id}
 */
export const getTokenPrice = async (tokenId: string): Promise<number> => {
    if (!tokenId) return 0;
    
    // DexHunter expects full hex (policy+name) as token_id
    const url = `${DEXHUNTER_API_URL}/swap/averagePrice/ADA/${tokenId}`;
    const apiKey = getDexHunterApiKey();
    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    if (apiKey) headers['X-Partner-Id'] = apiKey;

    try {
        const res = await fetch(url, { headers });
        if (!res.ok) return 0;
        const data = await res.json();
        // Return price_ba (Price in ADA)
        return data.price_ba || 0;
    } catch {
        return 0;
    }
};
