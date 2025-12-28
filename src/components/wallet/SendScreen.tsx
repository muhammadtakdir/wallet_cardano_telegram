"use client";

import * as React from "react";
import { Card, Button, PinInput } from "@/components/ui";
import { useWalletStore, useTelegram } from "@/hooks";
import { 
  shortenAddress, 
  adaToLovelace, 
  WalletAsset, 
  isAdaHandle, 
  resolveRecipient,
  type MultiAssetOutput 
} from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification } from "@/lib/storage/encryption";
import { QRScanner } from "./QRScanner";

export interface SendScreenProps {
  onBack: () => void;
  onSuccess?: (txHash: string) => void;
}

type SendStep = "input" | "add-asset" | "confirm" | "pin" | "sending" | "success" | "error";

// Asset to send with amount
interface AssetToSend {
  unit: string;
  name: string;
  ticker?: string;
  type: "ada" | "token" | "nft";
  amount: string;
  maxAmount: string;
  decimals: number;
  image?: string;
}

// Available asset for selection
interface AvailableAsset {
  unit: string;
  name: string;
  ticker?: string;
  type: "ada" | "token" | "nft";
  quantity: string;
  decimals: number;
  image?: string;
  policyId?: string;
  assetName?: string;
}

// Resolved recipient info
interface ResolvedRecipient {
  address: string;
  isHandle: boolean;
  handleName?: string;
}

