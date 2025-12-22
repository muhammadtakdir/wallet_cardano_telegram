"use client";

import * as React from "react";
import { Card, Button } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { getCollateralStatus, setupCollateral, type CollateralStatus } from "@/lib/cardano";

export interface CollateralManagerProps {
  onBack?: () => void;
}

export const CollateralManager: React.FC<CollateralManagerProps> = ({ onBack }) => {
  const { balance } = useWalletStore();
  const [collateralStatus, setCollateralStatus] = React.useState<CollateralStatus | null>(null);
  const [isLoading, setIsLoading] = React.useState(true);
  const [isSettingUp, setIsSettingUp] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  // Check collateral status on mount
  React.useEffect(() => {
    const checkCollateral = async () => {
      setIsLoading(true);
      try {
        const walletInstance = useWalletStore.getState()._walletInstance;
        if (walletInstance) {
          const status = await getCollateralStatus(walletInstance);
          setCollateralStatus(status);
        }
      } catch (err) {
        console.error("Error checking collateral:", err);
        setError("Failed to check collateral status");
      } finally {
        setIsLoading(false);
      }
    };

    checkCollateral();
  }, []);

  const handleSetupCollateral = async () => {
    setIsSettingUp(true);
    setError(null);
    setSuccess(null);

    try {
      const walletInstance = useWalletStore.getState()._walletInstance;
      if (!walletInstance) {
        throw new Error("Wallet not initialized");
      }

      const result = await setupCollateral(walletInstance);

      if (result.success) {
        if (result.txHash === "already_setup") {
          setSuccess("Collateral is already set up!");
        } else {
          setSuccess(`Collateral setup successful! TX: ${result.txHash?.slice(0, 16)}...`);
        }
        
        // Refresh status
        const status = await getCollateralStatus(walletInstance);
        setCollateralStatus(status);
        
        // Refresh balance
        useWalletStore.getState().refreshBalance();
      } else {
        throw new Error(result.error || "Failed to setup collateral");
      }
    } catch (err) {
      console.error("Error setting up collateral:", err);
      setError(err instanceof Error ? err.message : "Failed to setup collateral");
    } finally {
      setIsSettingUp(false);
    }
  };

  const adaBalance = parseFloat(balance?.ada || "0");
  const hasEnoughForCollateral = adaBalance >= 7; // 5 ADA collateral + ~2 ADA for fee/min UTxO

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
      {/* Header */}
      <header className="flex items-center gap-3 mb-6">
        {onBack && (
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
        )}
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Collateral Management
          </h1>
          <p className="text-sm text-gray-500">For Smart Contract Interactions</p>
        </div>
      </header>

      <div className="space-y-4">
        {/* Info Card */}
        <Card padding="lg">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
              <InfoIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h3 className="font-medium text-gray-900 dark:text-white mb-1">
                What is Collateral?
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Collateral is required for smart contract interactions on Cardano. 
                It&apos;s a separate UTxO (5 ADA recommended) that acts as a security deposit 
                in case a smart contract execution fails. Your collateral is only used 
                if the transaction fails due to script errors.
              </p>
            </div>
          </div>
        </Card>

        {/* Collateral Status */}
        <Card padding="lg">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">
            Collateral Status
          </h3>

          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-4">
              {/* Status Indicator */}
              <div className={`flex items-center gap-3 p-4 rounded-xl ${
                collateralStatus?.hasCollateral 
                  ? "bg-green-50 dark:bg-green-900/20" 
                  : "bg-yellow-50 dark:bg-yellow-900/20"
              }`}>
                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                  collateralStatus?.hasCollateral 
                    ? "bg-green-100 dark:bg-green-900/50" 
                    : "bg-yellow-100 dark:bg-yellow-900/50"
                }`}>
                  {collateralStatus?.hasCollateral ? (
                    <CheckIcon className="w-6 h-6 text-green-600 dark:text-green-400" />
                  ) : (
                    <WarningIcon className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                  )}
                </div>
                <div>
                  <p className={`font-medium ${
                    collateralStatus?.hasCollateral 
                      ? "text-green-800 dark:text-green-200" 
                      : "text-yellow-800 dark:text-yellow-200"
                  }`}>
                    {collateralStatus?.hasCollateral 
                      ? "Collateral Enabled" 
                      : "Collateral Not Set Up"
                    }
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    {collateralStatus?.hasCollateral 
                      ? "Ready for dApp interactions" 
                      : "Setup required for smart contracts"
                    }
                  </p>
                </div>
              </div>

              {/* Collateral Details */}
              {collateralStatus?.collateralUtxo && (
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">Amount</span>
                    <span className="text-gray-900 dark:text-white font-medium">
                      {(parseInt(collateralStatus.collateralUtxo.amount) / 1_000_000).toFixed(2)} ADA
                    </span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-500">UTxO</span>
                    <span className="text-gray-900 dark:text-white font-mono text-xs">
                      {collateralStatus.collateralUtxo.txHash.slice(0, 12)}...#{collateralStatus.collateralUtxo.outputIndex}
                    </span>
                  </div>
                </div>
              )}

              {/* Error/Success Messages */}
              {error && (
                <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
                </div>
              )}
              {success && (
                <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                  <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
                </div>
              )}

              {/* Setup Button */}
              {!collateralStatus?.hasCollateral && (
                <div className="space-y-3">
                  {!hasEnoughForCollateral && (
                    <div className="p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                      <p className="text-sm text-orange-600 dark:text-orange-400">
                        You need at least 7 ADA to set up collateral (5 ADA for collateral + ~2 ADA for transaction fee).
                        Current balance: {adaBalance.toFixed(2)} ADA
                      </p>
                    </div>
                  )}
                  
                  <Button
                    variant="primary"
                    fullWidth
                    onClick={handleSetupCollateral}
                    isLoading={isSettingUp}
                    disabled={!hasEnoughForCollateral || isSettingUp}
                  >
                    Setup Collateral (5 ADA)
                  </Button>
                  
                  <p className="text-xs text-gray-500 text-center">
                    This will create a 5 ADA UTxO for collateral purposes
                  </p>
                </div>
              )}

              {collateralStatus?.hasCollateral && (
                <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    ✓ Your wallet is ready for dApp and smart contract interactions
                  </p>
                </div>
              )}
            </div>
          )}
        </Card>

        {/* Use Cases */}
        <Card padding="lg">
          <h3 className="font-medium text-gray-900 dark:text-white mb-4">
            When is Collateral Used?
          </h3>
          <ul className="space-y-3">
            {[
              { icon: "🔄", title: "DEX Swaps", desc: "Trading on Minswap, SundaeSwap, etc." },
              { icon: "🎰", title: "NFT Marketplaces", desc: "Buying/selling on JPG Store, etc." },
              { icon: "🏦", title: "DeFi Protocols", desc: "Lending, borrowing, staking in DeFi" },
              { icon: "🎮", title: "Gaming & dApps", desc: "Any Plutus smart contract interaction" },
            ].map((item, index) => (
              <li key={index} className="flex items-start gap-3">
                <span className="text-xl">{item.icon}</span>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">{item.title}</p>
                  <p className="text-sm text-gray-500">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
};

// Icons
const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

CollateralManager.displayName = "CollateralManager";
