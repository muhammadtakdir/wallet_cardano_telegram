"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import { WalletBalance, shortenAddress, CardanoNetwork, WalletAsset, lovelaceToAda } from "@/lib/cardano";
import {
  type FiatCurrency,
  getCurrencyInfo,
  getSavedCurrency,
  getBalanceHidden,
  saveBalanceHidden,
  fetchAdaPrice,
  convertAdaToFiat,
  formatFiatValue,
} from "@/lib/currency";
import { AssetItem } from "./AssetList";
import { CurrencySelector } from "./CurrencySelector";

// Create ADA asset from lovelace
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

// Decode hex asset name to readable string
function decodeAssetName(asset: WalletAsset): string {
  // If metadata has name, use it
  if (asset.metadata?.name) {
    return asset.metadata.name;
  }
  
  // Try to decode assetName from hex
  if (asset.assetName) {
    try {
      if (/^[0-9a-fA-F]+$/.test(asset.assetName)) {
        const decoded = Buffer.from(asset.assetName, "hex").toString("utf8");
        // Check if result is printable ASCII
        if (/^[\x20-\x7E]+$/.test(decoded)) {
          return decoded;
        }
      }
    } catch {
      // Ignore decode errors
    }
    // Return truncated assetName if not decodable
    return asset.assetName.length > 16 ? asset.assetName.slice(0, 16) + "..." : asset.assetName;
  }
  
  // Fallback: extract assetName from unit (unit = policyId + assetName)
  if (asset.unit && asset.unit.length > 56) {
    const assetNameHex = asset.unit.slice(56);
    try {
      if (/^[0-9a-fA-F]+$/.test(assetNameHex)) {
        const decoded = Buffer.from(assetNameHex, "hex").toString("utf8");
        if (/^[\x20-\x7E]+$/.test(decoded)) {
          return decoded;
        }
      }
    } catch {
      // Ignore decode errors
    }
    return assetNameHex.length > 16 ? assetNameHex.slice(0, 16) + "..." : assetNameHex;
  }
  
  return "Unknown Asset";
}

export interface BalanceCardProps {
  balance: WalletBalance | null;
  address: string | null;
  network: CardanoNetwork;
  isLoading?: boolean;
  onRefresh?: () => void;
  onCopyAddress?: () => void;
  onAssetClick?: (asset: WalletAsset) => void;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  address,
  network,
  isLoading = false,
  onRefresh,
  onCopyAddress,
  onAssetClick,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = React.useState(false);
  const [currency, setCurrency] = React.useState<FiatCurrency>("usd");
  const [adaPrice, setAdaPrice] = React.useState<number>(0);
  const [showCurrencySelector, setShowCurrencySelector] = React.useState(false);
  const [isPriceLoading, setIsPriceLoading] = React.useState(true);
  const [totalPortfolioAda, setTotalPortfolioAda] = React.useState<number>(0);
  const [tokenPrices, setTokenPrices] = React.useState<Map<string, number>>(new Map());

  // Load preferences on mount
  React.useEffect(() => {
    setIsBalanceHidden(getBalanceHidden());
    setCurrency(getSavedCurrency());
  }, []);

  // Fetch ADA price
  React.useEffect(() => {
    const loadPrice = async () => {
      setIsPriceLoading(true);
      const prices = await fetchAdaPrice();
      setAdaPrice(prices[currency] || 0);
      setIsPriceLoading(false);
    };
    loadPrice();
    
    // Refresh price every 2 minutes (reduced from 1 minute for better performance)
    const interval = setInterval(loadPrice, 120000);
    return () => clearInterval(interval);
  }, [currency]);

