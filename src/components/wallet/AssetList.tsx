"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { useWalletStore, useCurrency } from "@/hooks";
import { WalletAsset } from "@/lib/cardano";
import { formatFiatValue, getSavedCurrency, fetchAdaPrice } from "@/lib/currency";

export interface AssetListProps {
  onAssetClick?: (asset: WalletAsset) => void;
  onBack?: () => void;
}

type AssetTab = "tokens" | "nfts";

export const AssetList: React.FC<AssetListProps> = ({ onAssetClick, onBack }) => {
  const { balance } = useWalletStore();
  const [activeTab, setActiveTab] = React.useState<AssetTab>("tokens");
  const [prices, setPrices] = React.useState<Record<string, number>>({});
  const [adaPrice, setAdaPrice] = React.useState<number>(0);
  const currency = getSavedCurrency();

  const assets = balance?.assets || [];

  // Fetch prices
  React.useEffect(() => {
    // 1. Fetch ADA Price
    fetchAdaPrice().then(p => setAdaPrice(p[currency] || 0));

    // 2. Fetch Token Prices
    assets.forEach(async (asset) => {
        if (asset.quantity === "1") return; // Skip likely NFTs for now to save reqs
        try {
            const res = await fetch(`/api/dexhunter/price?token=${asset.unit}`);
            if (res.ok) {
                const data = await res.json();
                setPrices(prev => ({ ...prev, [asset.unit]: data.price }));
            }
        } catch (e) {
            console.warn("Failed to fetch price for", asset.unit);
        }
    });
  }, [assets, currency]);

  // Separate NFTs (quantity = 1) from tokens (quantity > 1)
  const { tokens, nfts } = React.useMemo(() => {
    const tokens: WalletAsset[] = [];
    const nfts: WalletAsset[] = [];

    assets.forEach((asset) => {
      // NFTs typically have quantity of 1
      if (asset.quantity === "1") {
        nfts.push(asset);
      } else {
        tokens.push(asset);
      }
    });

    return { tokens, nfts };
  }, [assets]);

  const displayAssets = activeTab === "tokens" ? tokens : nfts;

  if (assets.length === 0) {
    return (
      <Card padding="lg" className="text-center">
        <EmptyIcon className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No Native Assets
        </h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Your native tokens and NFTs will appear here once you receive them.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Tab Selector */}
      <div className="flex bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        <button
          onClick={() => setActiveTab("tokens")}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
            activeTab === "tokens"
              ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
              : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
          }`}
        >
          Tokens ({tokens.length})
        </button>
        <button
          onClick={() => setActiveTab("nfts")}
          className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
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
            No {activeTab === "tokens" ? "tokens" : "NFTs"} found
          </p>
        </Card>
      ) : (
        <div className="space-y-2">
          {displayAssets.map((asset, index) => (
            <AssetItem
              key={`${asset.unit}-${index}`}
              asset={asset}
              isNFT={activeTab === "nfts"}
              priceInAda={prices[asset.unit]}
              adaPrice={adaPrice}
              currency={currency}
              onClick={() => onAssetClick?.(asset)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

interface AssetItemProps {
  asset: WalletAsset;
  isNFT?: boolean;
  priceInAda?: number;
  adaPrice?: number;
  currency?: any;
  onClick?: () => void;
}

const AssetItem: React.FC<AssetItemProps> = ({ asset, isNFT = false, priceInAda, adaPrice, currency, onClick }) => {
  const displayName = React.useMemo(() => {
    // Try to get readable name from metadata or asset name
    if (asset.metadata?.name) {
      return asset.metadata.name;
    }
    if (asset.assetName) {
      // Try to decode hex asset name
      try {
        if (/^[0-9a-fA-F]+$/.test(asset.assetName)) {
          const decoded = Buffer.from(asset.assetName, "hex").toString("utf8");
          if (/^[\x20-\x7E]+$/.test(decoded)) {
            return decoded;
          }
        }
      } catch {
        // Ignore decode errors
      }
      return asset.assetName.length > 20 ? asset.assetName.slice(0, 20) + "..." : asset.assetName;
    }
    return asset.unit.slice(0, 16) + "...";
  }, [asset]);

  const policyId = asset.policyId || asset.unit.slice(0, 56);
  const assetNameHex = asset.assetName || asset.unit.slice(56);
  const fingerprint = asset.fingerprint;
  
  // Calculate value
  const quantityNum = Number(asset.quantity) / Math.pow(10, asset.metadata?.decimals || 0);
  const valueInAda = priceInAda ? quantityNum * priceInAda : 0;
  const valueInFiat = (valueInAda && adaPrice) ? valueInAda * adaPrice : 0;

  return (
    <Card
      padding="md"
      className="hover:bg-gray-50 dark:hover:bg-gray-800/50 cursor-pointer transition-colors"
      onClick={onClick}
    >
      <div className="flex items-center gap-3">
        {/* Asset Icon */}
        <div className={`
          w-12 h-12 rounded-xl flex items-center justify-center flex-shrink-0 overflow-hidden
          ${isNFT 
            ? "bg-purple-100 dark:bg-purple-900/30" 
            : "bg-blue-100 dark:bg-blue-900/30"
          }
        `}>
          {asset.metadata?.logo ? (
            <img
              src={asset.metadata.logo}
              alt={displayName}
              className="w-full h-full object-cover"
              onError={(e) => {
                (e.target as HTMLImageElement).style.display = "none";
                (e.target as HTMLImageElement).parentElement!.innerHTML = isNFT 
                  ? '<svg class="w-6 h-6 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"/></svg>'
                  : '<svg class="w-6 h-6 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>';
              }}
            />
          ) : isNFT ? (
            <NFTIcon className="w-6 h-6 text-purple-600 dark:text-purple-400" />
          ) : (
            <TokenIcon className="w-6 h-6 text-blue-600 dark:text-blue-400" />
          )}
        </div>

        {/* Asset Info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="font-medium text-gray-900 dark:text-white truncate">
              {displayName}
            </p>
            {asset.metadata?.ticker && (
              <span className="text-xs bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 px-1.5 py-0.5 rounded">
                {asset.metadata.ticker}
              </span>
            )}
          </div>
           {/* Price Info */}
           {!isNFT && valueInFiat > 0 && (
             <p className="text-xs text-gray-500 dark:text-gray-400 font-mono">
               {formatFiatValue(valueInFiat, currency)}
             </p>
           )}
           {!isNFT && valueInFiat === 0 && (
              <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
                {fingerprint || policyId.slice(0, 8) + "..."}
              </p>
           )}
           {isNFT && (
             <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
               {fingerprint || policyId.slice(0, 8) + "..."}
             </p>
           )}
        </div>

        {/* Quantity */}
        <div className="text-right">
          {!isNFT && (
            <p className="font-semibold text-gray-900 dark:text-white">
              {formatQuantity(asset.quantity, asset.metadata?.decimals)}
            </p>
          )}
          {/* ADA Value */}
          {!isNFT && valueInAda > 0 && (
             <p className="text-xs text-gray-400 font-mono">
               {valueInAda.toFixed(2)} ₳
             </p>
          )}
          {isNFT && <ChevronRightIcon className="w-5 h-5 text-gray-400 ml-auto" />}
        </div>
      </div>
    </Card>
  );
};

// Format quantity with decimals
function formatQuantity(quantity: string, decimals?: number): string {
  const num = BigInt(quantity);
  if (!decimals || decimals === 0) {
    return num.toLocaleString();
  }
  
  const divisor = BigInt(10 ** decimals);
  const whole = num / divisor;
  const fraction = num % divisor;
  
  if (fraction === BigInt(0)) {
    return whole.toLocaleString();
  }
  
  const fractionStr = fraction.toString().padStart(decimals, "0");
  return `${whole.toLocaleString()}.${fractionStr.replace(/0+$/, "")}`;
}

// Icons
const EmptyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
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
