"use client";

import * as React from "react";
import { useWalletStore, useTelegram } from "@/hooks";
import { BalanceCard, TransactionList, NetworkSelector } from "@/components/wallet";
import { WalletSelector } from "@/components/wallet/WalletSelector";
import { Button } from "@/components/ui";
import { debugLogObject, safeString } from "@/lib/utils/safeRender";
import { type CardanoNetwork, WalletAsset } from "@/lib/cardano";

interface WalletDashboardProps {
  onSend?: () => void;
  onReceive?: () => void;
  onSettings?: () => void;
  onAddWallet?: () => void;
  onStaking?: () => void;
  onGovernance?: () => void;
  onAssetClick?: (asset: WalletAsset) => void;
  points?: number | null;
}

export const WalletDashboard: React.FC<WalletDashboardProps> = ({
  onSend,
  onReceive,
  onSettings,
  onAddWallet,
  onStaking,
  onGovernance,
  onAssetClick,
  points,
}) => {
  const {
    walletAddress,
    walletName,
    balance,
    transactions,
    network,
    isLoading,
    wallets,
    refreshBalance,
    lockWallet,
    changeNetwork,
  } = useWalletStore();

  const { isInTelegram, hapticFeedback, showAlert, user, initData } = useTelegram();

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showWalletSelector, setShowWalletSelector] = React.useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = React.useState(false);
  const [showAllTransactions, setShowAllTransactions] = React.useState(false);
  const prevBalanceRef = React.useRef<string | null>(null);

  // Detect deposit and award points
  React.useEffect(() => {
    if (balance?.ada && prevBalanceRef.current !== null) {
      const current = parseFloat(balance.ada);
      const prev = parseFloat(prevBalanceRef.current);
      if (current > prev + 5) {
        // Balance increased by > 5 ADA, award points
        if (initData) {
          fetch("/api/user/add-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData, actionType: "deposit" }),
          })
          .then(res => res.json())
          .then(data => {
            console.log("Deposit points awarded:", data);
          })
          .catch(e => console.warn("Failed to award deposit points", e));
        }
      }
    }
    if (balance?.ada) {
      prevBalanceRef.current = balance.ada;
    }
  }, [balance?.ada, initData]);

  // Refresh data on mount
  React.useEffect(() => {
    handleRefresh();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshBalance();
      // Re-fetch user points if needed (optional)
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("success");
      }
    } catch (error) {
      console.error("Error refreshing:", error);
      if (isInTelegram) {
        hapticFeedback.notificationOccurred("error");
      }
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleCopyAddress = () => {
    if (isInTelegram) {
      hapticFeedback.impactOccurred("light");
      showAlert("Address copied to clipboard!");
    }
  };

  const handleLock = () => {
    if (isInTelegram) {
      hapticFeedback.impactOccurred("medium");
    }
    lockWallet();
  };

  const handleNetworkChange = (newNetwork: CardanoNetwork) => {
    if (isInTelegram) {
      hapticFeedback.impactOccurred("medium");
    }
    changeNetwork(newNetwork);
  };

  // Network display info
  const networkInfo: Record<CardanoNetwork, { label: string; color: string }> = {
    mainnet: { label: "Mainnet", color: "bg-green-500" },
    preprod: { label: "Preprod", color: "bg-blue-500" },
    preview: { label: "Preview", color: "bg-purple-500" },
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Welcome Banner for Telegram Users */}
      {user && (
        <div className="bg-blue-600 text-white px-4 py-2 text-sm flex justify-between items-center shadow-md">
          <span className="font-medium truncate">
            Welcome, {safeString(user.first_name)}!
          </span>
          {points !== undefined && points !== null && (
            <span className="bg-blue-700 bg-opacity-50 px-2 py-0.5 rounded-full text-xs font-bold whitespace-nowrap">
              {points} PTS
            </span>
          )}
        </div>
      )}

      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm sticky top-0 z-10">
        <div className="px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => setShowWalletSelector(true)}
            className="flex items-center gap-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg px-2 py-1 transition-colors"
          >
            <WalletIcon className="w-6 h-6 text-blue-600" />
            <div className="text-left">
              <h1 className="text-lg font-semibold text-gray-900 dark:text-white leading-tight">
                {safeString(walletName, "Cardano Wallet")}
              </h1>
              {wallets && wallets.length > 1 && (
                <span className="text-xs text-gray-500">
                  {safeString(wallets.length)} wallets
                </span>
              )}
            </div>
            <ChevronDownIcon className="w-4 h-4 text-gray-400 ml-1" />
          </button>
          <div className="flex items-center gap-2">
            {/* Network Selector Button */}
            <button
              onClick={() => setShowNetworkSelector(true)}
              className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-lg transition-colors"
            >
              <span className={`w-2 h-2 rounded-full ${networkInfo[network].color}`} />
              <span className="text-gray-700 dark:text-gray-300">
                {networkInfo[network].label}
              </span>
            </button>
            <button
              onClick={onSettings}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <SettingsIcon className="w-5 h-5" />
            </button>
            <button
              onClick={handleLock}
              className="p-2 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              <LockIcon className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Wallet Selector Modal */}
      <WalletSelector
        isOpen={showWalletSelector}
        onClose={() => setShowWalletSelector(false)}
        onAddWallet={() => {
          setShowWalletSelector(false);
          onAddWallet?.();
        }}
      />

      {/* Main Content */}
      <main className="px-4 py-6 space-y-6 pb-24">
        {/* Balance Card */}
        <BalanceCard
          balance={balance}
          address={walletAddress}
          network={network}
          isLoading={isLoading || isRefreshing}
          onRefresh={handleRefresh}
          onCopyAddress={handleCopyAddress}
          onAssetClick={onAssetClick}
        />

        {/* Action Buttons */}
        <div className="grid grid-cols-4 gap-2">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={() => {
              onSend?.();
            }}
            className="flex flex-col items-center justify-center gap-1 h-auto py-2 px-1"
          >
            <SendIcon className="w-6 h-6" />
            <span className="text-xs">Send</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => {
              onReceive?.();
            }}
            className="flex flex-col items-center justify-center gap-1 h-auto py-2 px-1"
          >
            <ReceiveIcon className="w-6 h-6" />
            <span className="text-xs">Receive</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => {
              onStaking?.();
            }}
            className="flex flex-col items-center justify-center gap-1 h-auto py-2 px-1"
          >
            <StakeIcon className="w-6 h-6" />
            <span className="text-xs">Stake</span>
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={() => {
              onGovernance?.();
            }}
            className="flex flex-col items-center justify-center gap-1 h-auto py-2 px-1"
          >
            <VoteIcon className="w-6 h-6" />
            <span className="text-xs">Vote</span>
          </Button>
        </div>

        {/* Transaction History */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Recent Transactions
            </h2>
            {transactions && transactions.length > 3 && (
              <button 
                onClick={() => setShowAllTransactions(!showAllTransactions)}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                {showAllTransactions ? "Show Less" : "View All"}
              </button>
            )}
          </div>
          <TransactionList
            transactions={showAllTransactions ? transactions : transactions.slice(0, 3)}
            walletAddress={walletAddress || undefined}
            isLoading={isLoading || isRefreshing}
          />
        </section>
      </main>

      {/* Network Selector Modal */}
      <NetworkSelector
        isOpen={showNetworkSelector}
        currentNetwork={network}
        onNetworkChange={handleNetworkChange}
        onClose={() => setShowNetworkSelector(false)}
      />

      {/* Telegram Environment Badge */}
      {isInTelegram && (
        <div className="fixed bottom-4 left-4 bg-blue-500 text-white text-xs px-2 py-1 rounded-full">
          Telegram
        </div>
      )}
    </div>
  );
};

// Icons
const WalletIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
    />
  </svg>
);

const ChevronDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M19 9l-7 7-7-7"
    />
  </svg>
);

const SettingsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
);

const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
    />
  </svg>
);

const SendIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
    />
  </svg>
);

const ReceiveIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
    />
  </svg>
);

const StakeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M13 10V3L4 14h7v7l9-11h-7z"
    />
  </svg>
);

const VoteIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

export default WalletDashboard;