  // Debug logging - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log("[BalanceCard] ADA:", balance?.ada);
    }
  }, [balance?.ada]);

  // Categorize assets - tokens vs NFTs
  const { tokens, nfts, adaAsset, allAssetsWithAda } = React.useMemo(() => {
    const tokens: WalletAsset[] = [];
    const nfts: WalletAsset[] = [];
    const assets = balance?.assets || [];
    
    // Create ADA asset
    const adaAsset = balance?.lovelace ? createAdaAsset(balance.lovelace) : null;
    
    assets.forEach((asset) => {
      if (asset.quantity === "1" && !asset.metadata?.decimals) {
        nfts.push(asset);
      } else {
        tokens.push(asset);
      }
    });
    
    // All assets with ADA first
    const allAssetsWithAda: WalletAsset[] = [];
    if (adaAsset) allAssetsWithAda.push(adaAsset);
    allAssetsWithAda.push(...tokens);
    
    return { tokens, nfts, adaAsset, allAssetsWithAda };
  }, [balance?.assets, balance?.lovelace]);

  // Fetch token prices and calculate total portfolio
  React.useEffect(() => {
    if (!balance?.lovelace) return;
    
    const fetchTokenPrices = async () => {
      const adaAmount = parseFloat(lovelaceToAda(balance.lovelace));
      let totalInAda = adaAmount;
      const newPrices = new Map<string, number>();
      
      // Fetch prices for tokens (not NFTs)
      const pricePromises = tokens.map(async (token) => {
        try {
          const policyId = token.policyId || token.unit.slice(0, 56);
          const assetNameHex = token.assetName || token.unit.slice(56);
          const tokenId = policyId + assetNameHex;
          
          const res = await fetch(`/api/dexhunter/price?token=${tokenId}`);
          const data = await res.json();
          const priceInAda = data.price || 0;
          
          newPrices.set(token.unit, priceInAda);
          
          // Calculate token value in ADA
          const decimals = token.metadata?.decimals || 0;
          const quantity = decimals > 0 
            ? parseFloat(token.quantity) / Math.pow(10, decimals)
            : parseFloat(token.quantity);
          
          return quantity * priceInAda;
        } catch {
          return 0;
        }
      });
      
      const tokenValues = await Promise.all(pricePromises);
      const totalTokenValue = tokenValues.reduce((sum, val) => sum + val, 0);
      
      setTokenPrices(newPrices);
      setTotalPortfolioAda(adaAmount + totalTokenValue);
    };
    
    fetchTokenPrices();
  }, [balance?.lovelace, tokens]);

  const handleCopyAddress = async () => {
    if (!address) return;
    
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(address);
      } else {
        // Fallback for older browsers or non-secure contexts (like Telegram Mini App)
        const textArea = document.createElement('textarea');
        textArea.value = address;
        textArea.style.position = 'fixed';
        textArea.style.left = '-999999px';
        textArea.style.top = '-999999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        
        try {
          document.execCommand('copy');
        } finally {
          textArea.remove();
        }
      }
      
      setCopied(true);
      onCopyAddress?.();
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Try one more fallback
      try {
        const textArea = document.createElement('textarea');
        textArea.value = address;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        setCopied(true);
        onCopyAddress?.();
        setTimeout(() => setCopied(false), 2000);
      } catch (e) {
        alert('Please copy manually: ' + address);
      }
    }
  };

  const toggleBalanceVisibility = () => {
    const newValue = !isBalanceHidden;
    setIsBalanceHidden(newValue);
    saveBalanceHidden(newValue);
  };

  const handleCurrencyChange = (newCurrency: FiatCurrency) => {
    setCurrency(newCurrency);
    // Price will be updated by useEffect
  };

  const networkColors: Record<CardanoNetwork, string> = {
    mainnet: "bg-green-500",
    preprod: "bg-yellow-500",
    preview: "bg-purple-500",
  };

  // Calculate fiat value based on total portfolio
  const fiatValue = convertAdaToFiat(totalPortfolioAda, adaPrice);
  const currencyInfo = getCurrencyInfo(currency);

  return (
    <>
      <Card variant="elevated" padding="lg" className="relative overflow-hidden">
        {/* Network Badge */}
        <div className="absolute top-3 right-3">
          <span
            className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${networkColors[network]}`}
          >
            {String(network)}
          </span>
        </div>

        {/* Balance Section */}
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-1">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Total Balance
            </p>
            {/* Hide/Show Balance Button */}
            <button
              onClick={toggleBalanceVisibility}
              className="p-1 rounded hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
              title={isBalanceHidden ? "Show balance" : "Hide balance"}
            >
              {isBalanceHidden ? (
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              )}
            </button>
          </div>
          {isLoading ? (
            <div className="animate-pulse">
              <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 mx-auto" />
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-2">
                <span className="text-4xl font-bold text-gray-900 dark:text-white">
                  {isBalanceHidden ? "••••••" : totalPortfolioAda.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                </span>
                <span className="text-xl text-gray-500 dark:text-gray-400">ADA</span>
              </div>
              {/* Fiat Currency Display */}
              <button
                onClick={() => setShowCurrencySelector(true)}
                className="flex items-center justify-center gap-1 mx-auto mt-2 text-gray-500 dark:text-gray-400 text-sm hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              >
                {isPriceLoading ? (
                  <span className="animate-pulse">Loading price...</span>
                ) : isBalanceHidden ? (
                  <span>{currencyInfo?.flag} ••••••</span>
                ) : (
                  <span>
                    {currencyInfo?.flag} ≈ {formatFiatValue(fiatValue, currency)}
                  </span>
                )}
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </>
          )}
        </div>

        {/* Address Section */}
        {address && (
          <div 
            className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            onClick={handleCopyAddress}
          >
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 mb-0.5">
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Wallet Address
                  </p>
                  {copied && (
                    <span className="text-xs text-green-500">✓ Copied!</span>
                  )}
                </div>
                <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                  {shortenAddress(address, 12)}
                </p>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleCopyAddress();
                }}
                className="ml-3 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                title="Copy full address"
              >
                {copied ? (
                  <CheckIcon className="w-5 h-5 text-green-500" />
                ) : (
                  <CopyIcon className="w-5 h-5" />
                )}
              </button>
            </div>
          </div>
        )}

        {/* Refresh Button */}
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="mt-4 w-full py-2 text-sm text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors disabled:opacity-50"
          >
            {isLoading ? "Refreshing..." : "Refresh Balance"}
          </button>
        )}

        {/* Assets Preview - ADA + Tokens + NFTs */}
        {balance && (allAssetsWithAda.length > 0 || nfts.length > 0) && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
              Native Assets ({allAssetsWithAda.length + nfts.length})
            </p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {/* Show ADA + tokens first, then NFTs */}
              {allAssetsWithAda.slice(0, 5).map((asset, index) => (
                <AssetItem
                  key={`${asset.unit}-${index}`}
                  asset={asset}
                  isNFT={false}
                  isAda={asset.unit === "lovelace"}
                  adaPrice={adaPrice}
                  currency={currency}
                  onClick={() => onAssetClick?.(asset)}
                />
              ))}
              {/* Show NFTs if there's space */}
              {allAssetsWithAda.length < 5 && nfts.slice(0, 5 - allAssetsWithAda.length).map((asset, index) => (
                <AssetItem
                  key={`nft-${asset.unit}-${index}`}
                  asset={asset}
                  isNFT={true}
                  isAda={false}
                  adaPrice={adaPrice}
                  currency={currency}
                  onClick={() => onAssetClick?.(asset)}
                />
              ))}
              {(allAssetsWithAda.length + nfts.length) > 5 && (
                <p className="text-xs text-center text-gray-500 dark:text-gray-400 pt-2">
                  +{(allAssetsWithAda.length + nfts.length) - 5} more assets
                </p>
              )}
            </div>
          </div>
        )}
      </Card>

      {/* Currency Selector Modal */}
      <CurrencySelector
        isOpen={showCurrencySelector}
        onClose={() => setShowCurrencySelector(false)}
        currentCurrency={currency}
        onCurrencyChange={handleCurrencyChange}
      />
    </>
  );
};

// Icons
const CopyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
    />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg
    className={className}
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M5 13l4 4L19 7"
    />
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

BalanceCard.displayName = "BalanceCard";
