"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import { useWalletStore } from "@/hooks/useWalletStore";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Card } from "@/components/ui/Card";
import { PinInput } from "@/components/ui/PinInput";
import {
  sendMultiTransaction,
  sendMultiTransactionBatched,
  parseCSVToRecipients,
  validateRecipients,
  type MultiSendRecipient,
  type BatchSendResult,
} from "@/lib/cardano/multi-send";
import { isAdaHandle, resolveRecipient } from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification } from "@/lib/storage/encryption";

interface RecipientRow {
  id: string;
  address: string;
  amount: string;
  resolvedAddress?: string; // Resolved address for ADA Handle
  isHandle?: boolean; // Whether input is ADA Handle
  isResolving?: boolean; // Loading state while resolving
  resolveError?: string; // Error message if resolve failed
}

type SendMode = "same" | "different";

// Token info for selection
interface TokenOption {
  unit: string;
  name: string;
  ticker: string;
  decimals: number;
  balance: string;
  image?: string;
}

interface MultiSendScreenProps {
  onClose?: () => void;
}

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

export function MultiSendScreen({ onClose }: MultiSendScreenProps) {
  const { _walletInstance: wallet, balance, refreshBalance, activeWalletId } = useWalletStore();
  
  // Mode: same amount for all or different amounts
  const [mode, setMode] = useState<SendMode>("same");
  
  // Selected token to send
  const [selectedToken, setSelectedToken] = useState<string>("lovelace");
  const [showTokenSelector, setShowTokenSelector] = useState(false);
  
  // Global amount when mode is "same"
  const [globalAmount, setGlobalAmount] = useState("5");
  
  // Transaction note/memo
  const [memo, setMemo] = useState("");
  
  // List of recipients
  const [rows, setRows] = useState<RecipientRow[]>([
    { id: crypto.randomUUID(), address: "", amount: "" },
  ]);
  
  // UI State
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<number>(0);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [csvContent, setCsvContent] = useState("");
  
  // PIN verification state
  const [showPinInput, setShowPinInput] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  
  // Available tokens with fetched info
  const [availableTokens, setAvailableTokens] = useState<TokenOption[]>([]);
  const [isFetchingTokens, setIsFetchingTokens] = useState(false);
  
  // Handle resolution tracking
  const [isResolvingHandles, setIsResolvingHandles] = useState(false);

  // Fetch token info from API and build available tokens list
  useEffect(() => {
    const buildTokensList = async () => {
      const tokens: TokenOption[] = [
        {
          unit: "lovelace",
          name: "Cardano",
          ticker: "ADA",
          decimals: 6,
          balance: balance?.lovelace || "0",
          image: undefined,
        },
      ];

      // Add native tokens from balance with fetched info
      if (balance?.assets && balance.assets.length > 0) {
        setIsFetchingTokens(true);

        const tokenPromises = balance.assets.map(async (asset) => {
          // Skip NFTs (quantity = 1)
          const qty = BigInt(asset.quantity || "0");
          if (qty <= BigInt(1)) return null;

          // Fetch token info from API (includes decimals, name, ticker, logo)
          let decimals: number = asset.metadata?.decimals ?? 0;
          let fetchedName: string | null = null;
          let fetchedTicker: string | null = null;
          let fetchedLogo: string | null = null;

          try {
            const res = await fetch(`/api/dexhunter/token-info?unit=${asset.unit}`);
            const data = await res.json();
            console.log(`[MultiSend] token-info for ${asset.unit}:`, data);

            if (data.decimals !== undefined && data.decimals !== null) {
              decimals = Number(data.decimals);
            }
            if (data.name) {
              fetchedName = data.name;
            }
            if (data.ticker) {
              fetchedTicker = data.ticker;
            }
            if (data.logo) {
              fetchedLogo = data.logo;
            }
          } catch (e) {
            console.log(`[MultiSend] Failed to fetch token info for ${asset.unit}:`, e);
          }

          // Determine display name: fetched > metadata > decoded hex
          const assetNameHex = asset.assetName || (asset.unit ? asset.unit.slice(56) : "");
          const displayName = fetchedName || 
                              asset.metadata?.name || 
                              decodeAssetName(assetNameHex) ||
                              "Unknown Token";
          
          const displayTicker = fetchedTicker || 
                                asset.metadata?.ticker || 
                                displayName.slice(0, 6);

          return {
            unit: asset.unit,
            name: displayName,
            ticker: displayTicker,
            decimals: decimals,
            balance: asset.quantity,
            image: fetchedLogo || asset.metadata?.logo,
          } as TokenOption;
        });

        const tokenResults = await Promise.all(tokenPromises);
        const validTokens = tokenResults.filter((t): t is TokenOption => t !== null);
        tokens.push(...validTokens);
        setIsFetchingTokens(false);
      }

      setAvailableTokens(tokens);
    };

    buildTokensList();
  }, [balance]);

  // Get selected token info with default fallback
  const selectedTokenInfo: TokenOption = useMemo(() => {
    const found = availableTokens.find((t) => t.unit === selectedToken);
    if (found) return found;
    if (availableTokens.length > 0) return availableTokens[0];
    // Default fallback when tokens not yet loaded
    return {
      unit: "lovelace",
      name: "Cardano",
      ticker: "ADA",
      decimals: 6,
      balance: balance?.lovelace || "0",
    };
  }, [availableTokens, selectedToken, balance?.lovelace]);

  // Format balance display
  const formatTokenBalance = (balanceStr: string, decimals: number): string => {
    if (decimals === 0) return BigInt(balanceStr).toLocaleString();
    const num = Number(balanceStr) / Math.pow(10, decimals);
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  };

  // Add new recipient row
  const addRow = useCallback(() => {
    setRows((prev) => [
      ...prev,
      { id: crypto.randomUUID(), address: "", amount: "" },
    ]);
  }, []);

  // Remove recipient row
  const removeRow = useCallback((id: string) => {
    setRows((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  // Update recipient row with ADA Handle detection
  const updateRow = useCallback(
    (id: string, field: "address" | "amount", value: string) => {
      setRows((prev) =>
        prev.map((row) => {
          if (row.id !== id) return row;
          
          if (field === "address") {
            // Check if it's an ADA Handle
            const handle = isAdaHandle(value);
            return { 
              ...row, 
              address: value,
              isHandle: handle,
              resolvedAddress: handle ? undefined : value, // Clear resolved if handle, or set directly if address
              resolveError: undefined,
            };
          }
          return { ...row, [field]: value };
        })
      );
    },
    []
  );

  // Resolve ADA Handles for all rows
  const resolveAllHandles = useCallback(async () => {
    const rowsWithHandles = rows.filter(r => r.isHandle && r.address.trim() && !r.resolvedAddress);
    if (rowsWithHandles.length === 0) return;

    setIsResolvingHandles(true);
    
    // Mark rows as resolving
    setRows(prev => prev.map(row => 
      row.isHandle && row.address.trim() && !row.resolvedAddress 
        ? { ...row, isResolving: true } 
        : row
    ));

    // Resolve all handles in parallel
    const resolvePromises = rowsWithHandles.map(async (row) => {
      try {
        const result = await resolveRecipient(row.address.trim());
        return { id: row.id, resolvedAddress: result.address, error: result.address ? undefined : "Handle not found" };
      } catch {
        return { id: row.id, resolvedAddress: null, error: "Failed to resolve" };
      }
    });

    const results = await Promise.all(resolvePromises);
    
    // Update rows with resolved addresses
    setRows(prev => prev.map(row => {
      const result = results.find(r => r.id === row.id);
      if (result) {
        return {
          ...row,
          isResolving: false,
          resolvedAddress: result.resolvedAddress || undefined,
          resolveError: result.error,
        };
      }
      return row;
    }));

    setIsResolvingHandles(false);
  }, [rows]);

  // Auto-resolve handles when addresses change (debounced)
  useEffect(() => {
    const hasUnresolvedHandles = rows.some(r => r.isHandle && r.address.trim() && !r.resolvedAddress && !r.isResolving);
    if (hasUnresolvedHandles) {
      const timer = setTimeout(() => {
        resolveAllHandles();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [rows, resolveAllHandles]);

  // Import from CSV
  const handleCsvImport = useCallback(() => {
    if (!csvContent.trim()) {
      setError("CSV content is empty");
      return;
    }

    const decimals = selectedTokenInfo.decimals;
    const multiplier = Math.pow(10, decimals);
    const globalAmountRaw = mode === "same" 
      ? Math.floor(parseFloat(globalAmount) * multiplier).toString()
      : undefined;

    const recipients = parseCSVToRecipients(
      csvContent,
      selectedToken,
      globalAmountRaw
    );

    if (recipients.length === 0) {
      setError("No valid recipients found in CSV");
      return;
    }

    // Convert to rows format
    const newRows: RecipientRow[] = recipients.map((r) => ({
      id: crypto.randomUUID(),
      address: r.address,
      amount: (Number(r.assets[0]?.quantity || 0) / multiplier).toString(),
    }));

    setRows(newRows);
    setShowCsvImport(false);
    setCsvContent("");
    setError(null);
  }, [csvContent, mode, globalAmount, selectedToken, selectedTokenInfo.decimals]);

  // Build recipients list from UI state (using resolved addresses for handles)
  const buildRecipientList = useCallback((): MultiSendRecipient[] => {
    const decimals = selectedTokenInfo.decimals;
    const multiplier = Math.pow(10, decimals);

    return rows
      .filter((row) => {
        // Must have address input
        if (!row.address.trim()) return false;
        // If it's a handle, must be resolved
        if (row.isHandle && !row.resolvedAddress) return false;
        // In different mode, must have valid amount
        if (mode === "different") {
          const amt = parseFloat(row.amount);
          if (isNaN(amt) || amt <= 0) return false;
        }
        return true;
      })
      .map((row) => {
        const amount = mode === "same" 
          ? parseFloat(globalAmount) || 0
          : parseFloat(row.amount) || 0;
        const rawQuantity = Math.floor(amount * multiplier);
        
        // Use resolved address for handles, otherwise use direct address
        const finalAddress = row.isHandle ? row.resolvedAddress! : row.address.trim();

        return {
          address: finalAddress,
          assets: [{ unit: selectedToken, quantity: rawQuantity.toString() }],
        };
      });
  }, [rows, mode, globalAmount, selectedToken, selectedTokenInfo.decimals]);

  // Calculate total to send
  const totalToSend = useCallback(() => {
    const recipients = buildRecipientList();
    let total = BigInt(0);
    for (const r of recipients) {
      for (const a of r.assets) {
        // Ensure quantity is valid before converting to BigInt
        const qty = parseInt(a.quantity, 10);
        if (!isNaN(qty) && qty > 0) {
          total += BigInt(qty);
        }
      }
    }
    return total.toString();
  }, [buildRecipientList]);

  // Handle batch progress
  const handleBatchComplete = useCallback(
    (result: BatchSendResult, progressPct: number) => {
      setProgress(progressPct);
      if (result.success) {
        console.log(`Batch ${result.batchIndex + 1} complete: ${result.txHash}`);
      } else {
        console.error(`Batch ${result.batchIndex + 1} failed: ${result.error}`);
      }
    },
    []
  );

  // Reset form after successful transaction
  const resetForm = useCallback(() => {
    setRows([{ id: crypto.randomUUID(), address: "", amount: "" }]);
    setGlobalAmount("5");
    setMemo("");
    setCsvContent("");
    setShowCsvImport(false);
  }, []);

  // Request PIN before sending
  const handleRequestSend = useCallback(() => {
    if (!wallet) {
      setError("Wallet not connected");
      return;
    }

    setError(null);
    setSuccess(null);

    const recipients = buildRecipientList();

    // Validate
    const validationErrors = validateRecipients(recipients);
    if (validationErrors.length > 0) {
      setError(validationErrors.join(". "));
      return;
    }

    // Check balance
    const totalRaw = totalToSend();
    const availableRaw = selectedTokenInfo.balance;
    if (BigInt(totalRaw) > BigInt(availableRaw)) {
      const decimals = selectedTokenInfo.decimals;
      setError(
        `Insufficient balance. Need ${formatTokenBalance(totalRaw, decimals)} ${selectedTokenInfo.ticker} but only have ${formatTokenBalance(availableRaw, decimals)} ${selectedTokenInfo.ticker}`
      );
      return;
    }

    // Show PIN input
    setShowPinInput(true);
    setPin("");
    setPinError(null);
  }, [wallet, buildRecipientList, totalToSend, selectedTokenInfo]);

  // Verify PIN and send
  const handlePinComplete = useCallback(async (enteredPin: string) => {
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
      
      // PIN valid, proceed with send
      setShowPinInput(false);
      await handleSend();
    } catch (err) {
      console.error("PIN verification error:", err);
      setPinError("Verification failed. Please try again.");
      setPin("");
    }
  }, [activeWalletId]);

  // Send transaction (called after PIN verification)
  const handleSend = useCallback(async () => {
    setProgress(0);
    setIsLoading(true);

    const recipients = buildRecipientList();

    try {
      if (recipients.length <= 40) {
        const txHash = await sendMultiTransaction(wallet!, recipients);
        setSuccess(`✅ Transaction submitted!\nTx Hash: ${txHash}`);
      } else {
        const result = await sendMultiTransactionBatched(
          wallet!,
          recipients,
          handleBatchComplete
        );
        
        if (result.failedBatches === 0) {
          setSuccess(
            `✅ All ${result.totalBatches} batches completed successfully!\n` +
            `Sent to ${result.totalRecipients} recipients.`
          );
        } else {
          setError(
            `⚠️ ${result.successfulBatches}/${result.totalBatches} batches succeeded.\n` +
            `${result.failedBatches} batches failed.`
          );
        }
      }

      // Reset form after successful send
      resetForm();

      if (refreshBalance) {
        await refreshBalance();
      }
    } catch (err) {
      console.error("Multi-send error:", err);
      setError(err instanceof Error ? err.message : "Failed to send transaction");
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  }, [wallet, buildRecipientList, handleBatchComplete, refreshBalance, resetForm]);

  // Count valid recipients (address must be present, and if handle, must be resolved)
  const validRecipientCount = rows.filter((r) => {
    if (!r.address.trim()) return false;
    if (r.isHandle && !r.resolvedAddress) return false;
    // In different mode, check valid amount
    if (mode === "different") {
      const amt = parseFloat(r.amount);
      if (isNaN(amt) || amt <= 0) return false;
    }
    return true;
  }).length;
  
  // Count pending handle resolutions
  const pendingHandleCount = rows.filter(r => r.isHandle && r.address.trim() && !r.resolvedAddress && !r.resolveError).length;
  
  const estimatedBatches = Math.ceil(validRecipientCount / 40);

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-950">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
            >
              <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          )}
          <div>
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">Multi-Send</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">Send to multiple wallets in one transaction</p>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* Token Selector */}
        <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Select Token to Send
          </label>
          <button
            onClick={() => setShowTokenSelector(!showTokenSelector)}
            className="w-full flex items-center justify-between p-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              {selectedTokenInfo.unit === "lovelace" ? (
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                  <span className="text-xl font-bold text-blue-600">₳</span>
                </div>
              ) : selectedTokenInfo.image ? (
                <img src={selectedTokenInfo.image} alt="" className="w-10 h-10 rounded-full" />
              ) : (
                <div className="w-10 h-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                  <span className="text-sm font-bold text-green-600">{selectedTokenInfo.ticker.slice(0, 2)}</span>
                </div>
              )}
              <div className="text-left">
                <p className="font-medium text-gray-900 dark:text-white">{selectedTokenInfo.name}</p>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  Balance: {formatTokenBalance(selectedTokenInfo.balance, selectedTokenInfo.decimals)} {selectedTokenInfo.ticker}
                </p>
              </div>
            </div>
            <svg className={`w-5 h-5 text-gray-400 transition-transform ${showTokenSelector ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Token dropdown */}
          {showTokenSelector && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              {availableTokens.map((token) => (
                <button
                  key={token.unit}
                  onClick={() => {
                    setSelectedToken(token.unit);
                    setShowTokenSelector(false);
                    setGlobalAmount(token.unit === "lovelace" ? "5" : "100");
                  }}
                  className={`w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                    selectedToken === token.unit ? "bg-blue-50 dark:bg-blue-900/20" : ""
                  }`}
                >
                  {token.unit === "lovelace" ? (
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                      <span className="text-lg font-bold text-blue-600">₳</span>
                    </div>
                  ) : token.image ? (
                    <img src={token.image} alt="" className="w-8 h-8 rounded-full" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
                      <span className="text-xs font-bold text-green-600">{token.ticker.slice(0, 2)}</span>
                    </div>
                  )}
                  <div className="text-left flex-1">
                    <p className="font-medium text-gray-900 dark:text-white text-sm">{token.name}</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTokenBalance(token.balance, token.decimals)} {token.ticker}
                    </p>
                  </div>
                  {selectedToken === token.unit && (
                    <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  )}
                </button>
              ))}
            </div>
          )}
        </Card>

        {/* Mode Toggle */}
        <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Amount Mode</span>
            <div className="flex rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700">
              <button
                onClick={() => setMode("same")}
                className={`px-4 py-2 text-sm transition-colors ${
                  mode === "same"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Same Amount
              </button>
              <button
                onClick={() => setMode("different")}
                className={`px-4 py-2 text-sm transition-colors ${
                  mode === "different"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                }`}
              >
                Different Amounts
              </button>
            </div>
          </div>

          {/* Global Amount (only for "same" mode) */}
          {mode === "same" && (
            <div>
              <label className="block text-sm text-gray-500 dark:text-gray-400 mb-1">
                Amount per wallet ({selectedTokenInfo.ticker})
              </label>
              <Input
                type="number"
                value={globalAmount}
                onChange={(e) => setGlobalAmount(e.target.value)}
                placeholder={selectedToken === "lovelace" ? "5" : "100"}
                min="0"
                step={selectedTokenInfo.decimals > 0 ? "0.1" : "1"}
              />
            </div>
          )}
        </Card>

        {/* Recipients List */}
        <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Recipients ({validRecipientCount})
            </span>
            <button
              onClick={() => setShowCsvImport(!showCsvImport)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
            >
              {showCsvImport ? "Hide CSV" : "Import CSV"}
            </button>
          </div>

          {/* CSV Import Section */}
          {showCsvImport && (
            <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                Format: address or $handle,amount (one per line). Amount in {selectedTokenInfo.ticker}.
                {mode === "same" && " Amount column is ignored in Same Amount mode."}
              </p>
              <textarea
                value={csvContent}
                onChange={(e) => setCsvContent(e.target.value)}
                placeholder={`addr1q...,10\n$handle,5.5\naddr1q...,20`}
                className="w-full h-32 p-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded text-sm font-mono resize-none text-gray-900 dark:text-white"
              />
              <Button
                onClick={handleCsvImport}
                variant="secondary"
                className="mt-2 w-full"
              >
                Import
              </Button>
            </div>
          )}

          {/* Recipient Rows with ADA Handle Support */}
          <div className="space-y-2 max-h-64 overflow-y-auto">
            {rows.map((row, index) => (
              <div key={row.id} className="space-y-1">
                <div className="flex gap-2 items-center">
                  <span className="text-xs text-gray-400 dark:text-gray-500 w-6 shrink-0">{index + 1}.</span>
                  <div className="flex-1 min-w-0 relative">
                    <Input
                      value={row.address}
                      onChange={(e) => updateRow(row.id, "address", e.target.value)}
                      placeholder="addr1... or $handle"
                      className={`text-sm pr-8 w-full ${
                        row.isHandle && row.resolvedAddress ? "border-green-500 dark:border-green-600" : 
                        row.resolveError ? "border-red-500 dark:border-red-600" : ""
                      }`}
                    />
                    {/* Handle status indicator */}
                    {row.isHandle && (
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        {row.isResolving ? (
                          <svg className="w-4 h-4 animate-spin text-blue-500" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                          </svg>
                        ) : row.resolvedAddress ? (
                          <svg className="w-4 h-4 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd"/>
                          </svg>
                        ) : row.resolveError ? (
                          <svg className="w-4 h-4 text-red-500" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd"/>
                          </svg>
                        ) : null}
                      </div>
                    )}
                  </div>
                  {mode === "different" && (
                    <Input
                      type="number"
                      value={row.amount}
                      onChange={(e) => updateRow(row.id, "amount", e.target.value)}
                      placeholder={selectedTokenInfo.ticker}
                      className="w-20 shrink-0 text-sm"
                      min="0"
                      step={selectedTokenInfo.decimals > 0 ? "0.1" : "1"}
                    />
                  )}
                  <button
                    onClick={() => removeRow(row.id)}
                    className="p-2 shrink-0 text-red-500 dark:text-red-400 hover:text-red-600 dark:hover:text-red-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
                    disabled={rows.length <= 1}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                {/* Show resolved address for handles */}
                {row.isHandle && row.resolvedAddress && (
                  <p className="text-xs text-green-600 dark:text-green-400 ml-6 truncate">
                    → {row.resolvedAddress.slice(0, 20)}...{row.resolvedAddress.slice(-10)}
                  </p>
                )}
                {row.resolveError && (
                  <p className="text-xs text-red-500 dark:text-red-400 ml-6">
                    ⚠️ {row.resolveError}
                  </p>
                )}
              </div>
            ))}
          </div>

          <Button
            onClick={addRow}
            variant="secondary"
            className="mt-3 w-full"
          >
            + Add Recipient
          </Button>
        </Card>

        {/* Summary */}
        <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Summary</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Token</span>
              <span className="text-gray-900 dark:text-white font-medium">{selectedTokenInfo.name} ({selectedTokenInfo.ticker})</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Recipients</span>
              <span className="text-gray-900 dark:text-white">{validRecipientCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Total Amount</span>
              <span className="font-medium text-gray-900 dark:text-white">
                {formatTokenBalance(totalToSend(), selectedTokenInfo.decimals)} {selectedTokenInfo.ticker}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Transactions needed</span>
              <span className="text-gray-900 dark:text-white">{estimatedBatches}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Your Balance</span>
              <span className="text-gray-900 dark:text-white">
                {formatTokenBalance(selectedTokenInfo.balance, selectedTokenInfo.decimals)} {selectedTokenInfo.ticker}
              </span>
            </div>
          </div>
          
          {estimatedBatches > 1 && (
            <p className="mt-3 text-xs text-yellow-600 dark:text-yellow-400">
              ⚠️ This will require {estimatedBatches} separate transactions due to the number of recipients.
              You&apos;ll need to sign each batch.
            </p>
          )}
        </Card>

        {/* Transaction Note/Memo */}
        <Card className="p-4 bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-800">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2 block">
            Note / Memo (Optional)
          </label>
          <textarea
            value={memo}
            onChange={(e) => setMemo(e.target.value.slice(0, 256))}
            placeholder="Add a note for this bulk transaction (e.g., Airdrop, Rewards distribution, etc.)"
            rows={2}
            maxLength={256}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 text-gray-900 dark:text-white text-sm resize-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 text-right">{memo.length}/256</p>
        </Card>

        {/* Error/Success Messages */}
        {error && (
          <div className="p-3 bg-red-50 dark:bg-red-900/30 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-600 dark:text-red-300 whitespace-pre-line">
            {error}
          </div>
        )}
        {success && (
          <div className="p-3 bg-green-50 dark:bg-green-900/30 border border-green-200 dark:border-green-800 rounded-lg text-sm text-green-600 dark:text-green-300 whitespace-pre-line">
            {success}
          </div>
        )}

        {/* Progress Bar */}
        {isLoading && progress > 0 && (
          <div className="w-full bg-gray-200 dark:bg-gray-800 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        {pendingHandleCount > 0 && (
          <p className="text-xs text-yellow-600 dark:text-yellow-400 mb-2 text-center">
            ⏳ Resolving {pendingHandleCount} ADA Handle{pendingHandleCount > 1 ? "s" : ""}...
          </p>
        )}
        <Button
          onClick={handleRequestSend}
          disabled={isLoading || validRecipientCount === 0 || pendingHandleCount > 0 || isResolvingHandles}
          className="w-full"
          variant="primary"
        >
          {isLoading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Sending... {progress > 0 && `(${Math.round(progress)}%)`}
            </span>
          ) : isResolvingHandles ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="animate-spin w-5 h-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              Resolving handles...
            </span>
          ) : (
            `Send ${selectedTokenInfo.ticker} to ${validRecipientCount} Recipients 🚀`
          )}
        </Button>
      </div>

      {/* PIN Input Modal */}
      {showPinInput && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm p-6 bg-white dark:bg-gray-900">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 text-center">
              Enter PIN to Confirm
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mb-4 text-center">
              Sending {selectedTokenInfo.ticker} to {validRecipientCount} recipients
            </p>
            
            <PinInput
              length={6}
              value={pin}
              onChange={setPin}
              onComplete={handlePinComplete}
              error={pinError || undefined}
              autoFocus
            />
            
            {pinError && (
              <p className="text-sm text-red-500 text-center mt-2">{pinError}</p>
            )}
            
            <div className="flex gap-3 mt-4">
              <Button
                variant="secondary"
                onClick={() => {
                  setShowPinInput(false);
                  setPin("");
                  setPinError(null);
                }}
                className="flex-1"
              >
                Cancel
              </Button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

export default MultiSendScreen;
