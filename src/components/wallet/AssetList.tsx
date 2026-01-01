"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { WalletAsset, lovelaceToAda } from "@/lib/cardano";
import {
  type FiatCurrency,
  getSavedCurrency,
  fetchAdaPrice,
  formatFiatValue,
} from "@/lib/currency";

export interface AssetListProps {
  onAssetClick?: (asset: WalletAsset) => void;
  onBack?: () => void;
  showTotalPortfolio?: boolean;
}

type AssetTab = "all" | "tokens" | "nfts";

// Create ADA asset from balance
function createAdaAsset(lovelace: string): WalletAsset {
  return {
    unit: "lovelace",
    quantity: lovelace,
    policyId: "",
    assetName: "ADA",
    fingerprint: "",
    metadata: {
      name: "Cardano",
      ticker: "ADA",
      decimals: 6,
      logo: "",
    },
  };
}

export const AssetList: React.FC<AssetListProps> = ({ onAssetClick, onBack, showTotalPortfolio = true }) => {
  const { balance } = useWalletStore();
  const [activeTab, setActiveTab] = React.useState<AssetTab>("all");
  const [adaPrice, setAdaPrice] = React.useState<number>(0);
  const [currency, setCurrency] = React.useState<FiatCurrency>("usd");
  const [totalPortfolioAda, setTotalPortfolioAda] = React.useState<number>(0);
  const [isCalculating, setIsCalculating] = React.useState(false);

  const assets = balance?.assets || [];
  const adaAmount = parseFloat(balance?.ada || "0");

  // Load currency preference
  React.useEffect(() => {
    setCurrency(getSavedCurrency());
  }, []);

  // Fetch ADA price
  React.useEffect(() => {
    const loadPrice = async () => {
      const prices = await fetchAdaPrice();
      setAdaPrice(prices[currency] || 0);
    };
    loadPrice();
  }, [currency]);

  // Memoize asset categorization
  const { adaAsset, tokens, nfts, allAssets } = React.useMemo(() => {
    const tokens: WalletAsset[] = [];
    const nfts: WalletAsset[] = [];

    // Create ADA asset
    const adaAsset = balance?.lovelace ? createAdaAsset(balance.lovelace) : null;

    assets.forEach((asset) => {
      // NFTs typically have quantity of 1 and no decimals
      if (asset.quantity === "1" && !asset.metadata?.decimals) {
        nfts.push(asset);
      } else {
        tokens.push(asset);
      }
    });

    // All assets: ADA first, then tokens
    const allAssets: WalletAsset[] = [];
    if (adaAsset) allAssets.push(adaAsset);
    allAssets.push(...tokens);

    return { adaAsset, tokens, nfts, allAssets };
  }, [assets, balance?.lovelace]);

  // Get display assets based on active tab
  const displayAssets = React.useMemo(() => {
    switch (activeTab) {
      case "all":
        return allAssets;
      case "tokens":
        return tokens;
      case "nfts":
        return nfts;
      default:
        return allAssets;
    }
  }, [activeTab, allAssets, tokens, nfts]);
  
  // Pagination
  const [visibleCount, setVisibleCount] = React.useState(20);
  const visibleAssets = React.useMemo(() => 
    displayAssets.slice(0, visibleCount),
    [displayAssets, visibleCount]
  );

  // Calculate total portfolio value in ADA
  React.useEffect(() => {
    setTotalPortfolioAda(adaAmount);
  }, [adaAmount]);

  if (!balance?.lovelace && assets.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <EmptyIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Assets Yet
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your ADA and native tokens will appear here once you receive them.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Portfolio Summary */}
      {showTotalPortfolio && (
        <Card padding="md" className="bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-blue-100 uppercase font-medium tracking-wider">Total Portfolio</p>
              <p className="text-2xl font-bold">
                {totalPortfolioAda.toLocaleString(undefined, { maximumFractionDigits: 2 })} ADA
              </p>
              <p className="text-sm text-blue-100">
                ≈ {formatFiatValue(totalPortfolioAda * adaPrice, currency)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-xs text-blue-100">
                {allAssets.length} token{allAssets.length !== 1 ? 's' : ''} • {nfts.length} NFT{nfts.length !== 1 ? 's' : ''}
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Tab Selector */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => { setActiveTab("all"); setVisibleCount(20); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "all"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          All ({allAssets.length})
        </button>
        <button
          onClick={() => { setActiveTab("tokens"); setVisibleCount(20); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "tokens"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Tokens ({tokens.length})
        </button>
        <button
          onClick={() => { setActiveTab("nfts"); setVisibleCount(20); }}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "nfts"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          NFTs ({nfts.length})
        </button>
      </div>

      {/* Asset List */}
      {displayAssets.length === 0 ? (
        <Card padding="lg" className="text-center">
          <p className="text-gray-500 dark:text-gray-400">
            No {activeTab === "tokens" ? "tokens" : activeTab === "nfts" ? "NFTs" : "assets"} found
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {visibleAssets.map((asset, index) => (
            <AssetItem
              key={`${asset.unit}-${index}`}
              asset={asset}
              isNFT={activeTab === "nfts" || (asset.quantity === "1" && !asset.metadata?.decimals && asset.unit !== "lovelace")}
              isAda={asset.unit === "lovelace"}
              adaPrice={adaPrice}
              currency={currency}
              onClick={() => onAssetClick?.(asset)}
            />
          ))}
          {/* Load More Button */}
          {displayAssets.length > visibleCount && (
            <button
              onClick={() => setVisibleCount(prev => prev + 20)}
              className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 font-medium hover:bg-gray-50 dark:hover:bg-gray-800 rounded-xl transition-colors"
            >
              Load More ({displayAssets.length - visibleCount} remaining)
            </button>
          )}
        </div>
      )}
    </div>
  );
};

interface AssetItemProps {
  asset: WalletAsset;
  isNFT?: boolean;
  isAda?: boolean;
  adaPrice?: number;
  currency?: FiatCurrency;
  onClick?: () => void;
}

// Memoized AssetItem to prevent re-renders
export const AssetItem: React.FC<AssetItemProps> = React.memo(({ 
  asset, 
  isNFT = false, 
  isAda = false,
  adaPrice = 0,
  currency = "usd",
  onClick 
}) => {
  const [tokenPriceAda, setTokenPriceAda] = React.useState<number | null>(null);
  const [shouldLoadData, setShouldLoadData] = React.useState(false);
  const [fetchedDecimals, setFetchedDecimals] = React.useState<number | null>(null);
  const [fetchedName, setFetchedName] = React.useState<string | null>(null);
  const [fetchedTicker, setFetchedTicker] = React.useState<string | null>(null);
  const [fetchedLogo, setFetchedLogo] = React.useState<string | null>(null);
  
  const policyId = asset.policyId || asset.unit.slice(0, 56);
  const assetNameHex = asset.assetName || asset.unit.slice(56);
  const fingerprint = asset.fingerprint;
  
  // Resolve decimals: prefer fetched, then metadata, otherwise default to 6 for fungible tokens
  const decimals = React.useMemo(() => {
    if (isAda) return 6;

    const fetched = fetchedDecimals;
    if (fetched !== null && fetched !== undefined && !Number.isNaN(Number(fetched))) {
      return Number(fetched);
    }

    const metaDecimals = asset.metadata?.decimals;
    if (metaDecimals !== null && metaDecimals !== undefined && !Number.isNaN(Number(metaDecimals))) {
      return Number(metaDecimals);
    }

    // Default guess for fungible tokens when decimals are absent
    return 6;
  }, [isAda, fetchedDecimals, asset.metadata?.decimals]);
  
  const displayName = React.useMemo(() => {
    if (isAda) return "Cardano";
    
    // 1. Check fetched name first
    if (fetchedName) return fetchedName;
    
    // 2. Check metadata name
    if (asset.metadata?.name) {
      return asset.metadata.name;
    }
    
    // 3. Try to decode hex assetName
    const nameHex = assetNameHex;
    if (nameHex) {
      try {
        if (/^[0-9a-fA-F]+$/.test(nameHex)) {
          const decoded = Buffer.from(nameHex, "hex").toString("utf8");
          if (/^[\x20-\x7E]+$/.test(decoded)) {
            return decoded;
          }
        }
      } catch {
        // Fallback to hex
      }
      return nameHex.length > 15 ? nameHex.slice(0, 10) + "..." : nameHex;
    }
    
    // 4. Last fallback: Policy ID fragment
    return asset.unit.slice(0, 8) + "..." + asset.unit.slice(-4);
  }, [asset, isAda, fetchedName, assetNameHex]);

  const ticker = isAda ? "ADA" : (fetchedTicker || asset.metadata?.ticker || "");
  const logo = fetchedLogo || asset.metadata?.logo || null;

  // Calculate quantity with proper decimals
  const quantity = React.useMemo(() => {
    const raw = asset.quantity;
    if (isAda) {
      const val = parseFloat(lovelaceToAda(raw));
      console.log('[asset-qty] ADA', { unit: asset.unit, raw, decimals: 6, formatted: val });
      return val;
    }

    const formattedStr = formatQuantity(raw, decimals);
    const val = parseFloat(formattedStr);
    console.log('[asset-qty]', {
      unit: asset.unit,
      decimals,
      raw,
      formattedStr,
      formattedNum: val,
    });
    return val;
  }, [asset.quantity, decimals, isAda, asset.unit]);

  // Lazy load token info and prices using Intersection Observer
  const itemRef = React.useRef<HTMLDivElement>(null);
  
  React.useEffect(() => {
    if (isAda) {
      setTokenPriceAda(1);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShouldLoadData(true);
          observer.disconnect();
        }
      },
      { rootMargin: '100px' }
    );
    
    if (itemRef.current) {
      observer.observe(itemRef.current);
    }
    
    return () => observer.disconnect();
  }, [isAda]);

  // Fetch token metadata (including decimals) and price
  React.useEffect(() => {
    if (!shouldLoadData || isAda) return;
    
    let cancelled = false;
    const fetchData = async () => {
      try {
        const tokenId = policyId + assetNameHex;
        
        // Fetch token info and price in parallel
        const [infoRes, priceRes] = await Promise.all([
          fetch(`/api/dexhunter/token-info?unit=${asset.unit}`),
          fetch(`/api/dexhunter/price?token=${tokenId}`)
        ]);
        
        const [infoData, priceData] = await Promise.all([
          infoRes.json(),
          priceRes.json()
        ]);
        
        if (!cancelled) {
          console.log('[asset-info]', {
            unit: asset.unit,
            fetchedDecimals: infoData.decimals,
            name: infoData.name,
            ticker: infoData.ticker,
            logo: Boolean(infoData.logo),
          });
          // Set token metadata
          if (infoData.decimals !== undefined) {
            setFetchedDecimals(infoData.decimals);
          }
          if (infoData.name) {
            setFetchedName(infoData.name);
          }
          if (infoData.ticker) {
            setFetchedTicker(infoData.ticker);
          }
          if (infoData.logo) {
            setFetchedLogo(infoData.logo);
          }
          
          // Set price
          setTokenPriceAda(priceData.price || 0);
        }
      } catch (e) {
        if (!cancelled) {
          setTokenPriceAda(null);
        }
      }
    };
    fetchData();
    return () => { cancelled = true; };
  }, [shouldLoadData, isAda, policyId, assetNameHex, asset.unit]);

  // Calculate values
  const valueInAda = tokenPriceAda !== null ? quantity * tokenPriceAda : null;
  const valueInFiat = valueInAda !== null ? valueInAda * adaPrice : null;

  // Determine icon type and colors
  const getIconConfig = () => {
    if (isAda) {
      return {
        bgColor: "bg-blue-500",
        textColor: "text-white",
      };
    }
    if (isNFT) {
      return {
        bgColor: "bg-purple-100 dark:bg-purple-900/30",
        textColor: "text-purple-600 dark:text-purple-400",
      };
    }
    return {
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      textColor: "text-orange-600 dark:text-orange-400",
    };
  };

  const iconConfig = getIconConfig();

  return (
    <Card
      ref={itemRef}
      padding="md"
      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Asset Icon */}
        <div className={`
          w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden
          ${iconConfig.bgColor} ${iconConfig.textColor}
        `}>
          {isAda ? (
            <AdaIcon className="w-7 h-7" />
          ) : logo ? (
            <img
              src={logo.startsWith('ipfs://') ? `https://ipfs.io/ipfs/${logo.slice(7)}` : logo}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                const parent = (e.target as HTMLImageElement).parentElement;
                if (parent) {
                  parent.innerHTML = isNFT 
                    ? '<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>'
                    : '<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
                }
              }}
            />
          ) : isNFT ? (
            <NFTIcon className="w-6 h-6" />
          ) : (
            <TokenIcon className="w-6 h-6" />
          )}
        </div>

        {/* Asset Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-semibold text-gray-900 dark:text-white truncate">
              {displayName}
            </p>
            {ticker && (
              <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                isAda 
                  ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
              }`}>
                {ticker}
              </span>
            )}
          </div>
          {!isAda && (
            fingerprint ? (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                {fingerprint}
              </p>
            ) : (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                {policyId.slice(0, 8)}...{policyId.slice(-8)}
              </p>
            )
          )}
          {isAda && (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Native Coin
            </p>
          )}
        </div>

        {/* Quantity & Value */}
        <div className="text-right flex flex-col items-end min-w-[100px]">
          {!isNFT && (
            <>
              <p className="font-bold text-gray-900 dark:text-white">
                {formatDisplayQuantity(quantity, isAda ? 2 : 6)}
              </p>
              {valueInAda !== null && !isAda && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  ≈ {formatDisplayQuantity(valueInAda, 2)} ADA
                </p>
              )}
              {valueInFiat !== null && (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                  {formatFiatValue(valueInFiat, currency)}
                </p>
              )}
            </>
          )}
          {isNFT && (
            <span className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 px-2 py-1 rounded-full font-medium">
              NFT
            </span>
          )}
        </div>

        {/* Chevron */}
        <ChevronRightIcon className="w-5 h-5 text-gray-400 flex-shrink-0" />
      </div>
    </Card>
  );
});

