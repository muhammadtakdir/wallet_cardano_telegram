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
  onSwap?: () => void;
  onGovernance?: () => void;
  onAssetClick?: (asset: WalletAsset) => void;
}

export const WalletDashboard: React.FC<WalletDashboardProps> = ({
  onSend,
  onReceive,
  onSettings,
  onAddWallet,
  onStaking,
  onSwap,
  onGovernance,
  onAssetClick,
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

  // Debug logging - only in development
  React.useEffect(() => {
    if (process.env.NODE_ENV === 'development') {
      console.log("=== WalletDashboard Debug ===");
      debugLogObject("WalletData", {
        walletAddress,
        balanceAda: balance?.ada,
        network,
        isLoading,
        walletsCount: wallets?.length,
      });
    }
  }, [walletAddress, balance?.ada, network, isLoading, wallets?.length]);

  const { isInTelegram, user, initData, hapticFeedback, showAlert } = useTelegram();

  const [isRefreshing, setIsRefreshing] = React.useState(false);
  const [showWalletSelector, setShowWalletSelector] = React.useState(false);
  const [showNetworkSelector, setShowNetworkSelector] = React.useState(false);
  const [userPoints, setUserPoints] = React.useState<number | null>(null);
  const prevBalanceRef = React.useRef<number | null>(null);
  const prevAssetsCountRef = React.useRef<number | null>(null);

  // Refresh data on mount
  React.useEffect(() => {
    handleRefresh();
    // Register user/fetch points
    if (initData && walletAddress) {
      registerUser();
    }
  }, [walletAddress, initData]);

  // Track deposit rewards (ADA increase > 5 ADA)
  React.useEffect(() => {
    if (balance?.ada) {
      const currentBalance = parseFloat(balance.ada);
      if (prevBalanceRef.current !== null) {
        const diff = currentBalance - prevBalanceRef.current;
        // If balance increased by > 5 ADA, award deposit points (100 pts)
        if (diff > 5) {
          console.log(`[Rewards] ADA deposit detected! Diff: ${diff} ADA`);
          awardDepositPoints();
        }
      }
      prevBalanceRef.current = currentBalance;
    }
  }, [balance?.ada]);

  // Track native token/NFT deposits (new assets received)
  React.useEffect(() => {
    if (balance?.assets) {
      const currentAssetsCount = balance.assets.length;
      if (prevAssetsCountRef.current !== null) {
        // If user received new tokens/NFTs that weren't there before
        if (currentAssetsCount > prevAssetsCountRef.current) {
          console.log(`[Rewards] New token/NFT received! Previous: ${prevAssetsCountRef.current}, Current: ${currentAssetsCount}`);
          awardDepositPoints();
        }
      }
      prevAssetsCountRef.current = currentAssetsCount;
    }
  }, [balance?.assets]);

  // Award deposit points (100 points for receiving 5+ ADA or any token/NFT)
  const awardDepositPoints = async () => {
    if (!initData) return;
    try {
      const res = await fetch('/api/user/add-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, actionType: 'deposit' }),
      });
      const data = await res.json();
      if (data.success) {
        console.log(`[Rewards] +${data.added} points awarded for deposit!`);
        // Refresh points
        registerUser(); 
      }
    } catch (e) {
      console.warn('Failed to award deposit points:', e);
    }
  };

  const registerUser = async () => {
    try {
      const res = await fetch('/api/user/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, walletAddress }),
      });
      const data = await res.json();
      if (data.success) {
        setUserPoints(data.points);
      }
    } catch (e) {
      console.error('Failed to register user/fetch points:', e);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await refreshBalance();
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
        {/* Welcome Banner & Points */}
        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm flex items-center justify-between border border-blue-100 dark:border-blue-900/30">
          <div className="flex items-center gap-3">
            {user?.photo_url ? (
              <img src={user.photo_url} alt="" className="w-10 h-10 rounded-full" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 font-bold">
                {user?.first_name?.charAt(0) || "U"}
              </div>
            )}
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">Selamat datang,</p>
              <p className="font-bold text-gray-900 dark:text-white">
                {user?.first_name || "Pengguna"} {user?.last_name || ""}
              </p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-500 dark:text-gray-400 uppercase font-bold tracking-wider">Reward Points</p>
            <div className="flex items-center gap-1 justify-end">
              <span className="text-xl font-black text-blue-600 dark:text-blue-400">
                {userPoints !== null ? userPoints.toLocaleString() : "..."}
              </span>
              <span className="text-[10px] font-bold text-gray-400">PTS</span>
            </div>
          </div>
        </div>

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
        <div className="flex flex-wrap justify-between gap-y-4 gap-x-2">
          <Button
            variant="primary"
            onClick={() => onSend?.()}
            className="flex-1 min-w-[70px] flex flex-col items-center justify-center gap-1.5 py-3 h-auto rounded-2xl shadow-sm"
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <SendIcon className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight">Send</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => onReceive?.()}
            className="flex-1 min-w-[70px] flex flex-col items-center justify-center gap-1.5 py-3 h-auto rounded-2xl shadow-sm"
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <ReceiveIcon className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight">Receive</span>
          </Button>
          <Button
            variant="primary"
            onClick={() => onSwap?.()}
            className="flex-1 min-w-[70px] flex flex-col items-center justify-center gap-1.5 py-3 h-auto rounded-2xl shadow-sm bg-gradient-to-br from-blue-600 to-indigo-600 border-none"
          >
            <div className="bg-white/20 p-2 rounded-xl">
              <SwapIcon className="w-5 h-5" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight">Swap</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => onStaking?.()}
            className="flex-1 min-w-[70px] flex flex-col items-center justify-center gap-1.5 py-3 h-auto rounded-2xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div className="bg-blue-50 dark:bg-blue-900/30 p-2 rounded-xl">
              <StakeIcon className="w-5 h-5 text-blue-600" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight text-gray-700 dark:text-gray-300">Stake</span>
          </Button>
          <Button
            variant="outline"
            onClick={() => onGovernance?.()}
            className="flex-1 min-w-[70px] flex flex-col items-center justify-center gap-1.5 py-3 h-auto rounded-2xl border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
          >
            <div className="bg-purple-50 dark:bg-purple-900/30 p-2 rounded-xl">
              <GovernanceIcon className="w-5 h-5 text-purple-600" />
            </div>
            <span className="text-[11px] font-bold uppercase tracking-tight text-gray-700 dark:text-gray-300">Gov</span>
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

const SwapIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

const GovernanceIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
  </svg>
);

export default WalletDashboard;
