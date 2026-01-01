"use client";

import * as React from "react";
import { Card, Button, PinInput } from "@/components/ui";
import { useWalletStore, useTelegram } from "@/hooks";
import {
  getDRepInfo,
  DEFAULT_DREP_ID,
  DRepInfo,
  shortenAddress,
  createWalletFromMnemonic,
  getStakingInfo,
  getStakeAddressFromAddress,
  listDReps,
  listDRepsFromKoios,
  getDRepDelegators,
  searchDReps,
} from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification, decryptWallet } from "@/lib/storage/encryption";

export interface GovernanceScreenProps {
  onBack: () => void;
}

type Step = "overview" | "search" | "confirm" | "pin" | "processing" | "success" | "error";

interface CurrentDelegation {
  drepId: string;
  name?: string;
  image?: string;
  bio?: string;
  website?: string;
  amount?: string;
  active?: boolean;
}

interface StakingStatus {
  isStaked: boolean;
  poolId?: string;
}

interface DRepWithDelegators extends DRepInfo {
  delegatorsCount?: number;
}

// Format ADA amount for display
const formatADA = (lovelace: string): string => {
  const ada = parseInt(lovelace) / 1_000_000;
  if (ada >= 1_000_000) {
    return `₳ ${(ada / 1_000_000).toFixed(2)}M`;
  } else if (ada >= 1_000) {
    return `₳ ${(ada / 1_000).toFixed(0)}K`;
  }
  return `₳ ${ada.toFixed(0)}`;
};

// Calculate voting power percentage (mock - would need total stake data)
const formatVotingPower = (amount: string): string => {
  const ada = parseInt(amount) / 1_000_000;
  // Assuming total ADA stake is ~23B for percentage calculation
  const percentage = (ada / 23_000_000_000) * 100;
  return `${percentage.toFixed(2)}%`;
};

