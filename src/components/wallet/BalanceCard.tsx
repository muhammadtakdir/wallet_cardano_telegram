"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import { WalletBalance, shortenAddress, CardanoNetwork } from "@/lib/cardano";
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
import { CurrencySelector } from "./CurrencySelector";

export interface BalanceCardProps {
  balance: WalletBalance | null;
  address: string | null;
  network: CardanoNetwork;
  isLoading?: boolean;
  onRefresh?: () => void;
  onCopyAddress?: () => void;
}

export const BalanceCard: React.FC<BalanceCardProps> = ({
  balance,
  address,
  network,
  isLoading = false,
  onRefresh,
  onCopyAddress,
}) => {
  const [copied, setCopied] = React.useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = React.useState(false);
  const [currency, setCurrency] = React.useState<FiatCurrency>("usd");
  const [adaPrice, setAdaPrice] = React.useState<number>(0);
  const [showCurrencySelector, setShowCurrencySelector] = React.useState(false);
  const [isPriceLoading, setIsPriceLoading] = React.useState(true);

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
    
    // Refresh price every minute
    const interval = setInterval(loadPrice, 60000);
    return () => clearInterval(interval);
  }, [currency]);

  // Debug logging
  React.useEffect(() => {
    console.log("=== BalanceCard Debug ===");
    console.log("balance:", balance);
    console.log("balance?.ada:", balance?.ada, typeof balance?.ada);
    console.log("=== End BalanceCard Debug ===");
  }, [balance, address, network]);

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

  // Calculate fiat value
  const adaAmount = parseFloat(balance?.ada || "0");
  const fiatValue = convertAdaToFiat(adaAmount, adaPrice);
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
                  {isBalanceHidden ? "••••••" : String(balance?.ada || "0.000000")}
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

        {/* Assets Preview */}
        {balance && balance.assets.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Native Assets ({balance.assets.length})
            </p>
            <div className="space-y-2 max-h-32 overflow-y-auto">
              {balance.assets.slice(0, 5).map((asset, index) => (
                <div
                  key={index}
                  className="flex items-center justify-between text-sm"
                >
                  <span className="text-gray-600 dark:text-gray-400 truncate max-w-[60%]">
                    {String(asset.unit || "").slice(0, 20)}...
                  </span>
                  <span className="font-medium text-gray-900 dark:text-white">
                    {isBalanceHidden ? "••••" : String(asset.quantity || "0")}
                  </span>
                </div>
              ))}
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

BalanceCard.displayName = "BalanceCard";
