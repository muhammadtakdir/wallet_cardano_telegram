"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { WalletAsset, shortenAddress, getCardanoNetwork, type CardanoNetwork } from "@/lib/cardano";

// Get explorer URLs based on network
function getExplorerUrls(network: CardanoNetwork, policyId: string, assetName?: string) {
  const assetId = assetName ? `${policyId}${assetName}` : policyId;
  
  if (network === "mainnet") {
    return {
      cardanoscan: `https://cardanoscan.io/token/${assetId}`,
      poolpm: `https://pool.pm/asset/${assetId}`,
      jpgStore: `https://www.jpg.store/asset/${assetId}`,
    };
  } else if (network === "preprod") {
    return {
      cardanoscan: `https://preprod.cardanoscan.io/token/${assetId}`,
      poolpm: null,
      jpgStore: null,
    };
  } else {
    return {
      cardanoscan: `https://preview.cardanoscan.io/token/${assetId}`,
      poolpm: null,
      jpgStore: null,
    };
  }
}

export interface AssetDetailProps {
  asset: WalletAsset;
  onBack: () => void;
  onSend?: () => void;
}

export const AssetDetail: React.FC<AssetDetailProps> = ({ asset, onBack, onSend }) => {
  const [copied, setCopied] = React.useState<string | null>(null);
  const network = getCardanoNetwork();

  const isNFT = asset.quantity === "1";
  
  const displayName = React.useMemo(() => {
    if (asset.metadata?.name) {
      return asset.metadata.name;
    }
    if (asset.assetName) {
      try {
        if (/^[0-9a-fA-F]+$/.test(asset.assetName)) {
          const decoded = Buffer.from(asset.assetName, "hex").toString("utf8");
          if (/^[\x20-\x7E]+$/.test(decoded)) {
            return decoded;
          }
        }
      } catch {
        // Ignore
      }
      return asset.assetName;
    }
    return "Unknown Asset";
  }, [asset]);

  const handleCopy = async (text: string, label: string) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers or non-secure contexts
        const textArea = document.createElement('textarea');
        textArea.value = text;
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
      
      setCopied(label);
      setTimeout(() => setCopied(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
      // Try one more fallback
      try {
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.opacity = '0';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand('copy');
        textArea.remove();
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
      } catch (e) {
        alert('Please copy manually: ' + text);
      }
    }
  };

  const policyId = asset.policyId || asset.unit.slice(0, 56);
  const assetId = asset.unit;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      <header className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
        >
          <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
        </button>
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          Asset Details
        </h1>
      </header>

      <div className="space-y-4">
        {/* Asset Header */}
        <Card padding="lg">
          <div className="flex items-center gap-4">
            <div className={`
              w-16 h-16 rounded-2xl flex items-center justify-center
              ${isNFT 
                ? "bg-purple-100 dark:bg-purple-900/30" 
                : "bg-blue-100 dark:bg-blue-900/30"
              }
            `}>
              {asset.metadata?.logo ? (
                <img
                  src={asset.metadata.logo}
                  alt={displayName}
                  className="w-12 h-12 rounded-xl object-cover"
                />
              ) : isNFT ? (
                <NFTIcon className="w-8 h-8 text-purple-600 dark:text-purple-400" />
              ) : (
                <TokenIcon className="w-8 h-8 text-blue-600 dark:text-blue-400" />
              )}
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                {displayName}
              </h2>
              {asset.metadata?.ticker && (
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ${asset.metadata.ticker}
                </span>
              )}
              <div className="flex items-center gap-2 mt-1">
                <span className={`
                  text-xs px-2 py-0.5 rounded-full
                  ${isNFT 
                    ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" 
                    : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  }
                `}>
                  {isNFT ? "NFT" : "Token"}
                </span>
              </div>
            </div>
          </div>

          {/* Quantity */}
          {!isNFT && (
            <div className="mt-6 text-center py-4 bg-gray-50 dark:bg-gray-900 rounded-xl">
              <p className="text-sm text-gray-500 mb-1">Balance</p>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {formatQuantity(asset.quantity, asset.metadata?.decimals)}
              </p>
              {asset.metadata?.ticker && (
                <p className="text-lg text-gray-500">{asset.metadata.ticker}</p>
              )}
            </div>
          )}
        </Card>

        {/* Asset Image (for NFTs) */}
        {isNFT && asset.metadata?.logo && (
          <Card padding="none" className="overflow-hidden">
            <img
              src={asset.metadata.logo}
              alt={displayName}
              className="w-full aspect-square object-cover"
            />
          </Card>
        )}

        {/* Description */}
        {asset.metadata?.description && (
          <Card padding="lg">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
              Description
            </h3>
            <p className="text-gray-900 dark:text-white">
              {asset.metadata.description}
            </p>
          </Card>
        )}

        {/* Technical Details */}
        <Card padding="lg" className="space-y-4">
          <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
            Technical Details
          </h3>

          {/* Policy ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Policy ID</span>
              <button
                onClick={() => handleCopy(policyId, "policy")}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {copied === "policy" ? "✓ Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm font-mono text-gray-900 dark:text-white break-all bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
              {policyId}
            </p>
          </div>

          {/* Asset ID */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs text-gray-500">Asset ID (Unit)</span>
              <button
                onClick={() => handleCopy(assetId, "asset")}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                {copied === "asset" ? "✓ Copied!" : "Copy"}
              </button>
            </div>
            <p className="text-sm font-mono text-gray-900 dark:text-white break-all bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
              {assetId}
            </p>
          </div>

          {/* Fingerprint */}
          {asset.fingerprint && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Fingerprint</span>
                <button
                  onClick={() => handleCopy(asset.fingerprint!, "fingerprint")}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {copied === "fingerprint" ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
                {asset.fingerprint}
              </p>
            </div>
          )}

          {/* Asset Name (Hex) */}
          {(asset.assetName || asset.unit.length > 56) && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs text-gray-500">Asset Name (Hex)</span>
                <button
                  onClick={() => handleCopy(asset.assetName || asset.unit.slice(56), "assetName")}
                  className="text-xs text-blue-600 hover:text-blue-700"
                >
                  {copied === "assetName" ? "✓ Copied!" : "Copy"}
                </button>
              </div>
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all bg-gray-50 dark:bg-gray-900 p-2 rounded-lg">
                {asset.assetName || asset.unit.slice(56)}
              </p>
            </div>
          )}

          {/* Decimals (for tokens) */}
          {!isNFT && asset.metadata?.decimals !== undefined && (
            <div className="flex justify-between">
              <span className="text-sm text-gray-500">Decimals</span>
              <span className="text-sm text-gray-900 dark:text-white">
                {asset.metadata.decimals}
              </span>
            </div>
          )}
        </Card>

        {/* External Links */}
        {(() => {
          const explorerUrls = getExplorerUrls(network, policyId, asset.assetName || asset.unit.slice(56));
          return (
            <Card padding="lg" className="space-y-3">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
                View on Explorer
              </h3>
              
              {/* CardanoScan */}
              <a
                href={explorerUrls.cardanoscan}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                    <ExternalLinkIcon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                  </div>
                  <span className="font-medium text-gray-900 dark:text-white">CardanoScan</span>
                </div>
                <ChevronRightIcon className="w-5 h-5 text-gray-400" />
              </a>

              {/* Pool.pm (Mainnet only) */}
              {explorerUrls.poolpm && (
                <a
                  href={explorerUrls.poolpm}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-purple-100 dark:bg-purple-900/30 flex items-center justify-center">
                      <ExternalLinkIcon className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">Pool.pm</span>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </a>
              )}

              {/* JPG Store (NFT on Mainnet only) */}
              {isNFT && explorerUrls.jpgStore && (
                <a
                  href={explorerUrls.jpgStore}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-900 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center">
                      <NFTIcon className="w-4 h-4 text-pink-600 dark:text-pink-400" />
                    </div>
                    <span className="font-medium text-gray-900 dark:text-white">JPG Store</span>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </a>
              )}
            </Card>
          );
        })()}

        {/* Action Buttons */}
        {onSend && (
          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={onSend}
          >
            Send {isNFT ? "NFT" : "Token"}
          </Button>
        )}
      </div>
    </div>
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
const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
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

const ExternalLinkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

AssetDetail.displayName = "AssetDetail";
