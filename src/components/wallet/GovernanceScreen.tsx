"use client";

import * as React from "react";
import { Card, Button, PinInput } from "@/components/ui";
import { useWalletStore, useTelegram } from "@/hooks";
import {
  getDRepInfo,
  DEFAULT_DREP_ID,
  DRepInfo,
  shortenAddress,
  createWalletFromMnemonic
} from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification, decryptWallet } from "@/lib/storage/encryption";

export interface GovernanceScreenProps {
  onBack: () => void;
}

type Step = "overview" | "search" | "confirm" | "pin" | "processing" | "success" | "error";

export const GovernanceScreen: React.FC<GovernanceScreenProps> = ({ onBack }) => {
  const { activeWalletId, network } = useWalletStore();
  const { initData } = useTelegram();

  const [step, setStep] = React.useState<Step>("overview");
  const [drepId, setDrepId] = React.useState("");
  const [selectedDRep, setSelectedDRep] = React.useState<DRepInfo | null>(null);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Load default DRep info
  React.useEffect(() => {
    if (step === "overview") {
      loadDefaultDRep();
    }
  }, [step]);

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
          name: "Default DRep",
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
          name: "Cardanesia DRep",
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
          name: "Cardanesia DRep",
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

        <Card padding="lg" className="mb-6">
          <h2 className="font-bold mb-2">Vote Delegation (DRep)</h2>
          <p className="text-sm text-gray-500 mb-4">
            Delegate your voting power to a DRep to participate in Cardano governance.
          </p>
          
          <div className="mb-4">
            <label className="text-sm font-medium mb-1 block">DRep ID</label>
            <div className="flex gap-2">
              <input 
                value={drepId}
                onChange={(e) => setDrepId(e.target.value)}
                placeholder="drep1..."
                className="flex-1 p-2 rounded border"
              />
              <Button onClick={() => handleSearch()} disabled={isLoading || !drepId}>Search</Button>
            </div>
          </div>

          {/* Default Option */}
          <div className="border-t pt-4">
            <p className="text-sm font-medium mb-2">Recommended DRep</p>
            <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg flex justify-between items-center">
              <div className="overflow-hidden">
                <p className="font-bold text-blue-600">
                  {selectedDRep && selectedDRep.drepId === DEFAULT_DREP_ID ? selectedDRep.name || "Cardanesia DRep" : "Cardanesia DRep"}
                </p>
                <p className="text-xs text-gray-500 font-mono truncate w-40">
                  {shortenAddress(DEFAULT_DREP_ID, 10)}
                </p>
              </div>
              <Button size="sm" onClick={() => {
                setDrepId(DEFAULT_DREP_ID);
                handleSearch(DEFAULT_DREP_ID); // Pass ID directly
              }}>Select</Button>
            </div>
          </div>
        </Card>
      </div>
    );
  }

  if (step === "confirm") {
    return (
      <div className="p-4">
        <h1 className="text-xl font-bold mb-4">Confirm Delegation</h1>
        <Card padding="lg">
          <p className="text-sm text-gray-500">You are delegating voting power to:</p>
          <p className="font-bold text-lg break-all my-2">{selectedDRep?.drepId}</p>
          <div className="flex gap-2 mt-6">
            <Button variant="outline" fullWidth onClick={() => setStep("overview")}>Cancel</Button>
            <Button fullWidth onClick={handleConfirm}>Confirm</Button>
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