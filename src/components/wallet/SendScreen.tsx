"use client";

import * as React from "react";
import { Card, Button, PinInput } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { shortenAddress, adaToLovelace, WalletAsset, isAdaHandle, resolveRecipient } from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification } from "@/lib/storage/encryption";
import { QRScanner } from "./QRScanner";

export interface SendScreenProps {
  onBack: () => void;
  onSuccess?: (txHash: string) => void;
}

type SendStep = "select-asset" | "input" | "confirm" | "pin" | "sending" | "success" | "error";

// Asset type for selection
interface SelectableAsset {
  type: "ada" | "token" | "nft";
  unit: string;
  name: string;
  ticker?: string;
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
  const [step, setStep] = React.useState<SendStep>("select-asset");
  const [selectedAsset, setSelectedAsset] = React.useState<SelectableAsset | null>(null);
  const [recipient, setRecipient] = React.useState("");
  const [resolvedRecipient, setResolvedRecipient] = React.useState<ResolvedRecipient | null>(null);
  const [isResolvingHandle, setIsResolvingHandle] = React.useState(false);
  const [handleError, setHandleError] = React.useState<string | null>(null);
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [estimatedFee, setEstimatedFee] = React.useState<string>("0.20");
  const [pin, setPin] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [showQRScanner, setShowQRScanner] = React.useState(false);

  // Decode hex asset name to readable string
  const decodeAssetName = (name: string): string => {
    if (!name) return "Unknown";
    // Check if it looks like hex (all characters are 0-9 or a-f)
    if (/^[0-9a-fA-F]+$/.test(name) && name.length > 8) {
      try {
        // Try to decode as hex
        const decoded = Buffer.from(name, "hex").toString("utf8");
        // Check if result is printable
        if (/^[\x20-\x7E]+$/.test(decoded)) {
          return decoded;
        }
      } catch {
        // If decode fails, return original
      }
    }
    return name;
  };

