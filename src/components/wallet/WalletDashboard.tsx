"use client";

import * as React from "react";
import { useWalletStore, useTelegram } from "@/hooks";
import { BalanceCard, TransactionList } from "@/components/wallet";
import { WalletSelector } from "@/components/wallet/WalletSelector";
import { Button } from "@/components/ui";

interface WalletDashboardProps {
  onSend?: () => void;
  onReceive?: () => void;
  onSettings?: () => void;
  onAddWallet?: () => void;
}

export const WalletDashboard: React.FC<WalletDashboardProps> = ({
  onSend,
  onReceive,
  onSettings,
  onAddWallet,
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
    refreshTransactions,
    lockWallet,
  } = useWalletStore();

  const { isInTelegram, hapticFeedback, showAlert } = useTelegram();

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showWalletSelector, setShowWalletSelector] = React.useState(false);

  // Refresh data on mount
  React.useEffect(() => {
    handleRefresh();
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refreshBalance(), refreshTransactions()]);
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

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
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
                {walletName || "Cardano Wallet"}
              </h1>
              {wallets.length > 1 && (
                <span className="text-xs text-gray-500">
                  {wallets.length} wallets
                </span>
              )}
            </div>
            <ChevronDownIcon className="w-4 h-4 text-gray-400 ml-1" />
          </button>
          <div className="flex items-center gap-2">
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
        />

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="primary"
            size="lg"
            fullWidth
            onClick={onSend}
            className="flex items-center justify-center gap-2"
          >
            <SendIcon className="w-5 h-5" />
            Send
          </Button>
          <Button
            variant="outline"
            size="lg"
            fullWidth
            onClick={onReceive}
            className="flex items-center justify-center gap-2"
          >
            <ReceiveIcon className="w-5 h-5" />
            Receive
          </Button>
        </div>

        {/* Transaction History */}
        <section>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">
            Recent Transactions
          </h2>
          <TransactionList
            transactions={transactions}
            walletAddress={walletAddress || undefined}
            isLoading={isLoading || isRefreshing}
          />
        </section>
      </main>

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

export default WalletDashboard;
