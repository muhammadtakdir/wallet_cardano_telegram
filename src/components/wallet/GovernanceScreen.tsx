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
} from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification, decryptWallet } from "@/lib/storage/encryption";

export interface GovernanceScreenProps {
  onBack: () => void;
}

type Step = "overview" | "search" | "confirm" | "pin" | "processing" | "success" | "error";

interface CurrentDelegation {
  drepId: string;
  name?: string;
}

export const GovernanceScreen: React.FC<GovernanceScreenProps> = ({ onBack }) => {
  const { activeWalletId, network, _walletInstance } = useWalletStore();
  const { initData } = useTelegram();

  const [step, setStep] = React.useState<Step>("overview");
  const [drepId, setDrepId] = React.useState("");
  const [selectedDRep, setSelectedDRep] = React.useState<DRepInfo | null>(null);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [currentDelegation, setCurrentDelegation] = React.useState<CurrentDelegation | null>(null);
  const [loadingCurrent, setLoadingCurrent] = React.useState(true);

  // Load current delegation and default DRep info
  React.useEffect(() => {
    if (step === "overview") {
      loadCurrentDelegation();
      loadDefaultDRep();
    }
  }, [step, _walletInstance]);

  const loadCurrentDelegation = async () => {
    if (!_walletInstance) {
      setLoadingCurrent(false);
      return;
    }
    
    setLoadingCurrent(true);
    try {
      // Get wallet address
      const addresses = await _walletInstance.getUsedAddresses();
      const address = addresses[0] || await _walletInstance.getChangeAddress();
      
      if (!address) {
        setLoadingCurrent(false);
        return;
      }

      // Get stake address
      const stakeAddress = await getStakeAddressFromAddress(address);
      if (!stakeAddress) {
        setLoadingCurrent(false);
        return;
      }

      // Get staking info which includes drep_id
      const stakingInfo = await getStakingInfo(stakeAddress);
      
      if (stakingInfo?.drepId) {
        // Fetch DRep name if possible
        const drepInfo = await getDRepInfo(stakingInfo.drepId);
        setCurrentDelegation({
          drepId: stakingInfo.drepId,
          name: drepInfo?.name || undefined,
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

  const loadDefaultDRep = async () => {
    setIsLoading(true);
    try {
      const info = await getDRepInfo(DEFAULT_DREP_ID);
      if (info) {
        setSelectedDRep(info);
      } else {
        // Fallback info if API fails
        setSelectedDRep({
          drepId: DEFAULT_DREP_ID,
          view: DEFAULT_DREP_ID,
          deposit: "0",
          active: true,
          amount: "0",
          name: "Unknown DRep",
        });
      }
    } catch (e) {
      console.warn("Failed to load DRep info", e);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = async (id?: string) => {
    const targetId = id || drepId;
    if (!targetId) return;
    setIsLoading(true);
    setError(null);
    try {
      const info = await getDRepInfo(targetId);
      if (info) {
        setSelectedDRep(info);
        setStep("confirm");
      } else if (targetId === DEFAULT_DREP_ID) {
        // Fallback for default DRep if API fails
        setSelectedDRep({
          drepId: DEFAULT_DREP_ID,
          view: DEFAULT_DREP_ID,
          deposit: "0",
          active: true,
          amount: "0",
          name: "Unknown DRep",
        });
        setStep("confirm");
      } else {
        setError("DRep not found on chain. Please check the ID.");
      }
    } catch (e) {
      if (targetId === DEFAULT_DREP_ID) {
        setSelectedDRep({
          drepId: DEFAULT_DREP_ID,
          view: DEFAULT_DREP_ID,
          deposit: "0",
          active: true,
          amount: "0",
          name: "Unknown DRep",
        });
        setStep("confirm");
      } else {
        setError("Error searching DRep.");
      }
    } finally {
      setIsLoading(false);
    }
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

      // Dynamic import to avoid WASM issues
      const { delegateToDRepMesh } = await import("@/lib/cardano/mesh-governance");
      
      // Create Mesh wallet instance from mnemonic
      const walletInstance = await createWalletFromMnemonic(mnemonic, network);
      
      const result = await delegateToDRepMesh(walletInstance.wallet, selectedDRep.drepId, network);
      
      if (result.success && result.txHash) {
        setTxHash(result.txHash);
        setStep("success");
        
        // Award points
        if (initData) {
          fetch("/api/user/add-points", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ initData, actionType: "stake" }), // Reusing 'stake' action for 1000 pts
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

  // Views
  if (step === "overview") {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={onBack}><BackIcon className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">Governance</h1>
        </header>

        {/* Current Delegation Status */}
        <Card padding="lg" className="mb-4">
          <h2 className="font-bold mb-2">Current Delegation</h2>
          {loadingCurrent ? (
            <div className="flex items-center gap-2 text-gray-500">
              <div className="w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">Loading...</span>
            </div>
          ) : currentDelegation ? (
            <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-green-600 dark:text-green-400">✓</span>
                <span className="font-semibold text-green-700 dark:text-green-300">Delegated</span>
              </div>
              {currentDelegation.name && (
                <p className="font-bold text-lg">{currentDelegation.name}</p>
              )}
              <p className="text-xs text-gray-600 dark:text-gray-400 font-mono break-all">
                {currentDelegation.drepId}
              </p>
            </div>
          ) : (
            <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 p-3 rounded-lg">
              <div className="flex items-center gap-2">
                <span className="text-yellow-600 dark:text-yellow-400">⚠</span>
                <span className="text-sm text-yellow-700 dark:text-yellow-300">
                  Not delegated yet. Delegate to participate in Cardano governance.
                </span>
              </div>
            </div>
          )}
        </Card>

        {/* Delegate / Change Delegation */}
        <Card padding="lg" className="mb-6">
          <h2 className="font-bold mb-2">
            {currentDelegation ? "Change Delegation" : "Delegate to DRep"}
          </h2>
          <p className="text-sm text-gray-500 mb-4">
            {currentDelegation 
              ? "You can change your DRep delegation at any time."
              : "Delegate your voting power to a DRep to participate in Cardano governance."
            }
          </p>
          
          <div className="mb-4">
            <label className="text-sm font-medium mb-1 block">Search DRep by ID</label>
            <div className="flex gap-2">
              <input 
                value={drepId}
                onChange={(e) => setDrepId(e.target.value)}
                placeholder="drep1..."
                className="flex-1 p-2 rounded border dark:bg-gray-800 dark:border-gray-700"
              />
              <Button onClick={() => handleSearch()} disabled={isLoading || !drepId}>
                {isLoading ? "..." : "Search"}
              </Button>
            </div>
            {error && <p className="text-red-500 text-sm mt-1">{error}</p>}
          </div>

          {/* Default Option */}
          <div className="border-t dark:border-gray-700 pt-4">
            <p className="text-sm font-medium mb-2">Recommended DRep</p>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex justify-between items-center">
              <div className="overflow-hidden flex-1 mr-2">
                <p className="font-bold text-blue-600 dark:text-blue-400">
                  {selectedDRep?.name || "Loading..."}
                </p>
                <p className="text-xs text-gray-500 font-mono truncate">
                  {shortenAddress(DEFAULT_DREP_ID, 10)}
                </p>
              </div>
              <Button size="sm" onClick={() => {
                setDrepId(DEFAULT_DREP_ID);
                handleSearch(DEFAULT_DREP_ID);
              }} disabled={isLoading}>
                Select
              </Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("overview")}><BackIcon className="w-6 h-6" /></button>
          <h1 className="text-xl font-bold">Confirm Delegation</h1>
        </header>
        
        <Card padding="lg">
          {currentDelegation && (
            <div className="mb-4 pb-4 border-b dark:border-gray-700">
              <p className="text-sm text-gray-500 mb-1">Current DRep:</p>
              <p className="font-medium text-gray-700 dark:text-gray-300">
                {currentDelegation.name || shortenAddress(currentDelegation.drepId, 12)}
              </p>
            </div>
          )}
          
          <p className="text-sm text-gray-500">
            {currentDelegation ? "Change voting delegation to:" : "Delegate voting power to:"}
          </p>
          <div className="my-3">
            {selectedDRep?.name && (
              <p className="font-bold text-xl text-blue-600 dark:text-blue-400">{selectedDRep.name}</p>
            )}
            <p className="text-xs font-mono text-gray-600 dark:text-gray-400 break-all">
              {selectedDRep?.drepId}
            </p>
          </div>
          
          <div className="flex gap-2 mt-6">
            <Button variant="outline" fullWidth onClick={() => setStep("overview")}>Cancel</Button>
            <Button fullWidth onClick={handleConfirm}>
              {currentDelegation ? "Change" : "Confirm"}
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <div className="p-4 text-center">
        <h1 className="text-xl font-bold mb-4">Enter PIN</h1>
        <PinInput value={pin} onChange={setPin} onComplete={handlePinComplete} autoFocus />
        {error && <p className="text-red-500 mt-2">{error}</p>}
      </div>
    );
  }

  if (step === "processing") {
    return <div className="p-10 text-center">Processing delegation...</div>;
  }

  if (step === "success") {
    return (
      <div className="p-4 text-center">
        <h1 className="text-xl font-bold text-green-600 mb-2">Delegation Successful!</h1>
        <p className="text-gray-500 mb-4">Tx Hash: {shortenAddress(txHash || "")}</p>
        <Button onClick={onBack}>Done</Button>
      </div>
    );
  }

  if (step === "error") {
    return (
      <div className="p-4 text-center">
        <h1 className="text-xl font-bold text-red-600 mb-2">Failed</h1>
        <p className="mb-4">{error}</p>
        <Button onClick={() => setStep("overview")}>Try Again</Button>
      </div>
    );
  }

  return null;
};

const BackIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);