"use client";

/**
 * Supported fiat currencies for ADA conversion
 */
export type FiatCurrency = "usd" | "eur" | "jpy" | "idr" | "cny" | "etb";

export interface CurrencyInfo {
  code: FiatCurrency;
  symbol: string;
  name: string;
  flag: string;
}

export const SUPPORTED_CURRENCIES: CurrencyInfo[] = [
  { code: "usd", symbol: "$", name: "US Dollar", flag: "🇺🇸" },
  { code: "eur", symbol: "€", name: "Euro", flag: "🇪🇺" },
  { code: "jpy", symbol: "¥", name: "Japanese Yen", flag: "🇯🇵" },
  { code: "idr", symbol: "Rp", name: "Indonesian Rupiah", flag: "🇮🇩" },
  { code: "cny", symbol: "¥", name: "Chinese Yuan", flag: "🇨🇳" },
  { code: "etb", symbol: "Br", name: "Ethiopian Birr", flag: "🇪🇹" },
];

/**
 * Get currency info by code
 */
export const getCurrencyInfo = (code: FiatCurrency): CurrencyInfo => {
  return SUPPORTED_CURRENCIES.find((c) => c.code === code) || SUPPORTED_CURRENCIES[0];
};

/**
 * Storage keys
 */
const CURRENCY_STORAGE_KEY = "cardano_fiat_currency";
const BALANCE_HIDDEN_KEY = "cardano_balance_hidden";

/**
 * Get saved currency preference
 */
export const getSavedCurrency = (): FiatCurrency => {
  if (typeof window === "undefined") return "usd";
  const saved = localStorage.getItem(CURRENCY_STORAGE_KEY);
  if (saved && SUPPORTED_CURRENCIES.some((c) => c.code === saved)) {
    return saved as FiatCurrency;
  }
  return "usd";
};

/**
 * Save currency preference
 */
export const saveCurrency = (currency: FiatCurrency): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(CURRENCY_STORAGE_KEY, currency);
  }
};

/**
 * Get balance hidden preference
 */
export const getBalanceHidden = (): boolean => {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(BALANCE_HIDDEN_KEY) === "true";
};

/**
 * Save balance hidden preference
 */
export const saveBalanceHidden = (hidden: boolean): void => {
  if (typeof window !== "undefined") {
    localStorage.setItem(BALANCE_HIDDEN_KEY, hidden ? "true" : "false");
  }
};

/**
 * ADA price cache
 */
interface PriceCache {
  prices: Record<FiatCurrency, number>;
  changes: Record<FiatCurrency, number>; // 24h change percentage
  timestamp: number;
}

let priceCache: PriceCache | null = null;
const CACHE_DURATION = 60 * 1000; // 1 minute cache

/**
 * Fetch ADA price and 24h change
 */
export const fetchAdaPrice = async (): Promise<Record<FiatCurrency, number>> => {
  const data = await fetchAdaPriceFull();
  return data.prices;
};

/**
 * Get 24h change for a currency
 */
export const getAdaPriceChange = async (currency: FiatCurrency): Promise<number> => {
  const data = await fetchAdaPriceFull();
  return data.changes[currency] || 0;
};

/**
 * Internal full price fetcher using Minswap Aggregator API
 */
async function fetchAdaPriceFull(): Promise<PriceCache> {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache;
  }

  try {
    const prices: Record<FiatCurrency, number> = { usd: 0, eur: 0, jpy: 0, idr: 0, cny: 0, etb: 0 };
    const changes: Record<FiatCurrency, number> = { usd: 0, eur: 0, jpy: 0, idr: 0, cny: 0, etb: 0 };

    // Minswap Aggregator API only supports one currency per request
    // We fetch common ones and fallback for others
    const currenciesToFetch: FiatCurrency[] = ["usd", "eur", "jpy", "cny"];
    
    await Promise.all(
      currenciesToFetch.map(async (curr) => {
        try {
          const resp = await fetch(`https://agg-api.minswap.org/aggregator/ada-price?currency=${curr}`);
          if (resp.ok) {
            const data = await resp.json();
            prices[curr] = data.price || 0;
            changes[curr] = data.change_24h || 0;
          }
        } catch (e) {
          console.warn(`Minswap ADA price fetch failed for ${curr}`, e);
        }
      })
    );

    // For IDR and ETB, if Minswap doesn't support them, use CryptoCompare fallback or cross-rate
    if (prices.idr === 0 || prices.etb === 0) {
      try {
        const ccResponse = await fetch(
          "https://min-api.cryptocompare.com/data/price?fsym=ADA&tsyms=IDR,ETB"
        );
        if (ccResponse.ok) {
          const ccData = await ccResponse.json();
          if (prices.idr === 0) prices.idr = ccData.IDR || 0;
          if (prices.etb === 0) prices.etb = ccData.ETB || 0;
        }
      } catch (e) {
        console.warn("CryptoCompare fallback failed", e);
      }
    }

    // Heuristic: Use USD 24h change for IDR/ETB if they are missing
    if (changes.idr === 0) changes.idr = changes.usd;
    if (changes.etb === 0) changes.etb = changes.usd;

    priceCache = {
      prices,
      changes,
      timestamp: Date.now(),
    };

    return priceCache;
  } catch (error) {
    console.error("All price APIs failed", error);
    return priceCache || {
      prices: { usd: 0, eur: 0, jpy: 0, idr: 0, cny: 0, etb: 0 },
      changes: { usd: 0, eur: 0, jpy: 0, idr: 0, cny: 0, etb: 0 },
      timestamp: 0,
    };
  }
}

