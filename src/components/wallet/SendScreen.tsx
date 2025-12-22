"use client";

import * as React from "react";
import { Card, Button, Input } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { shortenAddress, lovelaceToAda, adaToLovelace } from "@/lib/cardano";

export interface SendScreenProps {
  onBack: () => void;
  onSuccess?: (txHash: string) => void;
}

type SendStep = "input" | "confirm" | "sending" | "success" | "error";

export const SendScreen: React.FC<SendScreenProps> = ({ onBack, onSuccess }) => {
  const { walletAddress, balance, network } = useWalletStore();
  const [step, setStep] = React.useState<SendStep>("input");
  const [recipient, setRecipient] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [estimatedFee, setEstimatedFee] = React.useState<string>("~0.17");

  const availableAda = React.useMemo(() => {
    if (!balance?.ada) return 0;
    return parseFloat(balance.ada);
  }, [balance]);

  const amountNum = parseFloat(amount) || 0;
  const feeNum = parseFloat(estimatedFee) || 0.17;
  const totalAmount = amountNum + feeNum;
  const hasEnoughBalance = totalAmount <= availableAda;

  // Validate Cardano address (basic Bech32 check)
  const isValidAddress = React.useMemo(() => {
    if (!recipient) return false;
    // Mainnet addresses start with addr1, testnet with addr_test1
    const isMainnet = recipient.startsWith("addr1");
    const isTestnet = recipient.startsWith("addr_test1");
    const isValid = (network === "mainnet" && isMainnet) || (network !== "mainnet" && isTestnet);
    return isValid && recipient.length >= 50;
  }, [recipient, network]);

  const canProceed = isValidAddress && amountNum > 0 && hasEnoughBalance;

  const handleSetMax = () => {
    const maxAmount = Math.max(0, availableAda - feeNum - 1); // Keep 1 ADA minimum
    setAmount(maxAmount.toFixed(6));
  };

  const handleContinue = () => {
    setError(null);
    if (!canProceed) {
      if (!isValidAddress) {
        setError("Invalid recipient address");
      } else if (amountNum <= 0) {
        setError("Please enter an amount");
      } else if (!hasEnoughBalance) {
        setError("Insufficient balance");
      }
      return;
    }
    setStep("confirm");
  };

  const handleSend = async () => {
    setStep("sending");
    setIsLoading(true);
    setError(null);

    try {
      // Import sendTransaction from cardano lib
      const { sendTransaction } = await import("@/lib/cardano");
      const walletInstance = useWalletStore.getState()._walletInstance;
      
      if (!walletInstance) {
        throw new Error("Wallet not initialized");
      }

      const result = await sendTransaction(
        walletInstance,
        recipient,
        adaToLovelace(amount)
      );

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

  // Input Step
  if (step === "input") {
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
            Send ADA
          </h1>
        </header>

        <Card padding="lg" className="space-y-6">
          {/* Recipient Address */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Recipient Address
            </label>
            <textarea
              value={recipient}
              onChange={(e) => setRecipient(e.target.value.trim())}
              placeholder={network === "mainnet" ? "addr1..." : "addr_test1..."}
              rows={3}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm font-mono resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            {recipient && !isValidAddress && (
              <p className="text-sm text-red-500 mt-1">
                Invalid {network === "mainnet" ? "mainnet" : "testnet"} address
              </p>
            )}
            {recipient && isValidAddress && (
              <p className="text-sm text-green-500 mt-1 flex items-center gap-1">
                <CheckIcon className="w-4 h-4" /> Valid address
              </p>
            )}
          </div>

          {/* Amount */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Amount (ADA)
              </label>
              <button
                onClick={handleSetMax}
                className="text-xs text-blue-600 hover:text-blue-700"
              >
                Max: {availableAda.toFixed(2)} ADA
              </button>
            </div>
            <div className="relative">
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.000000"
                step="0.000001"
                min="0"
                className="w-full px-4 py-3 pr-16 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 font-medium">
                ADA
              </span>
            </div>
          </div>

          {/* Fee Estimate */}
          <div className="bg-gray-50 dark:bg-gray-900 rounded-xl p-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Amount</span>
              <span className="text-gray-900 dark:text-white">{amountNum.toFixed(6)} ADA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Network Fee (est.)</span>
              <span className="text-gray-900 dark:text-white">~{estimatedFee} ADA</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-medium">
              <span className="text-gray-700 dark:text-gray-300">Total</span>
              <span className={`${hasEnoughBalance ? "text-gray-900 dark:text-white" : "text-red-500"}`}>
                {totalAmount.toFixed(6)} ADA
              </span>
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
      </div>
    );
  }

  // Confirm Step
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
              {amountNum.toFixed(6)}
            </p>
            <p className="text-xl text-gray-500">ADA</p>
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
              <p className="text-sm font-mono text-gray-900 dark:text-white break-all">
                {recipient}
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
              <span className="text-gray-500">Amount</span>
              <span className="text-gray-900 dark:text-white">{amountNum.toFixed(6)} ADA</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-gray-500">Network Fee</span>
              <span className="text-gray-900 dark:text-white">~{estimatedFee} ADA</span>
            </div>
            <div className="border-t border-gray-200 dark:border-gray-700 pt-2 flex justify-between font-medium">
              <span className="text-gray-700 dark:text-gray-300">Total</span>
              <span className="text-gray-900 dark:text-white">{totalAmount.toFixed(6)} ADA</span>
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
              onClick={handleSend}
            >
              Confirm & Send
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Sending Step
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

  // Success Step
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
            Your transaction has been submitted to the network.
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

  // Error Step
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

SendScreen.displayName = "SendScreen";
