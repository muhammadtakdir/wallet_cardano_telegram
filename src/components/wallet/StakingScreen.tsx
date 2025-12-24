"use client";

import * as React from "react";
import { Card, Button, PinInput } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import {
  getStakeAddressFromAddress,
  getStakingInfo,
  getPoolInfo,
  getRewardHistory,
  searchPools,
  getDefaultPool,
  findDefaultPool,
  delegateToPool,
  withdrawRewards,
  getCurrentEpoch,
  lovelaceToAda,
  type StakingInfo,
  type StakePoolInfo,
  type EpochReward,
} from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification } from "@/lib/storage/encryption";

export interface StakingScreenProps {
  onBack: () => void;
}

type StakingStep = "overview" | "search" | "pool-detail" | "confirm" | "pin" | "processing" | "success" | "error";

export const StakingScreen: React.FC<StakingScreenProps> = ({ onBack }) => {
  const { walletAddress, activeWalletId, network } = useWalletStore();

  // State
  const [step, setStep] = React.useState<StakingStep>("overview");
  const [isLoading, setIsLoading] = React.useState(true);
  const [stakeAddress, setStakeAddress] = React.useState<string | null>(null);
  const [stakingInfo, setStakingInfo] = React.useState<StakingInfo | null>(null);
  const [currentPool, setCurrentPool] = React.useState<StakePoolInfo | null>(null);
  const [rewardHistory, setRewardHistory] = React.useState<EpochReward[]>([]);
  const [currentEpoch, setCurrentEpoch] = React.useState<number | null>(null);
  
  // Search state
  const [searchQuery, setSearchQuery] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<StakePoolInfo[]>([]);
  const [isSearching, setIsSearching] = React.useState(false);
  
  // Selected pool for delegation
  const [selectedPool, setSelectedPool] = React.useState<StakePoolInfo | null>(null);
  
  // Action state
  const [action, setAction] = React.useState<"delegate" | "withdraw" | null>(null);
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);

  // Load staking data
  React.useEffect(() => {
    const loadStakingData = async () => {
      if (!walletAddress) return;
      
      setIsLoading(true);
      try {
        // Get stake address
        const stakeAddr = await getStakeAddressFromAddress(walletAddress);
        setStakeAddress(stakeAddr);
        
        if (stakeAddr) {
          // Get staking info
          const info = await getStakingInfo(stakeAddr);
          setStakingInfo(info);
          
          // Get current pool info if delegating
          if (info?.poolId) {
            const poolInfo = await getPoolInfo(info.poolId);
            setCurrentPool(poolInfo);
          }
          
          // Get reward history
          const rewards = await getRewardHistory(stakeAddr, 5);
          setRewardHistory(rewards);
        }
        
        // Get current epoch
        const epochInfo = await getCurrentEpoch();
        if (epochInfo) {
          setCurrentEpoch(epochInfo.epoch);
        }
      } catch (err) {
        console.error("Error loading staking data:", err);
      } finally {
        setIsLoading(false);
      }
    };

    loadStakingData();
  }, [walletAddress]);

  // Search pools
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;
    
    setIsSearching(true);
    try {
      const results = await searchPools(searchQuery);
      setSearchResults(results);
    } catch (err) {
      console.error("Error searching pools:", err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  // Select pool
  const handleSelectPool = async (pool: StakePoolInfo) => {
    setSelectedPool(pool);
    setStep("pool-detail");
  };

  // Start delegation
  const handleStartDelegation = async (pool?: StakePoolInfo) => {
    const targetPool = pool || selectedPool;
    if (!targetPool) {
      // Search for default pool dynamically
      await handleLoadDefaultPool();
      return;
    }
    setSelectedPool(targetPool);
    setAction("delegate");
    setStep("confirm");
  };

  // Load default pool info (search by ticker)
  const handleLoadDefaultPool = async () => {
    setIsLoading(true);
    setError(null);
    try {
      // Search for the default pool (Cardanesia ADI)
      const poolInfo = await findDefaultPool();
      if (poolInfo) {
        setSelectedPool(poolInfo);
        setAction("delegate");
        setStep("confirm");
      } else {
        // Pool not found on this network
        const defaultPool = getDefaultPool();
        setError(`Pool [${defaultPool.ticker}] ${defaultPool.name} not found on ${network}. Please search for another pool.`);
        setStep("search");
      }
    } catch (err) {
      console.error("Error loading default pool:", err);
      setError("Failed to find default pool. Please search manually.");
      setStep("search");
    } finally {
      setIsLoading(false);
    }
  };

  // Start withdrawal
  const handleStartWithdrawal = () => {
    setAction("withdraw");
    setStep("confirm");
  };

  // Confirm action
  const handleConfirm = () => {
    setPin("");
    setPinError(null);
    setStep("pin");
  };

  // Verify PIN and execute action
  const handlePinComplete = async (enteredPin: string) => {
    setPinError(null);
    try {
      const storedWallet = getStoredWalletForVerification(activeWalletId || undefined);
      if (!storedWallet || !storedWallet.pinHash) {
        setPinError("Wallet configuration error");
        return;
      }
      const isValid = verifyPin(enteredPin, storedWallet.pinHash);
      if (!isValid) {
        setPinError("Invalid PIN. Please try again.");
        setPin("");
        return;
      }
      await executeAction();
    } catch (err) {
      console.error("PIN verification error:", err);
      setPinError("Verification failed. Please try again.");
      setPin("");
    }
  };

  // Execute delegation or withdrawal
  const executeAction = async () => {
    setStep("processing");
    setError(null);

    try {
      const walletInstance = useWalletStore.getState()._walletInstance;
      if (!walletInstance) {
        throw new Error("Wallet not initialized");
      }

      let result: { success: boolean; txHash?: string; error?: string };

      if (action === "delegate" && selectedPool) {
        result = await delegateToPool(walletInstance, selectedPool.poolId, network);
      } else if (action === "withdraw") {
        result = await withdrawRewards(walletInstance);
      } else {
        throw new Error("Invalid action");
      }

      if (result.success && result.txHash) {
        setTxHash(result.txHash);
        setStep("success");
      } else {
        throw new Error(result.error || "Transaction failed");
      }
    } catch (err) {
      console.error("Action error:", err);
      setError(err instanceof Error ? err.message : "Transaction failed");
      setStep("error");
    }
  };

  // Format ADA amount
  const formatAda = (lovelace: string): string => {
    const ada = parseFloat(lovelaceToAda(lovelace));
    return ada.toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  // Calculate max reward for chart scaling
  const maxReward = React.useMemo(() => {
    if (rewardHistory.length === 0) return 1;
    return Math.max(...rewardHistory.map(r => parseFloat(r.amount)));
  }, [rewardHistory]);

  // =====================
  // STEP: Overview
  // =====================
  if (step === "overview") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Staking</h1>
        </header>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Staking Status */}
            <Card padding="lg">
              <div className="flex items-center gap-3 mb-4">
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  stakingInfo?.active ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100 dark:bg-gray-800"
                }`}>
                  <StakeIcon className={`w-6 h-6 ${
                    stakingInfo?.active ? "text-green-600" : "text-gray-400"
                  }`} />
                </div>
                <div>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {stakingInfo?.active ? "Actively Staking" : "Not Staking"}
                  </p>
                  <p className="text-sm text-gray-500">
                    {currentEpoch ? `Current Epoch: ${currentEpoch}` : "Loading..."}
                  </p>
                </div>
              </div>

              {stakingInfo?.active && currentPool && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-4">
                  <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">Delegated to</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    [{currentPool.ticker}] {currentPool.name}
                  </p>
                  <p className="text-xs text-gray-500 font-mono mt-1">
                    {currentPool.poolId.slice(0, 20)}...
                  </p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Total Staked</p>
                  <p className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatAda(stakingInfo?.controlledAmount || "0")} ₳
                  </p>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3">
                  <p className="text-xs text-gray-500 mb-1">Available Rewards</p>
                  <p className="text-lg font-bold text-green-600">
                    {formatAda(stakingInfo?.availableRewards || "0")} ₳
                  </p>
                </div>
              </div>
            </Card>

            {/* Rewards Chart */}
            {rewardHistory.length > 0 && (
              <Card padding="lg">
                <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                  Reward History (Last 5 Epochs)
                </h3>
                
                {/* Simple Bar Chart */}
                <div className="flex items-end justify-between gap-2 h-32 mb-2">
                  {rewardHistory.slice().reverse().map((reward, index) => {
                    const height = maxReward > 0 
                      ? (parseFloat(reward.amount) / maxReward) * 100 
                      : 0;
                    return (
                      <div key={reward.epoch} className="flex-1 flex flex-col items-center">
                        <div 
                          className="w-full bg-blue-500 dark:bg-blue-600 rounded-t-lg transition-all duration-300"
                          style={{ height: `${Math.max(height, 5)}%` }}
                        />
                        <p className="text-xs text-gray-500 mt-2">{reward.epoch}</p>
                      </div>
                    );
                  })}
                </div>
                
                {/* Reward amounts */}
                <div className="flex justify-between gap-2 text-xs">
                  {rewardHistory.slice().reverse().map((reward) => (
                    <div key={reward.epoch} className="flex-1 text-center text-gray-600 dark:text-gray-400">
                      {formatAda(reward.amount)} ₳
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {/* Actions */}
            <div className="space-y-3">
              {stakingInfo?.active ? (
                <>
                  {parseFloat(stakingInfo.availableRewards) > 0 && (
                    <Button
                      variant="primary"
                      fullWidth
                      size="lg"
                      onClick={handleStartWithdrawal}
                    >
                      <WithdrawIcon className="w-5 h-5 mr-2" />
                      Withdraw Rewards ({formatAda(stakingInfo.availableRewards)} ₳)
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    fullWidth
                    size="lg"
                    onClick={() => setStep("search")}
                  >
                    <SearchIcon className="w-5 h-5 mr-2" />
                    Change Stake Pool
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="primary"
                    fullWidth
                    size="lg"
                    onClick={() => handleStartDelegation()}
                  >
                    <StakeIcon className="w-5 h-5 mr-2" />
                    Stake with Cardanesia [ADI]
                  </Button>
                  <Button
                    variant="outline"
                    fullWidth
                    size="lg"
                    onClick={() => setStep("search")}
                  >
                    <SearchIcon className="w-5 h-5 mr-2" />
                    Search Other Pools
                  </Button>
                </>
              )}
            </div>

            {/* Info Card */}
            <Card padding="md" className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800">
              <div className="flex gap-3">
                <InfoIcon className="w-5 h-5 text-yellow-600 flex-shrink-0" />
                <div className="text-sm text-yellow-800 dark:text-yellow-200">
                  <p className="font-medium mb-1">About Staking</p>
                  <ul className="text-xs space-y-1 list-disc list-inside">
                    <li>First delegation requires ~2 ADA deposit</li>
                    <li>Rewards start appearing after 3-4 epochs</li>
                    <li>Your ADA stays in your wallet</li>
                    <li>No lock-up period - unstake anytime</li>
                  </ul>
                </div>
              </div>
            </Card>
          </div>
        )}
      </div>
    );
  }

  // =====================
  // STEP: Search Pools
  // =====================
  if (step === "search") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("overview")} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Search Pools</h1>
        </header>

        {/* Search Input */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            placeholder="Search by ticker or name..."
            className="flex-1 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          />
          <Button
            variant="primary"
            onClick={handleSearch}
            disabled={isSearching || !searchQuery.trim()}
          >
            {isSearching ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
            ) : (
              <SearchIcon className="w-5 h-5" />
            )}
          </Button>
        </div>

        {/* Default Pool Suggestion */}
        <Card padding="md" className="mb-4 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800" onClick={() => {
          handleLoadDefaultPool();
        }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center">
              <StarIcon className="w-5 h-5 text-blue-600" />
            </div>
            <div className="flex-1">
              <p className="font-medium text-gray-900 dark:text-white">[ADI] Cardanesia</p>
              <p className="text-sm text-gray-500">Recommended Pool (if available)</p>
            </div>
            {isLoading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
            ) : (
              <ChevronRightIcon className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </Card>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">{error}</p>
          </div>
        )}

        {/* Search Results */}
        {searchResults.length > 0 && (
          <div className="space-y-3">
            <p className="text-sm text-gray-500">{searchResults.length} pools found</p>
            {searchResults.map((pool) => (
              <Card
                key={pool.poolId}
                padding="md"
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => handleSelectPool(pool)}
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gray-100 dark:bg-gray-800 rounded-full flex items-center justify-center">
                    <PoolIcon className="w-5 h-5 text-gray-600" />
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">
                      [{pool.ticker}] {pool.name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {pool.delegators} delegators • {pool.margin.toFixed(2)}% margin
                    </p>
                  </div>
                  <ChevronRightIcon className="w-5 h-5 text-gray-400" />
                </div>
              </Card>
            ))}
          </div>
        )}

        {searchQuery && searchResults.length === 0 && !isSearching && (
          <div className="text-center py-8 text-gray-500">
            No pools found for "{searchQuery}"
          </div>
        )}
      </div>
    );
  }

  // =====================
  // STEP: Pool Detail
  // =====================
  if (step === "pool-detail" && selectedPool) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("search")} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Pool Details</h1>
        </header>

        <Card padding="lg" className="space-y-4">
          {/* Pool Header */}
          <div className="text-center pb-4 border-b border-gray-200 dark:border-gray-700">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-3">
              <span className="text-xl font-bold text-blue-600">{selectedPool.ticker.slice(0, 2)}</span>
            </div>
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              [{selectedPool.ticker}] {selectedPool.name}
            </h2>
            <p className="text-xs text-gray-500 font-mono mt-1">
              {selectedPool.poolId.slice(0, 30)}...
            </p>
          </div>

          {/* Pool Stats */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Saturation</p>
              <p className="font-medium text-gray-900 dark:text-white">{selectedPool.saturation.toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Margin</p>
              <p className="font-medium text-gray-900 dark:text-white">{selectedPool.margin.toFixed(2)}%</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Fixed Cost</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatAda(selectedPool.fixedCost)} ₳</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Pledge</p>
              <p className="font-medium text-gray-900 dark:text-white">{formatAda(selectedPool.pledge)} ₳</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Live Stake</p>
              <p className="font-medium text-gray-900 dark:text-white">
                {(parseFloat(selectedPool.liveStake) / 1000000).toLocaleString(undefined, { maximumFractionDigits: 0 })} ₳
              </p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Delegators</p>
              <p className="font-medium text-gray-900 dark:text-white">{selectedPool.delegators.toLocaleString()}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Blocks This Epoch</p>
              <p className="font-medium text-gray-900 dark:text-white">{selectedPool.blocksEpoch}</p>
            </div>
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500">Total Blocks</p>
              <p className="font-medium text-gray-900 dark:text-white">{selectedPool.blocksMinted.toLocaleString()}</p>
            </div>
          </div>

          {selectedPool.description && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3">
              <p className="text-xs text-gray-500 mb-1">Description</p>
              <p className="text-sm text-gray-700 dark:text-gray-300">{selectedPool.description}</p>
            </div>
          )}

          {selectedPool.homepage && (
            <a
              href={selectedPool.homepage}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 text-blue-600 text-sm hover:underline"
            >
              <LinkIcon className="w-4 h-4" />
              Visit Pool Website
            </a>
          )}
        </Card>

        <div className="mt-4">
          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={() => handleStartDelegation(selectedPool)}
          >
            Delegate to [{selectedPool.ticker}]
          </Button>
        </div>
      </div>
    );
  }

  // =====================
  // STEP: Confirm
  // =====================
  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("overview")} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            {action === "delegate" ? "Confirm Delegation" : "Confirm Withdrawal"}
          </h1>
        </header>

        <Card padding="lg" className="space-y-6">
          {action === "delegate" && selectedPool && (
            <>
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-2">You are delegating to</p>
                <p className="text-2xl font-bold text-gray-900 dark:text-white">
                  [{selectedPool.ticker}] {selectedPool.name}
                </p>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
                <div className="flex items-start gap-2">
                  <WarningIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-800 dark:text-yellow-200">
                    {!stakingInfo?.active ? (
                      <p>First delegation requires ~2 ADA deposit (refundable when you unregister).</p>
                    ) : (
                      <p>Changing pools takes effect in 2-3 epochs.</p>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}

          {action === "withdraw" && (
            <>
              <div className="text-center py-4">
                <p className="text-sm text-gray-500 mb-2">Withdrawing rewards</p>
                <p className="text-3xl font-bold text-green-600">
                  {formatAda(stakingInfo?.availableRewards || "0")} ₳
                </p>
              </div>

              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                <p className="text-sm text-blue-800 dark:text-blue-200">
                  Rewards will be added to your spendable balance.
                </p>
              </div>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" fullWidth onClick={() => setStep("overview")}>
              Cancel
            </Button>
            <Button variant="primary" fullWidth onClick={handleConfirm}>
              Confirm
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // =====================
  // STEP: PIN
  // =====================
  if (step === "pin") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("confirm")} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Enter PIN</h1>
        </header>

        <Card padding="lg" className="text-center">
          <LockIcon className="w-12 h-12 text-blue-600 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            Enter your PIN to confirm the {action === "delegate" ? "delegation" : "withdrawal"}
          </p>
          <PinInput value={pin} onChange={setPin} onComplete={handlePinComplete} error={pinError || undefined} autoFocus />
        </Card>
      </div>
    );
  }

  // =====================
  // STEP: Processing
  // =====================
  if (step === "processing") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <Card padding="lg" className="text-center w-full max-w-sm">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-6" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {action === "delegate" ? "Delegating..." : "Withdrawing Rewards..."}
          </h2>
          <p className="text-gray-500">Please wait while your transaction is being processed...</p>
        </Card>
      </div>
    );
  }

  // =====================
  // STEP: Success
  // =====================
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <Card padding="lg" className="text-center w-full max-w-sm">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <CheckIcon className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            {action === "delegate" ? "Delegation Successful!" : "Withdrawal Successful!"}
          </h2>
          <p className="text-gray-500 mb-4">
            {action === "delegate"
              ? "Your delegation will be active in 2-3 epochs."
              : "Rewards have been added to your balance."}
          </p>
          {txHash && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 mb-6">
              <p className="text-xs text-gray-500 mb-1">Transaction Hash</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all">{txHash}</p>
            </div>
          )}
          <Button variant="primary" fullWidth onClick={onBack}>
            Done
          </Button>
        </Card>
      </div>
    );
  }

  // =====================
  // STEP: Error
  // =====================
  if (step === "error") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <Card padding="lg" className="text-center w-full max-w-sm">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-6">
            <XIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Transaction Failed</h2>
          <p className="text-red-500 mb-6">{error || "An error occurred"}</p>
          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" fullWidth onClick={onBack}>
              Cancel
            </Button>
            <Button variant="primary" fullWidth onClick={() => setStep("overview")}>
              Try Again
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return null;
};

// Icons
const BackIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const StakeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const SearchIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);

const WithdrawIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const InfoIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const StarIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="currentColor" viewBox="0 0 24 24">
    <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </svg>
);

const PoolIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const LinkIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
  </svg>
);

const WarningIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
  </svg>
);

const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const CheckIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

StakingScreen.displayName = "StakingScreen";