AssetItem.displayName = "AssetItem";

// Format quantity with decimals (raw string to number string)
function formatQuantity(quantity: string, decimals?: number): string {
  const num = BigInt(quantity);
  if (!decimals || decimals === 0) {
    return num.toString();
  }
  
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  
  if (fraction === BigInt(0)) {
    return whole.toString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole}.${fractionStr.replace(/0+$/, "")}`;
}

// International number formatter (en-US: comma for thousands, dot for decimals)
const intlFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 6,
  minimumFractionDigits: 0,
});

// Format display quantity with international format (en-US)
function formatDisplayQuantity(num: number, maxDecimals: number = 6): string {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: maxDecimals,
    minimumFractionDigits: 0,
  }).format(num);
}

// Icons
const EmptyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
  </svg>
);

// Cardano ADA Icon
const AdaIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 3c.83 0 1.5.67 1.5 1.5S12.83 8 12 8s-1.5-.67-1.5-1.5S11.17 5 12 5zm-4.5 3c.83 0 1.5.67 1.5 1.5S8.33 11 7.5 11 6 10.33 6 9.5 6.67 8 7.5 8zm0 7c.83 0 1.5.67 1.5 1.5s-.67 1.5-1.5 1.5S6 17.33 6 16.5 6.67 15 7.5 15zm4.5 4c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-6c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm0-7c-.83 0-1.5-.67-1.5-1.5S15.67 8 16.5 8s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>
  </svg>
);

const TokenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const NFTIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

AssetList.displayName = "AssetList";
