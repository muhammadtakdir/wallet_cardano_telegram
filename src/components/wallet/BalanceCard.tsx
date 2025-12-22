"use client";

import * as React from "react";
import { Card } from "@/components/ui";
import { WalletBalance, shortenAddress, CardanoNetwork } from "@/lib/cardano";

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

  const handleCopyAddress = async () => {
    if (address) {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      onCopyAddress?.();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const networkColors: Record<CardanoNetwork, string> = {
    mainnet: "bg-green-500",
    preprod: "bg-yellow-500",
    preview: "bg-purple-500",
  };

  return (
    <Card variant="elevated" padding="lg" className="relative overflow-hidden">
      {/* Network Badge */}
      <div className="absolute top-3 right-3">
        <span
          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white ${networkColors[network]}`}
        >
          {network}
        </span>
      </div>

      {/* Balance Section */}
      <div className="text-center mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">
          Total Balance
        </p>
        {isLoading ? (
          <div className="animate-pulse">
            <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-32 mx-auto" />
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2">
            <span className="text-4xl font-bold text-gray-900 dark:text-white">
              {balance?.ada || "0.00"}
            </span>
            <span className="text-xl text-gray-500 dark:text-gray-400">ADA</span>
          </div>
        )}
        {balance && Number(balance.lovelace) > 0 && (
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            ≈ {balance.lovelace} lovelace
          </p>
        )}
      </div>

      {/* Address Section */}
      {address && (
        <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
          <div className="flex items-center justify-between">
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-0.5">
                Wallet Address
              </p>
              <p className="text-sm font-mono text-gray-700 dark:text-gray-300 truncate">
                {shortenAddress(address, 12)}
              </p>
            </div>
            <button
              onClick={handleCopyAddress}
              className="ml-3 p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
              title="Copy address"
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
                  {asset.unit.slice(0, 20)}...
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {asset.quantity}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
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
