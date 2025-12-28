"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { WalletAsset } from "@/lib/cardano";

export interface AssetListProps {
  onAssetClick?: (asset: WalletAsset) => void;
  onBack?: () => void;
}

type AssetTab = "tokens" | "nfts";

export const AssetList: React.FC<AssetListProps> = ({ onAssetClick, onBack }) => {
  const { balance } = useWalletStore();
  const [activeTab, setActiveTab] = React.useState<AssetTab>("tokens");

  const assets = balance?.assets || [];

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
  onClick?: () => void;
}

export const AssetItem: React.FC<AssetItemProps> = ({ asset, isNFT = false, onClick }) => {
  const [priceAda, setPriceAda] = React.useState<string | null>(null);
  const [priceUsd, setPriceUsd] = React.useState<string | null>(null);
  const displayName = React.useMemo(() => {
    // 1. Check metadata name
    if (asset.metadata?.name) {
      return asset.metadata.name;
    }
    
    // 2. Try to decode hex assetName
    const nameHex = asset.assetName || (asset.unit.length > 56 ? asset.unit.slice(56) : "");
    if (nameHex) {
      try {
        if (/^[0-9a-fA-F]+$/.test(nameHex)) {
          const decoded = Buffer.from(nameHex, "hex").toString("utf8");
          // Only use if it looks like a real name (alphanumeric + common symbols)
          if (/^[\x20-\x7E]+$/.test(decoded)) {
            return decoded;
          }
        }
      } catch {
        // Fallback to hex
      }
      return nameHex.length > 15 ? nameHex.slice(0, 10) + "..." : nameHex;
    }
    
    // 3. Last fallback: Policy ID fragment
    return asset.unit.slice(0, 8) + "..." + asset.unit.slice(-4);
  }, [asset]);


  const policyId = asset.policyId || asset.unit.slice(0, 56);
  const assetNameHex = asset.assetName || asset.unit.slice(56);
  const fingerprint = asset.fingerprint;

  React.useEffect(() => {
    let cancelled = false;
    const fetchPrice = async () => {
      try {
        // ADA
        if (asset.unit === "lovelace") {
          const adaRes = await fetch('/api/dexhunter/price?type=ada');
          const adaValue = await adaRes.json();
          if (!cancelled) {
            setPriceAda("1");
            setPriceUsd(Number(adaValue).toFixed(4));
          }
        } else {
          // Token price in ADA
          const tokenId = policyId + assetNameHex;
          const [priceRes, adaRes] = await Promise.all([
            fetch(`/api/dexhunter/price?token=${tokenId}`),
            fetch('/api/dexhunter/price?type=ada')
          ]);
          
          const priceData = await priceRes.json();
          const adaValue = await adaRes.json();
          
          if (!cancelled) {
            const priceInAda = priceData.price || 0;
            setPriceAda(Number(priceInAda).toFixed(8));
            setPriceUsd((Number(priceInAda) * Number(adaValue)).toFixed(6));
          }
        }
      } catch (e) {
        if (!cancelled) {
          setPriceAda(null);
          setPriceUsd(null);
        }
      }
    };
    fetchPrice();
    return () => { cancelled = true; };
  }, [asset.unit, policyId, assetNameHex]);

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
          {fingerprint ? (
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
              {fingerprint}
            </p>
          ) : (
            <p className="text-xs text-gray-500 dark:text-gray-400 font-mono truncate">
              {policyId.slice(0, 8)}...{policyId.slice(-8)}
            </p>
          )}
        </div>

        {/* Quantity & Price */}
        <div className="text-right flex flex-col items-end gap-1 min-w-[90px]">
          {!isNFT && (
            <>
              <p className="font-semibold text-gray-900 dark:text-white">
                {formatQuantity(asset.quantity, asset.metadata?.decimals)}
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {priceAda !== null ? `~${priceAda} ADA` : "-"}
                {priceUsd !== null ? ` ($${priceUsd})` : ""}
              </p>
            </>
          )}
          <ChevronRightIcon className="w-5 h-5 text-gray-400" />
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