/**
 * Fetch prices for native tokens in ADA
 * Uses Minswap Aggregator Tokens API
 */
export const fetchTokenPrices = async (policyIds: string[]): Promise<Record<string, number>> => {
  if (policyIds.length === 0) return {};
  
  try {
    // Minswap Aggregator /tokens endpoint
    const response = await fetch("https://agg-api.minswap.org/aggregator/tokens", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        // Filtering by policy IDs if possible, or just fetch top and filter
        // Based on docs, it might not support batch policy_ids filter directly in body
        // but we can search for them or filter results.
      })
    });

    if (!response.ok) {
        console.warn('Minswap API failed:', response.status);
        // Fallback to MuesliSwap
        return fetchTokenPricesMuesli(policyIds);
    }
    
    const data = await response.json();
    const tokenPrices: Record<string, number> = {};
    
    // Minswap returns tokens array
    if (data.tokens && Array.isArray(data.tokens)) {
      data.tokens.forEach((token: any) => {
        const policyId = token.policy_id;
        if (policyIds.includes(policyId)) {
          tokenPrices[policyId] = parseFloat(token.price_by_ada) || 0;
        }
      });
    }
    
    // Check if we missed any, if so, try MuesliSwap for those
    const foundPolicyIds = Object.keys(tokenPrices);
    const missingPolicyIds = policyIds.filter(id => !foundPolicyIds.includes(id));
    
    if (missingPolicyIds.length > 0) {
      const muesliPrices = await fetchTokenPricesMuesli(missingPolicyIds);
      return { ...tokenPrices, ...muesliPrices };
    }

    return tokenPrices;
  } catch (error) {
    console.warn("Failed to fetch token prices from Minswap, trying DexHunter/MuesliSwap", error);
    return fetchTokenPricesDexHunter(policyIds);
  }
};

/**
 * Fallback to DexHunter for token prices
 */
async function fetchTokenPricesDexHunter(policyIds: string[]): Promise<Record<string, number>> {
  try {
    const response = await fetch("https://api.dexhunter.io/v1/price");
    if (!response.ok) return fetchTokenPricesMuesli(policyIds);
    
    const data = await response.json();
    const tokenPrices: Record<string, number> = {};
    
    // DexHunter returns array of prices
    policyIds.forEach(policyId => {
      // DexHunter uses unit (policyId + assetNameHex) or just policyId
      // We look for any match starting with policyId
      const priceEntry = data.find((t: any) => t.unit && t.unit.startsWith(policyId));
      if (priceEntry) {
        tokenPrices[policyId] = parseFloat(priceEntry.price) || 0;
      }
    });
    
    // Fill missing with MuesliSwap
    const foundPolicyIds = Object.keys(tokenPrices);
    const missingPolicyIds = policyIds.filter(id => !foundPolicyIds.includes(id));
    if (missingPolicyIds.length > 0) {
      const muesliPrices = await fetchTokenPricesMuesli(missingPolicyIds);
      return { ...tokenPrices, ...muesliPrices };
    }
    
    return tokenPrices;
  } catch {
    return fetchTokenPricesMuesli(policyIds);
  }
}

/**
 * Fallback to MuesliSwap for token prices
 */
async function fetchTokenPricesMuesli(policyIds: string[]): Promise<Record<string, number>> {
  try {
    const response = await fetch("https://api.muesliswap.com/ticker");
    if (!response.ok) return {};
    const data = await response.json();
    const tokenPrices: Record<string, number> = {};
    policyIds.forEach(policyId => {
      const tokenData = data.find((t: any) => t.base_id === policyId || t.quote_id === policyId);
      if (tokenData) {
        tokenPrices[policyId] = parseFloat(tokenData.last_price);
      }
    });
    return tokenPrices;
  } catch {
    return {};
  }
}

/**
 * Convert ADA to fiat
 */
export const convertAdaToFiat = (
  adaAmount: number,
  price: number
): number => {
  return adaAmount * price;
};

/**
 * Format fiat value with proper separators
 */
export const formatFiatValue = (
  value: number,
  currency: FiatCurrency
): string => {
  const info = getCurrencyInfo(currency);
  
  // Different formatting based on currency
  let formatted: string;
  
  if (currency === "jpy" || currency === "idr" || currency === "etb") {
    // No decimals for these currencies
    formatted = Math.round(value).toLocaleString();
  } else {
    // 2 decimals for other currencies
    formatted = value.toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  return `${info.symbol}${formatted}`;
};