export const SendScreen: React.FC<SendScreenProps> = ({ onBack, onSuccess }) => {
  const { walletAddress, balance, network, activeWalletId } = useWalletStore();
  const { initData } = useTelegram();
  
  // State
  const [step, setStep] = React.useState<SendStep>("input");
  const [assetsToSend, setAssetsToSend] = React.useState<AssetToSend[]>([]);
  const [recipient, setRecipient] = React.useState("");
  const [resolvedRecipient, setResolvedRecipient] = React.useState<ResolvedRecipient | null>(null);
  const [isResolvingHandle, setIsResolvingHandle] = React.useState(false);
  const [handleError, setHandleError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [estimatedFee] = React.useState<string>("0.20");
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = React.useState(false);

  // Decode hex asset name to readable string
  const decodeAssetName = (name: string): string => {
    if (!name) return "Unknown";
    if (/^[0-9a-fA-F]+$/.test(name) && name.length > 8) {
      try {
        const decoded = Buffer.from(name, "hex").toString("utf8");
        if (/^[\x20-\x7E]+$/.test(decoded)) {
          return decoded;
        }
      } catch {
        // If decode fails, return original
      }
    }
    return name;
  };

  // Build available assets list
  const availableAssets = React.useMemo<AvailableAsset[]>(() => {
    const assets: AvailableAsset[] = [];
    
    // Add ADA
    assets.push({
      unit: "lovelace",
      name: "Cardano",
      ticker: "ADA",
      type: "ada",
      quantity: balance?.ada || "0",
      decimals: 6,
    });
    
    // Add native assets
    if (balance?.assets) {
      balance.assets.forEach((asset: WalletAsset) => {
        const isNFT = asset.quantity === "1";
        const displayName = asset.metadata?.name || 
                          asset.assetName || 
                          (asset.unit ? asset.unit.slice(56) : "Unknown Token");
        
        assets.push({
          unit: asset.unit,
          name: decodeAssetName(displayName),
          ticker: asset.metadata?.ticker,
          type: isNFT ? "nft" : "token",
          quantity: asset.quantity,
          decimals: asset.metadata?.decimals || 0,
          image: asset.metadata?.logo,
          policyId: asset.policyId || (asset.unit ? asset.unit.slice(0, 56) : undefined),
          assetName: asset.assetName || (asset.unit ? asset.unit.slice(56) : undefined),
        });
      });
    }
    
    return assets;
  }, [balance]);

  // Get assets not yet added
  const assetsNotAdded = React.useMemo(() => {
    const addedUnits = new Set(assetsToSend.map(a => a.unit));
    return availableAssets.filter(a => !addedUnits.has(a.unit));
  }, [availableAssets, assetsToSend]);

  // Initialize with ADA
  React.useEffect(() => {
    if (assetsToSend.length === 0 && availableAssets.length > 0) {
      const ada = availableAssets.find(a => a.unit === "lovelace");
      if (ada) {
        setAssetsToSend([{
          unit: "lovelace",
          name: "Cardano",
          ticker: "ADA",
          type: "ada",
          amount: "",
          maxAmount: ada.quantity,
          decimals: 6,
        }]);
      }
    }
  }, [availableAssets, assetsToSend.length]);

  // Validate address
  const isValidAddress = React.useMemo(() => {
    if (resolvedRecipient?.address) {
      const addr = resolvedRecipient.address;
      const isMainnet = addr.startsWith("addr1");
      const isTestnet = addr.startsWith("addr_test1");
      return (network === "mainnet" && isMainnet) || (network !== "mainnet" && isTestnet);
    }
    if (!recipient) return false;
    if (isAdaHandle(recipient)) return false;
    const isMainnet = recipient.startsWith("addr1");
    const isTestnet = recipient.startsWith("addr_test1");
    return (network === "mainnet" && isMainnet) || (network !== "mainnet" && isTestnet);
  }, [recipient, network, resolvedRecipient]);

  // Resolve ADA Handle
  React.useEffect(() => {
    const resolveHandle = async () => {
      setResolvedRecipient(null);
      setHandleError(null);
      if (!recipient) return;
      
      if (isAdaHandle(recipient)) {
        setIsResolvingHandle(true);
        try {
          const result = await resolveRecipient(recipient);
          if (result.address) {
            setResolvedRecipient({
              address: result.address,
              isHandle: result.isHandle,
              handleName: result.handleName,
            });
          } else {
            setHandleError(`ADA Handle "${recipient}" not found`);
          }
        } catch {
          setHandleError("Failed to resolve ADA Handle");
        } finally {
          setIsResolvingHandle(false);
        }
      } else if (recipient.length >= 50) {
        setResolvedRecipient({ address: recipient, isHandle: false });
      }
    };

    const timer = setTimeout(resolveHandle, 500);
    return () => clearTimeout(timer);
  }, [recipient]);

  // Calculate if can proceed
  const canProceed = React.useMemo(() => {
    const hasValidRecipient = isValidAddress || (resolvedRecipient?.address && !handleError);
    const hasAssets = assetsToSend.some(a => parseFloat(a.amount) > 0);
    return hasValidRecipient && hasAssets && !isResolvingHandle;
  }, [isValidAddress, resolvedRecipient, handleError, assetsToSend, isResolvingHandle]);

  // Update asset amount
  const updateAssetAmount = (unit: string, amount: string) => {
    setAssetsToSend(prev => prev.map(a => 
      a.unit === unit ? { ...a, amount } : a
    ));
  };

  // Set max for asset
  const setMaxAmount = (unit: string) => {
    const asset = assetsToSend.find(a => a.unit === unit);
    if (!asset) return;
    
    if (unit === "lovelace") {
      const max = Math.max(0, parseFloat(asset.maxAmount) - parseFloat(estimatedFee) - 1);
      updateAssetAmount(unit, max.toFixed(6));
    } else {
      updateAssetAmount(unit, asset.maxAmount);
    }
  };

  // Add asset to send
  const addAsset = (asset: AvailableAsset) => {
    setAssetsToSend(prev => [...prev, {
      unit: asset.unit,
      name: asset.name,
      ticker: asset.ticker,
      type: asset.type,
      amount: asset.type === "nft" ? "1" : "",
      maxAmount: asset.quantity,
      decimals: asset.decimals,
      image: asset.image,
    }]);
    setStep("input");
  };

  // Remove asset from send list
  const removeAsset = (unit: string) => {
    if (unit === "lovelace") return; // Cannot remove ADA
    setAssetsToSend(prev => prev.filter(a => a.unit !== unit));
  };

  // Handle QR scan
  const handleQRScan = (scannedAddress: string) => {
    setRecipient(scannedAddress);
    setShowQRScanner(false);
  };

  // Continue to confirmation
  const handleContinue = () => {
    setError(null);
    if (!canProceed) {
      if (isResolvingHandle) {
        setError("Resolving ADA Handle...");
      } else if (handleError) {
        setError(handleError);
      } else if (!resolvedRecipient?.address && !isValidAddress) {
        setError("Invalid recipient address or ADA Handle");
      } else if (!assetsToSend.some(a => parseFloat(a.amount) > 0)) {
        setError("Please enter an amount");
      }
      return;
    }
    setStep("confirm");
  };

  // Confirm and go to PIN
  const handleConfirm = () => {
    setPin("");
    setPinError(null);
    setStep("pin");
  };

  // Verify PIN and send
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
      await handleSend();
    } catch (err) {
      console.error("PIN verification error:", err);
      setPinError("Verification failed. Please try again.");
      setPin("");
    }
  };

  // Send transaction
  const handleSend = async () => {
    const finalRecipient = resolvedRecipient?.address || recipient;
    if (!finalRecipient) {
      setError("No valid recipient address");
      setStep("error");
      return;
    }

    setStep("sending");
    setIsLoading(true);
    setError(null);

    try {
      const walletInstance = useWalletStore.getState()._walletInstance;
      if (!walletInstance) {
        throw new Error("Wallet not initialized");
      }

      // Build outputs
      const outputs: MultiAssetOutput[] = [];
      
      for (const asset of assetsToSend) {
        const amount = parseFloat(asset.amount);
        if (amount > 0) {
          if (asset.unit === "lovelace") {
            outputs.push({
              unit: "lovelace",
              quantity: adaToLovelace(asset.amount),
            });
          } else {
            outputs.push({
              unit: asset.unit,
              quantity: asset.amount,
            });
          }
        }
      }

      if (outputs.length === 0) {
        throw new Error("No assets to send");
      }

      // Use multi-asset transaction
      const { sendMultiAssetTransaction } = await import("@/lib/cardano");
      const result = await sendMultiAssetTransaction(walletInstance, finalRecipient, outputs);

      if (result.success && result.txHash) {
        setTxHash(result.txHash);
        setStep("success");
        onSuccess?.(result.txHash);

        // Award points
        if (initData) {
          fetch('/api/user/add-points', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ initData, actionType: 'send' }),
          }).catch(console.warn);
        }
      } else {
        throw new Error(result.error || "Transaction failed");
      }
    } catch (err) {
      console.error("Send transaction error:", err);
      setError(err instanceof Error ? err.message : "Transaction failed");
      setStep("error");
    } finally {
      setIsLoading(false);
    }
  };

  // Format quantity display
  const formatQuantity = (amount: string, decimals: number, ticker?: string) => {
    const num = parseFloat(amount);
    if (decimals > 0) {
      return `${num.toLocaleString(undefined, { maximumFractionDigits: decimals })} ${ticker || ""}`;
    }
    return `${num.toLocaleString()} ${ticker || ""}`;
  };

  // =====================
  // STEP: Input
  // =====================
  if (step === "input") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Send Assets</h1>
        </header>

        <div className="space-y-4">
          {/* Recipient */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Recipient Address or ADA Handle
              </label>
              <button
                onClick={() => setShowQRScanner(true)}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-medium"
              >
                <QRCodeIcon className="w-4 h-4" />
                Scan QR
              </button>
            </div>
            <textarea
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder={network === "mainnet" ? "addr1... or $handle" : "addr_test1... or $handle"}
              rows={2}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500"
            />
            
            {/* Status messages */}
            {isResolvingHandle && (
              <p className="text-sm text-blue-500 mt-2 flex items-center gap-1">
                <span className="animate-spin">⏳</span> Resolving ADA Handle...
              </p>
            )}
            {handleError && <p className="text-sm text-red-500 mt-2">{handleError}</p>}
            {resolvedRecipient?.isHandle && resolvedRecipient.address && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckIcon className="w-4 h-4" />
                  <span className="font-medium">{resolvedRecipient.handleName}</span> resolved
                </p>
                <p className="text-xs text-gray-500 font-mono mt-1">
                  {shortenAddress(resolvedRecipient.address, 12)}
                </p>
              </div>
            )}
            {recipient && !isAdaHandle(recipient) && isValidAddress && (
              <p className="text-sm text-green-500 mt-2 flex items-center gap-1">
                <CheckIcon className="w-4 h-4" /> Valid address
              </p>
            )}
          </Card>

          {/* Assets to Send */}
          <Card padding="lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-900 dark:text-white">Assets to Send</h3>
              {assetsNotAdded.length > 0 && (
                <button
                  onClick={() => setStep("add-asset")}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium"
                >
                  <PlusIcon className="w-4 h-4" />
                  Add Asset
                </button>
              )}
            </div>

            <div className="space-y-4">
              {assetsToSend.map((asset) => (
                <div key={asset.unit} className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        asset.type === "ada" 
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : asset.type === "nft"
                          ? "bg-purple-100 dark:bg-purple-900/30"
                          : "bg-green-100 dark:bg-green-900/30"
                      }`}>
                        {asset.type === "ada" ? (
                          <span className="text-xl font-bold text-blue-600">₳</span>
                        ) : asset.type === "nft" ? (
                          <NFTIcon className="w-5 h-5 text-purple-600" />
                        ) : (
                          <TokenIcon className="w-5 h-5 text-green-600" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{asset.name}</p>
                        <p className="text-xs text-gray-500">
                          Balance: {formatQuantity(asset.maxAmount, asset.decimals, asset.ticker)}
                        </p>
                      </div>
                    </div>
                    {asset.unit !== "lovelace" && (
                      <button
                        onClick={() => removeAsset(asset.unit)}
                        className="p-1 text-gray-400 hover:text-red-500"
                      >
                        <XIcon className="w-5 h-5" />
                      </button>
                    )}
                  </div>

                  {asset.type === "nft" ? (
                    <div className="text-center py-2 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <p className="text-sm text-purple-600 dark:text-purple-400">1 NFT (whole unit)</p>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={asset.amount}
                        onChange={(e) => updateAssetAmount(asset.unit, e.target.value)}
                        placeholder="0.00"
                        className="flex-1 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                      />
                      <button
                        onClick={() => setMaxAmount(asset.unit)}
                        className="px-3 py-2 text-sm font-medium text-blue-600 bg-blue-50 dark:bg-blue-900/30 rounded-lg hover:bg-blue-100"
                      >
                        MAX
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          {/* Fee Info */}
          <Card padding="md">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Estimated Fee</span>
              <span className="text-gray-900 dark:text-white">~{estimatedFee} ADA</span>
            </div>
          </Card>

          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}

          <Button
            variant="primary"
            fullWidth
            size="lg"
            onClick={handleContinue}
            disabled={!canProceed}
          >
            Continue
          </Button>
        </div>

        <QRScanner isOpen={showQRScanner} onScan={handleQRScan} onClose={() => setShowQRScanner(false)} />
      </div>
    );
  }

  // =====================
  // STEP: Add Asset
  // =====================
  if (step === "add-asset") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={() => setStep("input")} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Add Asset to Send</h1>
        </header>

        <div className="space-y-3">
          {assetsNotAdded.length === 0 ? (
            <Card padding="lg" className="text-center">
              <p className="text-gray-500">All available assets have been added</p>
            </Card>
          ) : (
            assetsNotAdded.map((asset) => (
              <Card
                key={asset.unit}
                padding="md"
                className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800"
                onClick={() => addAsset(asset)}
              >
                <div className="flex items-center gap-4">
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    asset.type === "ada"
                      ? "bg-blue-100 dark:bg-blue-900/30"
                      : asset.type === "nft"
                      ? "bg-purple-100 dark:bg-purple-900/30"
                      : "bg-green-100 dark:bg-green-900/30"
                  }`}>
                    {asset.type === "ada" ? (
                      <span className="text-2xl font-bold text-blue-600">₳</span>
                    ) : asset.type === "nft" ? (
                      <NFTIcon className="w-6 h-6 text-purple-600" />
                    ) : (
                      <TokenIcon className="w-6 h-6 text-green-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium text-gray-900 dark:text-white">{asset.name}</p>
                    <p className="text-sm text-gray-500">
                      {formatQuantity(asset.quantity, asset.decimals, asset.ticker)}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    asset.type === "nft"
                      ? "bg-purple-100 text-purple-600"
                      : asset.type === "token"
                      ? "bg-green-100 text-green-600"
                      : "bg-blue-100 text-blue-600"
                  }`}>
                    {asset.type.toUpperCase()}
                  </span>
                </div>
              </Card>
            ))
          )}
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
          <button onClick={() => setStep("input")} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg">
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">Confirm Transaction</h1>
        </header>

        <Card padding="lg" className="space-y-6">
          {/* Assets Summary */}
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-2">You are sending</p>
            <div className="space-y-1">
              {assetsToSend.filter(a => parseFloat(a.amount) > 0).map((asset) => (
                <p key={asset.unit} className="text-xl font-bold text-gray-900 dark:text-white">
                  {asset.amount} {asset.ticker || asset.name}
                </p>
              ))}
            </div>
          </div>

          {/* From / To */}
          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">From</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white">
                {shortenAddress(walletAddress || "", 12)}
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDownIcon className="w-6 h-6 text-gray-400" />
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">To</p>
              {resolvedRecipient?.isHandle && (
                <p className="text-sm font-medium text-blue-600 mb-1">{resolvedRecipient.handleName}</p>
              )}
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                {resolvedRecipient?.address || recipient}
              </p>
            </div>
          </div>

          {/* Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <WarningIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Please verify all details. Transactions cannot be reversed.
              </p>
            </div>
          </div>

          {/* Fee */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Network Fee</span>
              <span className="text-gray-900 dark:text-white">~{estimatedFee} ADA</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button variant="outline" fullWidth onClick={() => setStep("input")}>
              Edit
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
          <p className="text-gray-600 dark:text-gray-400 mb-6">Enter your PIN to confirm the transaction</p>
          <PinInput value={pin} onChange={setPin} onComplete={handlePinComplete} error={pinError || undefined} autoFocus />
        </Card>
      </div>
    );
  }

  // =====================
  // STEP: Sending
  // =====================
  if (step === "sending") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4 flex items-center justify-center">
        <Card padding="lg" className="text-center w-full max-w-sm">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-6" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Sending Transaction</h2>
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
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Transaction Sent!</h2>
          <p className="text-gray-500 mb-4">Your transaction has been submitted to the network.</p>
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
            <Button variant="primary" fullWidth onClick={() => setStep("input")}>
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

const PlusIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
  </svg>
);

const QRCodeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h2M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  </svg>
);

const NFTIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

const TokenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ArrowDownIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
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

SendScreen.displayName = "SendScreen";