  // Build selectable assets list
  const selectableAssets = React.useMemo<SelectableAsset[]>(() => {
    const assets: SelectableAsset[] = [];
    
    // Add ADA as first option
    assets.push({
      type: "ada",
      unit: "lovelace",
      name: "Cardano",
      ticker: "ADA",
      quantity: balance?.ada || "0",
      decimals: 6,
    });
    
    // Add native assets
    if (balance?.assets) {
      balance.assets.forEach((asset: WalletAsset) => {
        // Determine if NFT (quantity = 1) or fungible token
        const isNFT = asset.quantity === "1";
        const displayName = asset.metadata?.name || 
                          asset.assetName || 
                          (asset.unit ? asset.unit.slice(56) : "Unknown Token");
        
        assets.push({
          type: isNFT ? "nft" : "token",
          unit: asset.unit,
          name: decodeAssetName(displayName),
          ticker: asset.metadata?.ticker,
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

  const availableAmount = React.useMemo(() => {
    if (!selectedAsset) return 0;
    return parseFloat(selectedAsset.quantity);
  }, [selectedAsset]);

  const amountNum = parseFloat(amount) || 0;
  const feeNum = parseFloat(estimatedFee) || 0.20;
  
  // For ADA, we need to subtract fee. For tokens, we need enough ADA for fee + UTxO
  const hasEnoughBalance = React.useMemo(() => {
    if (!selectedAsset) return false;
    
    if (selectedAsset.type === "ada") {
      const totalNeeded = amountNum + feeNum + 1; // Keep 1 ADA minimum
      return totalNeeded <= availableAmount;
    } else {
      // For tokens/NFTs, check if we have enough of the asset AND enough ADA for fee
      const adaBalance = parseFloat(balance?.ada || "0");
      const hasEnoughAsset = amountNum <= availableAmount;
      const hasEnoughAda = adaBalance >= (feeNum + 2); // Need ~2 ADA for UTxO + fee
      return hasEnoughAsset && hasEnoughAda;
    }
  }, [selectedAsset, amountNum, feeNum, availableAmount, balance?.ada]);

  // Validate Cardano address (basic Bech32 check) or ADA Handle
  const isValidAddress = React.useMemo(() => {
    // If we have a resolved recipient address, use that
    if (resolvedRecipient?.address) {
      const addr = resolvedRecipient.address;
      const isMainnet = addr.startsWith("addr1");
      const isTestnet = addr.startsWith("addr_test1");
      const isValid = (network === "mainnet" && isMainnet) || (network !== "mainnet" && isTestnet);
      return isValid && addr.length >= 50;
    }
    
    // Otherwise check if input is valid address
    if (!recipient) return false;
    
    // Check if it's an ADA Handle (will be resolved separately)
    if (isAdaHandle(recipient)) {
      return false; // Will be validated after resolution
    }
    
    const isMainnet = recipient.startsWith("addr1");
    const isTestnet = recipient.startsWith("addr_test1");
    const isValid = (network === "mainnet" && isMainnet) || (network !== "mainnet" && isTestnet);
    return isValid && recipient.length >= 50;
  }, [recipient, network, resolvedRecipient]);

  // Resolve ADA Handle when input changes
  React.useEffect(() => {
    const resolveHandle = async () => {
      // Reset resolved recipient when input changes
      setResolvedRecipient(null);
      setHandleError(null);
      
      if (!recipient) return;
      
      // Check if it's an ADA Handle
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
        } catch (err) {
          setHandleError("Failed to resolve ADA Handle");
        } finally {
          setIsResolvingHandle(false);
        }
      } else if (recipient.length >= 50) {
        // It's a regular address
        setResolvedRecipient({
          address: recipient,
          isHandle: false,
        });
      }
    };

    // Debounce the resolution
    const timer = setTimeout(resolveHandle, 500);
    return () => clearTimeout(timer);
  }, [recipient]);

  const canProceed = (isValidAddress || (resolvedRecipient?.address && !handleError)) && 
                     amountNum > 0 && 
                     hasEnoughBalance && 
                     !isResolvingHandle;

  const handleSelectAsset = (asset: SelectableAsset) => {
    setSelectedAsset(asset);
    setAmount(asset.type === "nft" ? "1" : "");
    setStep("input");
  };

  const handleSetMax = () => {
    if (!selectedAsset) return;
    
    if (selectedAsset.type === "ada") {
      const maxAmount = Math.max(0, availableAmount - feeNum - 1); // Keep 1 ADA minimum
      setAmount(maxAmount.toFixed(6));
    } else {
      // For tokens/NFTs, can send all
      setAmount(availableAmount.toString());
    }
  };

  const handleQRScan = (scannedAddress: string) => {
    setRecipient(scannedAddress);
    setShowQRScanner(false);
  };

  const handleContinue = () => {
    setError(null);
    if (!canProceed) {
      if (isResolvingHandle) {
        setError("Resolving ADA Handle...");
      } else if (handleError) {
        setError(handleError);
      } else if (!resolvedRecipient?.address && !isValidAddress) {
        setError("Invalid recipient address or ADA Handle");
      } else if (amountNum <= 0) {
        setError("Please enter an amount");
      } else if (!hasEnoughBalance) {
        setError("Insufficient balance");
      }
      return;
    }
    setStep("confirm");
  };

  const handleConfirm = () => {
    setPin("");
    setPinError(null);
    setStep("pin");
  };

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

  const handleSend = async () => {
    if (!selectedAsset) return;
    
    // Get the final recipient address (resolved from handle or direct address)
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

      let result;
      
      if (selectedAsset.type === "ada") {
        // Send ADA
        const { sendTransaction } = await import("@/lib/cardano");
        result = await sendTransaction(
          walletInstance,
          finalRecipient,
          adaToLovelace(amount)
        );
      } else {
        // Send native asset (token or NFT)
        const { sendAssetTransaction } = await import("@/lib/cardano");
        result = await sendAssetTransaction(
          walletInstance,
          finalRecipient,
          selectedAsset.unit,
          amount
        );
      }

      if (result.success && result.txHash) {
        setTxHash(result.txHash);
        setStep("success");
        onSuccess?.(result.txHash);
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

  const formatQuantity = (asset: SelectableAsset) => {
    if (asset.type === "ada") {
      return `${parseFloat(asset.quantity).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 6 })} ADA`;
    }
    if (asset.decimals > 0) {
      const value = parseFloat(asset.quantity) / Math.pow(10, asset.decimals);
      return value.toLocaleString(undefined, { maximumFractionDigits: asset.decimals });
    }
    return asset.quantity;
  };

  // =====================
  // STEP: Select Asset
  // =====================
  if (step === "select-asset") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Select Asset to Send
          </h1>
        </header>

        <div className="space-y-3">
          {selectableAssets.map((asset, index) => (
            <Card
              key={asset.unit + index}
              padding="md"
              className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              onClick={() => handleSelectAsset(asset)}
            >
              <div className="flex items-center gap-4">
                {/* Asset Icon */}
                <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                  asset.type === "ada" 
                    ? "bg-blue-100 dark:bg-blue-900/30" 
                    : asset.type === "nft"
                    ? "bg-purple-100 dark:bg-purple-900/30"
                    : "bg-green-100 dark:bg-green-900/30"
                }`}>
                  {asset.image ? (
                    <img 
                      src={asset.image} 
                      alt={asset.name} 
                      className="w-10 h-10 rounded-full object-cover"
                    />
                  ) : asset.type === "ada" ? (
                    <span className="text-2xl font-bold text-blue-600">₳</span>
                  ) : asset.type === "nft" ? (
                    <NFTIcon className="w-6 h-6 text-purple-600" />
                  ) : (
                    <TokenIcon className="w-6 h-6 text-green-600" />
                  )}
                </div>

                {/* Asset Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {asset.name}
                    </h3>
                    {asset.type === "nft" && (
                      <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300 rounded-full">
                        NFT
                      </span>
                    )}
                  </div>
                  {asset.ticker && asset.ticker !== asset.name && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {asset.ticker}
                    </p>
                  )}
                  {asset.policyId && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 font-mono truncate">
                      {asset.policyId.slice(0, 16)}...
                    </p>
                  )}
                </div>

                {/* Quantity */}
                <div className="text-right">
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {formatQuantity(asset)}
                  </p>
                  {asset.ticker && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {asset.ticker}
                    </p>
                  )}
                </div>

                {/* Arrow */}
                <ChevronRightIcon className="w-5 h-5 text-gray-400" />
              </div>
            </Card>
          ))}

          {selectableAssets.length === 1 && (
            <p className="text-center text-sm text-gray-500 dark:text-gray-400 mt-4">
              No native assets found in this wallet
            </p>
          )}
        </div>
      </div>
    );
  }

  // =====================
  // STEP: Input Amount & Recipient
  // =====================
  if (step === "input") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              setSelectedAsset(null);
              setAmount("");
              setStep("select-asset");
            }}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Send {selectedAsset?.ticker || selectedAsset?.name || "Asset"}
          </h1>
        </header>

        <Card padding="lg" className="space-y-6">
          {/* Selected Asset Info */}
          {selectedAsset && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 flex items-center gap-4">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                selectedAsset.type === "ada" 
                  ? "bg-blue-100 dark:bg-blue-900/30" 
                  : selectedAsset.type === "nft"
                  ? "bg-purple-100 dark:bg-purple-900/30"
                  : "bg-green-100 dark:bg-green-900/30"
              }`}>
                {selectedAsset.type === "ada" ? (
                  <span className="text-xl font-bold text-blue-600">₳</span>
                ) : selectedAsset.type === "nft" ? (
                  <NFTIcon className="w-5 h-5 text-purple-600" />
                ) : (
                  <TokenIcon className="w-5 h-5 text-green-600" />
                )}
              </div>
              <div className="flex-1">
                <p className="font-medium text-gray-900 dark:text-white">
                  {selectedAsset.name}
                </p>
                <p className="text-sm text-gray-500">
                  Balance: {formatQuantity(selectedAsset)}
                </p>
              </div>
              <button
                onClick={() => {
                  setSelectedAsset(null);
                  setStep("select-asset");
                }}
                className="text-sm text-blue-600 hover:text-blue-700"
              >
                Change
              </button>
            </div>
          )}

          {/* Recipient Address or ADA Handle */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
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
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            
            {/* Status messages */}
            {isResolvingHandle && (
              <p className="text-sm text-blue-500 mt-1 flex items-center gap-1">
                <span className="animate-spin">⏳</span> Resolving ADA Handle...
              </p>
            )}
            {handleError && (
              <p className="text-sm text-red-500 mt-1">
                {handleError}
              </p>
            )}
            {resolvedRecipient?.isHandle && resolvedRecipient.address && (
              <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-1">
                  <CheckIcon className="w-4 h-4" /> 
                  <span className="font-medium">{resolvedRecipient.handleName}</span> resolved
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">
                  {shortenAddress(resolvedRecipient.address, 12)}
                </p>
              </div>
            )}
            {recipient && !isAdaHandle(recipient) && !isValidAddress && !isResolvingHandle && (
              <p className="text-sm text-red-500 mt-1">
                Invalid {network === "mainnet" ? "mainnet" : "testnet"} address
              </p>
            )}
            {recipient && !isAdaHandle(recipient) && isValidAddress && (
              <p className="text-sm text-green-500 mt-1 flex items-center gap-1">
                <CheckIcon className="w-4 h-4" /> Valid address
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Amount {selectedAsset?.type === "nft" ? "" : `(${selectedAsset?.ticker || selectedAsset?.name})`}
              </label>
              <button
                onClick={handleSetMax}
                className="px-3 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 dark:bg-blue-900/30 dark:hover:bg-blue-900/50 rounded-full transition-colors"
              >
                MAX
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={selectedAsset?.type === "nft" ? "1" : "0"}
                step={selectedAsset?.decimals ? `0.${"0".repeat(selectedAsset.decimals - 1)}1` : "1"}
                min="0"
                max={availableAmount}
                disabled={selectedAsset?.type === "nft"}
                className="w-full px-4 py-3 pr-20 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-60"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                {selectedAsset?.ticker || (selectedAsset?.type === "nft" ? "NFT" : "")}
              </span>
            </div>
            {selectedAsset?.type === "nft" && (
              <p className="text-xs text-gray-500 mt-1">NFTs can only be sent as a whole unit</p>
            )}
          </div>

          {/* Fee Estimate */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Amount</span>
              <span className="text-gray-900 dark:text-white">
                {amountNum} {selectedAsset?.ticker || (selectedAsset?.type === "nft" ? "NFT" : "")}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Network Fee (est.)</span>
              <span className="text-gray-900 dark:text-white">~{estimatedFee} ADA</span>
            </div>
            {selectedAsset?.type !== "ada" && (
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Min UTxO</span>
                <span className="text-gray-900 dark:text-white">~1.5 ADA</span>
              </div>
            )}
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2">
              <div className="flex justify-between font-medium">
                <span className="text-gray-700 dark:text-gray-300">Total ADA needed</span>
                <span className={`${hasEnoughBalance ? "text-gray-900 dark:text-white" : "text-red-500"}`}>
                  ~{selectedAsset?.type === "ada" 
                    ? (amountNum + feeNum).toFixed(6) 
                    : (feeNum + 1.5).toFixed(2)} ADA
                </span>
              </div>
            </div>
            {!hasEnoughBalance && amountNum > 0 && (
              <p className="text-xs text-red-500">Insufficient balance</p>
            )}
          </div>

          {error && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
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
        </Card>

        {/* QR Scanner Modal */}
        <QRScanner
          isOpen={showQRScanner}
          onScan={handleQRScan}
          onClose={() => setShowQRScanner(false)}
        />
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
          <button
            onClick={() => setStep("input")}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Confirm Transaction
          </h1>
        </header>

        <Card padding="lg" className="space-y-6">
          <div className="text-center py-4">
            <p className="text-sm text-gray-500 mb-1">You are sending</p>
            <p className="text-4xl font-bold text-gray-900 dark:text-white">
              {selectedAsset?.type === "nft" ? "1" : amountNum}
            </p>
            <p className="text-xl text-gray-500">
              {selectedAsset?.ticker || selectedAsset?.name || (selectedAsset?.type === "nft" ? "NFT" : "Asset")}
            </p>
          </div>

          <div className="space-y-4">
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">From</p>
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                {shortenAddress(walletAddress || "", 12)}
              </p>
            </div>

            <div className="flex justify-center">
              <ArrowDownIcon className="w-6 h-6 text-gray-400" />
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4">
              <p className="text-xs text-gray-500 mb-1">To</p>
              {resolvedRecipient?.isHandle && (
                <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-1">
                  {resolvedRecipient.handleName}
                </p>
              )}
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                {resolvedRecipient?.address || recipient}
              </p>
            </div>
          </div>

          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-3">
            <div className="flex items-start gap-2">
              <WarningIcon className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-800 dark:text-yellow-200">
                Please verify the recipient address. Transactions cannot be reversed.
              </p>
            </div>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Asset</span>
              <span className="text-gray-900 dark:text-white">
                {selectedAsset?.name}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Amount</span>
              <span className="text-gray-900 dark:text-white">
                {amountNum} {selectedAsset?.ticker || ""}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Network Fee</span>
              <span className="text-gray-900 dark:text-white">~{estimatedFee} ADA</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="outline"
              fullWidth
              onClick={() => setStep("input")}
            >
              Cancel
            </Button>
            <Button
              variant="primary"
              fullWidth
              onClick={handleConfirm}
            >
              Confirm & Send
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // =====================
  // STEP: PIN Verification
  // =====================
  if (step === "pin") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              setPin("");
              setPinError(null);
              setStep("confirm");
            }}
            className="p-2 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg"
          >
            <BackIcon className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          </button>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white">
            Enter PIN
          </h1>
        </header>

        <Card padding="lg" className="space-y-6">
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <LockIcon className="w-8 h-8 text-blue-600" />
            </div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Verify Your Identity
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter your 6-digit PIN to authorize this transaction
            </p>
          </div>

          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Sending</span>
              <span className="text-gray-900 dark:text-white font-medium">
                {amountNum} {selectedAsset?.ticker || selectedAsset?.name}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">To</span>
              <span className="text-gray-900 dark:text-white font-mono text-xs">
                {shortenAddress(recipient, 8)}
              </span>
            </div>
          </div>

          <div className="flex justify-center">
            <PinInput
              length={6}
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
              error={pinError || undefined}
              autoFocus
              mask
            />
          </div>

          {pinError && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
              <p className="text-sm text-red-600 dark:text-red-400 text-center">{pinError}</p>
            </div>
          )}

          <p className="text-xs text-gray-400 text-center">
            Your PIN protects your wallet from unauthorized transactions
          </p>
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
        <Card padding="lg" className="text-center max-w-sm w-full">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-600 mx-auto mb-4" />
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Sending Transaction
          </h2>
          <p className="text-gray-500 dark:text-gray-400">
            Please wait while your transaction is being processed...
          </p>
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
        <Card padding="lg" className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckIcon className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Transaction Sent!
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            Your {selectedAsset?.name || "asset"} has been sent successfully.
          </p>
          
          {txHash && (
            <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-3 mb-6">
              <p className="text-xs text-gray-500 mb-1">Transaction Hash</p>
              <p className="text-xs font-mono text-gray-700 dark:text-gray-300 break-all">
                {txHash}
              </p>
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
        <Card padding="lg" className="text-center max-w-sm w-full">
          <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
            <XIcon className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">
            Transaction Failed
          </h2>
          <p className="text-gray-500 dark:text-gray-400 mb-4">
            {error || "Something went wrong. Please try again."}
          </p>

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

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
  </svg>
);

const LockIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
  </svg>
);

const QRCodeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v1m6 11h2m-6 0h-2v4m0-11v3m0 0h.01M12 12h4.01M16 20h4M4 12h4m12 0h.01M5 8h2a1 1 0 001-1V5a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1zm12 0h2a1 1 0 001-1V5a1 1 0 00-1-1h-2a1 1 0 00-1 1v2a1 1 0 001 1zM5 20h2a1 1 0 001-1v-2a1 1 0 00-1-1H5a1 1 0 00-1 1v2a1 1 0 001 1z" />
  </svg>
);

const ChevronRightIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
  </svg>
);

const TokenIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const NFTIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

SendScreen.displayName = "SendScreen";