export const GovernanceScreen: React.FC<GovernanceScreenProps> = ({ onBack }) => {
  const { activeWalletId, network, _walletInstance } = useWalletStore();
  const { initData } = useTelegram();

  const [step, setStep] = React.useState<Step>("overview");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [selectedDRep, setSelectedDRep] = React.useState<DRepInfo | null>(null);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentDelegation, setCurrentDelegation] = React.useState<CurrentDelegation | null>(null);
  const [loadingCurrent, setLoadingCurrent] = React.useState(true);
  const [stakingStatus, setStakingStatus] = React.useState<StakingStatus>({ isStaked: false });
  
  // DRep list state
  const [drepList, setDrepList] = React.useState<DRepWithDelegators[]>([]);
  const [filteredDreps, setFilteredDreps] = React.useState<DRepWithDelegators[]>([]);
  const [loadingDreps, setLoadingDreps] = React.useState(false);
  const [showDrepList, setShowDrepList] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<"power" | "delegators">("power");
  const [defaultDRep, setDefaultDRep] = React.useState<DRepWithDelegators | null>(null);

  // Load current delegation and DRep list
  React.useEffect(() => {
    if (step === "overview") {
      loadCurrentDelegation();
      loadDefaultDRepInfo();
    }
  }, [step, _walletInstance]);

  // Search DReps when search query changes (with debounce)
  React.useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredDreps(drepList);
      return;
    }
    
    // If searching by ID, filter locally first
    const query = searchQuery.toLowerCase();
    
    // Debounce API call for search by name
    const searchTimeout = setTimeout(async () => {
      // If more than 2 characters and not just a DRep ID prefix, search via API
      if (searchQuery.length >= 2 && !searchQuery.startsWith("drep1")) {
        try {
          const results = await searchDReps(searchQuery);
          // Convert to DRepWithDelegators format
          const drepsWithDelegators: DRepWithDelegators[] = results.map(drep => ({
            ...drep,
            delegatorsCount: 0
          }));
          setFilteredDreps(drepsWithDelegators);
        } catch (e) {
          // Fallback to local filter
          const filtered = drepList.filter(drep => 
            drep.name?.toLowerCase().includes(query) ||
            drep.drepId.toLowerCase().includes(query)
          );
          setFilteredDreps(filtered);
        }
      } else {
        // Local filter for DRep ID or short queries
        const filtered = drepList.filter(drep => 
          drep.name?.toLowerCase().includes(query) ||
          drep.drepId.toLowerCase().includes(query)
        );
        setFilteredDreps(filtered);
      }
    }, 300);
    
    return () => clearTimeout(searchTimeout);
  }, [searchQuery, drepList]);

  // Sort DReps
  React.useEffect(() => {
    const sorted = [...filteredDreps].sort((a, b) => {
      if (sortBy === "power") {
        return parseInt(b.amount) - parseInt(a.amount);
      } else {
        return (b.delegatorsCount || 0) - (a.delegatorsCount || 0);
      }
    });
    setFilteredDreps(sorted);
  }, [sortBy]);

  const loadCurrentDelegation = async () => {
    if (!_walletInstance) {
      setLoadingCurrent(false);
      return;
    }
    
    setLoadingCurrent(true);
    try {
      const addresses = await _walletInstance.getUsedAddresses();
      const address = addresses[0] || await _walletInstance.getChangeAddress();
      
      if (!address) {
        setLoadingCurrent(false);
        return;
      }

      const stakeAddress = await getStakeAddressFromAddress(address);
      if (!stakeAddress) {
        setLoadingCurrent(false);
        return;
      }

      const stakingInfo = await getStakingInfo(stakeAddress);
      
      if (stakingInfo?.poolId) {
        setStakingStatus({ isStaked: true, poolId: stakingInfo.poolId });
      } else {
        setStakingStatus({ isStaked: false });
      }
      
      if (stakingInfo?.drepId) {
        const drepInfo = await getDRepInfo(stakingInfo.drepId);
        setCurrentDelegation({
          drepId: stakingInfo.drepId,
          name: drepInfo?.name || undefined,
          image: drepInfo?.image || undefined,
          bio: drepInfo?.bio || undefined,
          website: drepInfo?.website || undefined,
          amount: drepInfo?.amount || undefined,
          active: drepInfo?.active,
        });
      } else {
        setCurrentDelegation(null);
      }
    } catch (e) {
      console.warn("Failed to load current delegation", e);
      setCurrentDelegation(null);
    } finally {
      setLoadingCurrent(false);
    }
  };

  const loadDefaultDRepInfo = async () => {
    try {
      const info = await getDRepInfo(DEFAULT_DREP_ID);
      if (info) {
        const delegators = await getDRepDelegators(DEFAULT_DREP_ID);
        setDefaultDRep({ ...info, delegatorsCount: delegators });
      }
    } catch (e) {
      console.warn("Failed to load default DRep", e);
    }
  };

  const loadDRepList = async () => {
    setLoadingDreps(true);
    try {
      // Try Koios first (richer metadata with images/bio)
      let dreps: DRepInfo[] = [];
      const koiosResult = await listDRepsFromKoios(1, 30);
      
      if (koiosResult.dreps.length > 0) {
        dreps = koiosResult.dreps;
      } else {
        // Fallback to Blockfrost
        const blockfrostResult = await listDReps(1, 20, "desc");
        dreps = blockfrostResult.dreps;
      }
      
      // Fetch delegator counts for each DRep (only first 20 to avoid rate limits)
      const drepsWithDelegators: DRepWithDelegators[] = await Promise.all(
        dreps.slice(0, 20).map(async (drep) => {
          const count = await getDRepDelegators(drep.drepId);
          return { ...drep, delegatorsCount: count };
        })
      );
      
      setDrepList(drepsWithDelegators);
      setFilteredDreps(drepsWithDelegators);
    } catch (e) {
      console.warn("Failed to load DRep list", e);
    } finally {
      setLoadingDreps(false);
    }
  };

  const handleSearchById = async () => {
    if (!searchQuery.startsWith("drep")) {
      setError("Please enter a valid DRep ID starting with 'drep'");
      return;
    }
    
    setIsLoading(true);
    setError(null);
    try {
      const info = await getDRepInfo(searchQuery);
      if (info) {
        const delegators = await getDRepDelegators(info.drepId);
        setSelectedDRep(info);
        setStep("confirm");
      } else {
        setError("DRep not found on chain. Please check the ID.");
      }
    } catch (e) {
      setError("Error searching DRep.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSelectDRep = (drep: DRepWithDelegators) => {
    setSelectedDRep(drep);
    setStep("confirm");
  };

  const handleConfirm = () => {
    setPin("");
    setStep("pin");
  };

  const handlePinComplete = async (enteredPin: string) => {
    const stored = getStoredWalletForVerification(activeWalletId || undefined);
    if (!stored || !verifyPin(enteredPin, stored.pinHash)) {
      setError("Invalid PIN");
      return;
    }
    await executeDelegation(enteredPin);
  };

  const executeDelegation = async (pin: string) => {
    if (!selectedDRep) return;
    setStep("processing");
    try {
      const mnemonic = decryptWallet(pin, activeWalletId || undefined);
      if (!mnemonic) throw new Error("Wallet auth failed");

      const { delegateToDRepMesh } = await import("@/lib/cardano/mesh-governance");
      const walletInstance = await createWalletFromMnemonic(mnemonic, network);
      const result = await delegateToDRepMesh(walletInstance.wallet, selectedDRep.drepId, network);
      
      if (result.success && result.txHash) {
        setTxHash(result.txHash);
        setStep("success");
        
        if (initData) {
          fetch("/api/user/add-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData, actionType: "drep" }),
          }).catch(console.warn);
        }
      } else {
        throw new Error(result.error || "Delegation failed");
      }
    } catch (err: any) {
      setError(err.message || String(err));
      setStep("error");
    }
  };

  // DRep Card Component - uses global theme with image support
  const DRepCard: React.FC<{ drep: DRepWithDelegators; onSelect: () => void }> = ({ drep, onSelect }) => {
    const [imgError, setImgError] = React.useState(false);
    // Display name or truncated ID if no name
    const displayName = drep.name || shortenAddress(drep.drepId, 8);
    const initial = drep.name?.[0]?.toUpperCase() || drep.drepId[4]?.toUpperCase() || "D";
    
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            {/* Avatar - show image if available */}
            {drep.image && !imgError ? (
              <img 
                src={drep.image} 
                alt={displayName}
                className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                onError={() => setImgError(true)}
              />
            ) : (
              <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-gray-600 text-blue-600 dark:text-white flex items-center justify-center flex-shrink-0 text-lg font-bold">
                {initial}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-gray-900 dark:text-white truncate">{displayName}</span>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  drep.active 
                    ? "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400" 
                    : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                }`}>
                  {drep.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
          </div>
          <Button size="sm" onClick={onSelect} className="ml-2 flex-shrink-0">
            Delegate
          </Button>
        </div>
        
        {/* Bio - show if available */}
        {drep.bio && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            {drep.bio}
          </p>
        )}
        
        {/* DRep ID */}
        <div className="mb-3">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">DRep ID (CIP129)</p>
          <p className="text-xs font-mono text-blue-600 dark:text-blue-400 break-all">
            {drep.drepId}
          </p>
        </div>
        
        {/* Stats */}
        <div className="flex gap-6 text-sm">
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Delegators</p>
            <p className="text-gray-900 dark:text-white font-semibold">{drep.delegatorsCount ?? "..."}</p>
          </div>
          <div>
            <p className="text-gray-500 dark:text-gray-400 text-xs">Voting power</p>
            <p className="text-gray-900 dark:text-white font-semibold">
              {formatVotingPower(drep.amount)} ({formatADA(drep.amount)})
            </p>
          </div>
        </div>
      </div>
    );
  };

  // Overview with DRep Search
  if (step === "overview") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <header className="sticky top-0 bg-white dark:bg-gray-800 z-10 px-4 py-3 border-b border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-3">
            <button onClick={onBack} className="p-1 text-gray-600 dark:text-gray-300">
              <BackIcon className="w-6 h-6" />
            </button>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Governance</h1>
          </div>
        </header>

        <div className="p-4 space-y-4">
          {/* Current Delegation Status */}
          <Card padding="lg">
            <h2 className="font-bold mb-2 text-gray-900 dark:text-white">Current Delegation</h2>
            {loadingCurrent ? (
              <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
                <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm">Loading...</span>
              </div>
            ) : currentDelegation ? (
              <div className="bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 p-3 rounded-lg">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-green-600 dark:text-green-400">✓</span>
                  <span className="font-semibold text-green-700 dark:text-green-300">Delegated</span>
                </div>
                
                {/* DRep Info with Image */}
                <div className="flex items-start gap-3 mb-3">
                  {currentDelegation.image ? (
                    <img 
                      src={currentDelegation.image} 
                      alt={currentDelegation.name || "DRep"}
                      className="w-12 h-12 rounded-full object-cover flex-shrink-0"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                    />
                  ) : (
                    <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-800 flex items-center justify-center flex-shrink-0">
                      <span className="text-xl font-bold text-blue-600 dark:text-blue-300">
                        {currentDelegation.name?.[0]?.toUpperCase() || "D"}
                      </span>
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    {currentDelegation.name && (
                      <p className="font-bold text-lg text-gray-900 dark:text-white">{currentDelegation.name}</p>
                    )}
                    <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                      {currentDelegation.drepId}
                    </p>
                  </div>
                </div>
                
                {/* DRep Bio */}
                {currentDelegation.bio && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                    {currentDelegation.bio}
                  </p>
                )}
                
                {/* DRep Details */}
                <div className="space-y-1.5 text-sm border-t border-green-200 dark:border-green-800 pt-2 mt-2">
                  {currentDelegation.amount && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Voting Power</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        {formatADA(currentDelegation.amount)} ({formatVotingPower(currentDelegation.amount)})
                      </span>
                    </div>
                  )}
                  {currentDelegation.active !== undefined && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Status</span>
                      <span className={`font-medium ${currentDelegation.active ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                        {currentDelegation.active ? 'Active' : 'Inactive'}
                      </span>
                    </div>
                  )}
                  {currentDelegation.website && (
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Website</span>
                      <a 
                        href={currentDelegation.website} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:underline truncate max-w-[180px]"
                      >
                        {currentDelegation.website.replace(/^https?:\/\//, '')}
                      </a>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="bg-yellow-50 dark:bg-yellow-900/30 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-yellow-600 dark:text-yellow-400">⚠</span>
                  <span className="text-sm text-yellow-700 dark:text-yellow-300">
                    Not delegated yet. Delegate to participate in governance.
                  </span>
                </div>
              </div>
            )}
          </Card>

          {/* Staking Required Warning */}
          {!loadingCurrent && !stakingStatus.isStaked ? (
            <Card padding="lg" className="bg-red-50 dark:bg-red-900/30 border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-red-600 dark:text-red-400 text-lg">⚠️</span>
                <span className="font-semibold text-red-700 dark:text-red-300">Staking Required</span>
              </div>
              <p className="text-sm text-red-700 dark:text-red-300 mb-3">
                You must stake your ADA to a stake pool before delegating to a DRep.
              </p>
              <Button size="sm" onClick={onBack} className="bg-red-600 hover:bg-red-700">
                Go to Staking
              </Button>
            </Card>
          ) : (
            <>
              {/* Available DReps Section */}
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <h2 className="text-lg font-bold text-center mb-1 text-gray-900 dark:text-white">Available DReps</h2>
                  <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-4">
                    Type in a name to filter the list, or enter a DRep ID.
                  </p>
                  
                  {/* Search Input */}
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by name or drep1..."
                        className="w-full pl-9 pr-8 py-2 bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:border-blue-500"
                      />
                      {searchQuery && (
                        <button 
                          onClick={() => setSearchQuery("")}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-white"
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </div>
                  
                  {/* Sort & Actions */}
                  <div className="flex items-center justify-between mt-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-500 dark:text-gray-400">Sort by</span>
                      <select 
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as "power" | "delegators")}
                        className="bg-gray-100 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded px-2 py-1 text-sm text-gray-900 dark:text-white"
                      >
                        <option value="power">Voting Power</option>
                        <option value="delegators">Delegators</option>
                      </select>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => {
                        setShowDrepList(true);
                        if (drepList.length === 0) loadDRepList();
                      }}
                    >
                      {showDrepList ? "Hide list" : "Show DRep list"}
                    </Button>
                  </div>

                  {/* Search by ID button */}
                  {searchQuery.startsWith("drep") && (
                    <Button 
                      fullWidth 
                      onClick={handleSearchById}
                      disabled={isLoading}
                      className="mt-3"
                    >
                      {isLoading ? "Searching..." : "Search DRep by ID"}
                    </Button>
                  )}
                  
                  {error && <p className="text-red-500 text-sm mt-2">{error}</p>}
                </div>

                {/* Default/Recommended DRep */}
                {defaultDRep && (
                  <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-blue-50/50 dark:bg-blue-900/10">
                    <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">✨ Recommended DRep</p>
                    <DRepCard drep={defaultDRep} onSelect={() => handleSelectDRep(defaultDRep)} />
                  </div>
                )}

                {/* DRep List */}
                {showDrepList && (
                  <div className="p-4 space-y-3 max-h-96 overflow-y-auto bg-gray-50 dark:bg-gray-900/50">
                    {loadingDreps ? (
                      <div className="flex items-center justify-center py-8">
                        <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                        <span className="ml-2 text-gray-500 dark:text-gray-400">Loading DReps...</span>
                      </div>
                    ) : filteredDreps.length > 0 ? (
                      filteredDreps.map((drep) => (
                        <DRepCard 
                          key={drep.drepId} 
                          drep={drep} 
                          onSelect={() => handleSelectDRep(drep)} 
                        />
                      ))
                    ) : (
                      <p className="text-center text-gray-500 dark:text-gray-400 py-8">
                        {searchQuery ? "No DReps found matching your search" : "No DReps loaded yet"}
                      </p>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  // Confirm Step
  if (step === "confirm") {
    const displayName = selectedDRep?.name || shortenAddress(selectedDRep?.drepId || "", 8);
    const initial = selectedDRep?.name?.[0]?.toUpperCase() || selectedDRep?.drepId?.[4]?.toUpperCase() || "D";
    
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("overview")} className="text-gray-600 dark:text-gray-300">
            <BackIcon className="w-6 h-6" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Delegation</h1>
        </header>
        
        <Card padding="lg">
          {currentDelegation && (
            <div className="mb-4 pb-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Current DRep:</p>
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {currentDelegation.name || shortenAddress(currentDelegation.drepId, 12)}
              </p>
            </div>
          )}
          
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {currentDelegation ? "Change voting delegation to:" : "Delegate voting power to:"}
          </p>
          
          {/* Selected DRep Info with Image */}
          <div className="my-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
            <div className="flex items-center gap-3 mb-3">
              {selectedDRep?.image ? (
                <img 
                  src={selectedDRep.image} 
                  alt={displayName}
                  className="w-12 h-12 rounded-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).style.display = 'none';
                  }}
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-blue-100 dark:bg-gray-600 text-blue-600 dark:text-white flex items-center justify-center text-xl font-bold">
                  {initial}
                </div>
              )}
              <div>
                <p className="font-bold text-xl text-blue-600 dark:text-blue-400">{displayName}</p>
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                  selectedDRep?.active 
                    ? "bg-green-100 dark:bg-green-500/20 text-green-600 dark:text-green-400" 
                    : "bg-red-100 dark:bg-red-500/20 text-red-600 dark:text-red-400"
                }`}>
                  {selectedDRep?.active ? "Active" : "Inactive"}
                </span>
              </div>
            </div>
            
            {/* Bio */}
            {selectedDRep?.bio && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {selectedDRep.bio}
              </p>
            )}
            
            <p className="text-xs font-mono text-gray-500 dark:text-gray-400 break-all">
              {selectedDRep?.drepId}
            </p>
            {selectedDRep?.amount && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-2">
                Voting Power: {formatVotingPower(selectedDRep.amount)} ({formatADA(selectedDRep.amount)})
              </p>
            )}
            
            {/* Website Link */}
            {selectedDRep?.website && (
              <a 
                href={selectedDRep.website} 
                target="_blank" 
                rel="noopener noreferrer"
                className="text-sm text-blue-500 hover:underline mt-2 block"
              >
                🌐 {selectedDRep.website}
              </a>
            )}
          </div>
          
          <div className="flex gap-2 mt-6">
            <Button variant="outline" fullWidth onClick={() => setStep("overview")}>Cancel</Button>
            <Button fullWidth onClick={handleConfirm}>
              {currentDelegation ? "Change Delegation" : "Confirm"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // PIN Step
  if (step === "pin") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex flex-col items-center justify-center">
        <h1 className="text-xl font-bold mb-4 text-gray-900 dark:text-white">Enter PIN</h1>
        <PinInput value={pin} onChange={setPin} onComplete={handlePinComplete} autoFocus />
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </div>
    );
  }

  // Processing Step
  if (step === "processing") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center">
        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-4" />
        <p className="text-lg text-gray-900 dark:text-white">Processing delegation...</p>
      </div>
    );
  }

  // Success Step
  if (step === "success") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">✅</div>
        <h1 className="text-xl font-bold text-green-600 dark:text-green-400 mb-2">Delegation Successful!</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-4 text-center">
          Tx Hash:<br />
          <span className="font-mono text-sm">{shortenAddress(txHash || "", 16)}</span>
        </p>
        <Button onClick={onBack}>Done</Button>
      </div>
    );
  }

  // Error Step
  if (step === "error") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex flex-col items-center justify-center">
        <div className="text-6xl mb-4">❌</div>
        <h1 className="text-xl font-bold text-red-600 dark:text-red-400 mb-2">Delegation Failed</h1>
        <p className="text-gray-500 dark:text-gray-400 mb-4 text-center max-w-sm">{error}</p>
        <Button onClick={() => setStep("overview")}>Try Again</Button>
      </div>
    );
  }

  return null;
};

// Icons
const BackIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

const SearchIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
  </svg>
);