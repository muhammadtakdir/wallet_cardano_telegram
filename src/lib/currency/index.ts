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
  timestamp: number;
}

let priceCache: PriceCache | null = null;
const CACHE_DURATION = 60 * 1000; // 1 minute cache

/**
 * Fetch ADA price from CoinGecko API
 */
export const fetchAdaPrice = async (): Promise<Record<FiatCurrency, number>> => {
  // Check cache
  if (priceCache && Date.now() - priceCache.timestamp < CACHE_DURATION) {
    return priceCache.prices;
  }

  try {
    const currencies = SUPPORTED_CURRENCIES.map((c) => c.code).join(",");
    const response = await fetch(
      `https://api.coingecko.com/api/v3/simple/price?ids=cardano&vs_currencies=${currencies}`,
      {
        headers: {
          Accept: "application/json",
        },
      }
    );

    if (!response.ok) {
      throw new Error("Failed to fetch price");
    }

    const data = await response.json();
    const prices: Record<FiatCurrency, number> = {
      usd: data.cardano?.usd || 0,
      eur: data.cardano?.eur || 0,
      jpy: data.cardano?.jpy || 0,
      idr: data.cardano?.idr || 0,
      cny: data.cardano?.cny || 0,
      etb: data.cardano?.etb || 0,
    };

    // Update cache
    priceCache = {
      prices,
      timestamp: Date.now(),
    };

    return prices;
  } catch (error) {
    console.warn("CoinGecko failed, trying fallback...", error);
    
    // Fallback: CryptoCompare
    try {
      const ccResponse = await fetch(
        "https://min-api.cryptocompare.com/data/price?fsym=ADA&tsyms=USD,EUR,JPY,IDR,CNY,ETB"
      );
      if (ccResponse.ok) {
        const ccData = await ccResponse.json();
        const prices: Record<FiatCurrency, number> = {
          usd: ccData.USD || 0,
          eur: ccData.EUR || 0,
          jpy: ccData.JPY || 0,
          idr: ccData.IDR || 0,
          cny: ccData.CNY || 0,
          etb: ccData.ETB || 0,
        };
        // Update cache with fallback data
        priceCache = { prices, timestamp: Date.now() };
        return prices;
      }
    } catch (e) {
      console.error("All price APIs failed", e);
    }

    // Return cached prices if available, otherwise zeros
    return priceCache?.prices || {
      usd: 0,
      eur: 0,
      jpy: 0,
      idr: 0,
      cny: 0,
      etb: 0,
    };
  }
};

/**
 * Fetch prices for native tokens in ADA
 * Uses MuesliSwap public API
 */
export const fetchTokenPrices = async (policyIds: string[]): Promise<Record<string, number>> => {
  if (policyIds.length === 0) return {};
  
  try {
    const response = await fetch("https://api.muesliswap.com/ticker");
    if (!response.ok) return {};
    
    const data = await response.json();
    const tokenPrices: Record<string, number> = {};
    
    // Map MuesliSwap data to policyId.assetName format or just policyId
    // Note: MuesliSwap uses policyId.assetName format
    policyIds.forEach(policyId => {
      const tokenData = data.find((t: any) => t.base_id === policyId || t.quote_id === policyId);
      if (tokenData) {
        // Price is usually in base currency (ADA)
        tokenPrices[policyId] = parseFloat(tokenData.last_price);
      }
    });
    
    return tokenPrices;
  } catch (error) {
    console.warn("Failed to fetch token prices", error);
    return {};
  }
};

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
