"use client";

import * as React from "react";
import { Card, Button, PinInput } from "@/components/ui";
import { useWalletStore } from "@/hooks";
import { adaToLovelace, shortenAddress } from "@/lib/cardano";
import { verifyPin, getStoredWalletForVerification, decryptWallet } from "@/lib/storage/encryption";
import { fetchSupportedTokens, TokenInfo } from "@/lib/currency";

export interface SwapScreenProps {
  onBack: () => void;
}

type SwapStep = "input" | "quote" | "confirm" | "pin" | "swapping" | "success" | "error";

interface TokenAsset {
  unit: string;
  name: string;
  ticker: string;
  decimals: number;
  isAda: boolean;
}

const ADA_ASSET: TokenAsset = {
  unit: "lovelace",
  name: "Cardano",
  ticker: "ADA",
  decimals: 6,
  isAda: true,
};

export const SwapScreen: React.FC<SwapScreenProps> = ({ onBack }) => {
  const { walletAddress, activeWalletId, balance } = useWalletStore();
  
  const [step, setStep] = React.useState<SwapStep>("input");
  
  // Swap State
  const [sellToken, setSellToken] = React.useState<TokenAsset>(ADA_ASSET);
  const [buyToken, setBuyToken] = React.useState<TokenAsset | null>(null);
  const [amount, setAmount] = React.useState("");
  
  // Data State
  const [tokens, setTokens] = React.useState<TokenInfo[]>([]);
  const [showTokenSelector, setShowTokenSelector] = React.useState<"sell" | "buy" | null>(null);
  const [searchQuery, setSearchQuery] = React.useState("");
  
  const [quote, setQuote] = React.useState<any>(null);
  const [pin, setPin] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);

  // Load tokens on mount
  React.useEffect(() => {
    fetchSupportedTokens().then(setTokens);
  }, []);

  // Get balance for sell token
  const sellBalance = React.useMemo(() => {
    if (sellToken.isAda) return balance?.ada || "0";
    const asset = balance?.assets.find(a => a.unit === sellToken.unit);
    if (!asset) return "0";
    // Native tokens balance is quantity / 10^decimals
    return (Number(asset.quantity) / Math.pow(10, sellToken.decimals)).toString(); 
  }, [balance, sellToken]);

  const handleFlip = () => {
    if (!buyToken) return;
    setSellToken(buyToken);
    setBuyToken(sellToken);
    setAmount("");
    setQuote(null);
  };

  const handleGetQuote = async () => {
    if (!amount || !buyToken) return;
    setIsLoading(true);
    setError(null);
    try {
      // Amount handling: Convert human amount to base units
      let amountInBase = (Number(amount) * Math.pow(10, sellToken.decimals)).toFixed(0);
      
      // DexHunter Quote API (via proxy)
      const url = `/api/dexhunter/quote?buyToken=${buyToken.unit}&sellToken=${sellToken.unit}&sellAmount=${amountInBase}`;
      
      const response = await fetch(url);
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "Failed to get quote. Liquidity might be low.");
      }
      
      setQuote(data);
      setStep("quote");
    } catch (err: any) {
      setError(err.message || "Failed to fetch quote");
    } finally {
      setIsLoading(false);
    }
  };

  const handlePinComplete = async (enteredPin: string) => {
    const stored = getStoredWalletForVerification(activeWalletId || undefined);
    if (!stored || !verifyPin(enteredPin, stored.pinHash)) {
      setError("Invalid PIN");
      return;
    }
    await executeSwap(enteredPin);
  };

  const executeSwap = async (pin: string) => {
    setStep("swapping");
    setError(null);
    try {
      const mnemonic = decryptWallet(pin, activeWalletId || undefined);
      if (!mnemonic) throw new Error("Wallet auth failed");

      // 1. Get Transaction CBOR from DexHunter (Proxy)
      // The proxy will automatically add X-Partner-Id and partnerCode/partnerName
      const response = await fetch("/api/dexhunter/swap", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            buyToken: buyToken?.unit,
            sellToken: sellToken.unit,
            sellAmount: quote.sellAmount,
            userAddress: walletAddress,
            slippage: "1.0", // 1% slippage
            includeTx: true
        }),
      });

      const data = await response.json();
      if (!response.ok) {
          throw new Error(data.message || "Swap transaction build failed");
      }

      const txCbor = data.transaction?.cbor || data.transaction;
      if (!txCbor) throw new Error("No transaction data returned from DexHunter");

      // 2. Sign and Submit with Mesh
      const { createWalletFromMnemonic } = await import("@/lib/cardano");
      const walletInstance = await createWalletFromMnemonic(mnemonic);
      
      // DexHunter transactions often need partialSign=true because they contain script inputs
      const signedTx = await walletInstance.wallet.signTx(txCbor, true); 
      const hash = await walletInstance.wallet.submitTx(signedTx);

      setTxHash(hash);
      setStep("success");

    } catch (err: any) {
      console.error("Swap Error:", err);
      setError(err.message || String(err));
      setStep("error");
    }
  };

  // Render Token Selector Modal
  const renderTokenSelector = () => {
    if (!showTokenSelector) return null;
    
    const filteredTokens = tokens.filter(t => 
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
      t.ticker.toLowerCase().includes(searchQuery.toLowerCase())
    );

    return (
      <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center backdrop-blur-sm">
        <div className="bg-white dark:bg-gray-900 w-full sm:max-w-md h-[80vh] sm:h-[600px] rounded-t-3xl sm:rounded-3xl p-4 flex flex-col shadow-2xl animate-in slide-in-from-bottom duration-300">
          <div className="flex justify-between items-center mb-4 px-2">
            <h3 className="font-bold text-lg">Select Token</h3>
            <button onClick={() => setShowTokenSelector(null)} className="p-2 text-gray-400 hover:text-gray-600">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.6} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
          
          <div className="relative mb-4">
            <input
              autoFocus
              placeholder="Search by name or ticker"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full p-4 bg-gray-100 dark:bg-gray-800 rounded-2xl outline-none focus:ring-2 ring-blue-500/20"
            />
          </div>
          
          <div className="flex-1 overflow-y-auto space-y-1">
            {/* ADA Option */}
            <div 
              onClick={() => {
                if (showTokenSelector === "sell") setSellToken(ADA_ASSET);
                else setBuyToken(ADA_ASSET);
                setShowTokenSelector(null);
              }}
              className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl cursor-pointer flex items-center justify-between group"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold shadow-lg shadow-blue-500/20">₳</div>
                <div>
                  <p className="font-bold">ADA</p>
                  <p className="text-xs text-gray-500">Cardano</p>
                </div>
              </div>
              <div className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Select</div>
            </div>

            {filteredTokens.map(t => (
              <div 
                key={t.unit}
                onClick={() => {
                  const asset: TokenAsset = {
                    unit: t.unit,
                    name: t.name,
                    ticker: t.ticker,
                    decimals: t.decimals,
                    isAda: false
                  };
                  if (showTokenSelector === "sell") setSellToken(asset);
                  else setBuyToken(asset);
                  setShowTokenSelector(null);
                }}
                className="p-3 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-2xl cursor-pointer flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-300 font-bold text-xs uppercase">
                    {t.ticker.slice(0, 3)}
                  </div>
                  <div>
                    <p className="font-bold">{t.ticker}</p>
                    <p className="text-[10px] text-gray-500 font-mono">{shortenAddress(t.policyId, 6)}</p>
                  </div>
                </div>
                <div className="text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity">Select</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  };

  // Views
  if (step === "input") {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-full transition-colors shadow-sm">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-xl font-bold">Swap</h1>
        </header>

        <div className="space-y-2 relative">
          {/* Sell Input */}
          <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">You Pay</span>
              <span className="text-xs text-gray-500 font-medium">Balance: <span className="text-gray-900 dark:text-gray-100">{Number(sellBalance).toFixed(4)}</span></span>
            </div>
            <div className="flex gap-4 items-center">
              <input 
                type="number" 
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="bg-transparent text-3xl font-bold w-full outline-none placeholder:text-gray-200 dark:placeholder:text-gray-700"
              />
              <button 
                onClick={() => { setShowTokenSelector("sell"); setSearchQuery(""); }}
                className="bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 pl-2 pr-4 py-2 rounded-2xl shadow-sm flex items-center gap-2 font-bold shrink-0 transition-all border border-gray-100 dark:border-gray-600"
              >
                <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-white text-[10px]">
                  {sellToken.isAda ? "₳" : sellToken.ticker.slice(0, 1)}
                </div>
                {sellToken.ticker}
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>

          {/* Flip Button */}
          <div className="flex justify-center -my-6 relative z-10">
            <button onClick={handleFlip} className="bg-blue-600 p-3 rounded-2xl shadow-xl shadow-blue-500/40 border-4 border-gray-50 dark:border-gray-900 active:scale-90 transition-transform">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            </button>
          </div>

          {/* Buy Input */}
          <div className="bg-white dark:bg-gray-800 p-5 rounded-3xl shadow-sm border border-gray-100 dark:border-gray-700 pt-8">
            <div className="flex justify-between mb-3">
              <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">You Receive</span>
            </div>
            <div className="flex gap-4 items-center">
              <input 
                readOnly
                placeholder="0.00"
                value=""
                className="bg-transparent text-3xl font-bold w-full outline-none text-gray-300 dark:text-gray-600"
              />
              <button 
                onClick={() => { setShowTokenSelector("buy"); setSearchQuery(""); }}
                className="bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 pl-2 pr-4 py-2 rounded-2xl shadow-sm flex items-center gap-2 font-bold shrink-0 transition-all border border-gray-100 dark:border-gray-600"
              >
                {buyToken ? (
                  <>
                    <div className="w-7 h-7 rounded-full bg-gray-200 dark:bg-gray-600 flex items-center justify-center text-gray-600 dark:text-gray-300 text-[10px]">
                        {buyToken.isAda ? "₳" : buyToken.ticker.slice(0, 1)}
                    </div>
                    {buyToken.ticker}
                  </>
                ) : (
                  <span className="px-2">Select</span>
                )}
                <svg className="w-3 h-3 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M19 9l-7 7-7-7" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round"/></svg>
              </button>
            </div>
          </div>

          {error && <p className="text-red-500 text-sm text-center font-medium px-4">{error}</p>}

          <Button 
            size="lg" 
            fullWidth 
            className="h-16 rounded-3xl font-bold text-lg mt-6 shadow-lg shadow-blue-500/20"
            onClick={handleGetQuote} 
            disabled={isLoading || !amount || !buyToken}
          >
            {isLoading ? (
              <div className="flex items-center gap-2">
                 <div className="animate-spin h-5 w-5 border-2 border-white/30 border-t-white rounded-full"></div>
                 Fetching Best Price...
              </div>
            ) : "Swap"}
          </Button>
        </div>

        {renderTokenSelector()}
      </div>
    );
  }

  if (step === "quote" && quote) {
    const buyAmountHuman = (Number(quote.buyAmount) / Math.pow(10, buyToken?.decimals || 0)).toFixed(6);
    const minReceiveHuman = (Number(quote.buyAmountWithSlippage) / Math.pow(10, buyToken?.decimals || 0)).toFixed(6);

    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-4">
        <header className="flex items-center gap-3 mb-8">
          <button onClick={() => setStep("input")} className="p-2 hover:bg-white dark:hover:bg-gray-800 rounded-full shadow-sm transition-colors">
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" /></svg>
          </button>
          <h1 className="text-xl font-bold">Review Swap</h1>
        </header>

        <div className="space-y-6">
            <div className="flex flex-col items-center gap-2 mb-8">
                <div className="text-4xl font-black text-gray-900 dark:text-white">{buyAmountHuman} <span className="text-blue-600">{buyToken?.ticker}</span></div>
                <div className="text-sm text-gray-500 font-medium uppercase tracking-widest">Expected Return</div>
            </div>

            <Card padding="lg" className="rounded-3xl border-none shadow-sm space-y-4">
                <div className="flex justify-between items-center py-2">
                    <span className="text-gray-500 font-medium">Pay</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">{amount} {sellToken.ticker}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-50 dark:border-gray-800">
                    <span className="text-gray-500 font-medium">Minimum Receive</span>
                    <span className="font-bold text-green-500">{minReceiveHuman} {buyToken?.ticker}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-50 dark:border-gray-800">
                    <span className="text-gray-500 font-medium">Slippage Tolerance</span>
                    <span className="font-bold text-gray-900 dark:text-gray-100">1.0%</span>
                </div>
                <div className="flex justify-between items-center py-2 border-t border-gray-50 dark:border-gray-800">
                    <span className="text-gray-500 font-medium">Provider</span>
                    <span className="text-xs px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg font-bold">DexHunter Aggregator</span>
                </div>
            </Card>

            <Button fullWidth size="lg" className="h-16 rounded-3xl font-bold shadow-lg shadow-blue-500/20" onClick={() => setStep("pin")}>Confirm & Swap</Button>
            <p className="text-[10px] text-gray-400 text-center px-10">Quotes are based on real-time liquidity and may change slightly before execution.</p>
        </div>
      </div>
    );
  }

  if (step === "pin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <h1 className="text-2xl font-bold mb-8 text-gray-900 dark:text-white">Confirm with PIN</h1>
        <div className="w-full max-w-xs mx-auto text-center">
            <PinInput value={pin} onChange={setPin} onComplete={handlePinComplete} autoFocus />
            {error && <p className="text-red-500 mt-6 font-medium bg-red-50 dark:bg-red-900/20 p-3 rounded-2xl">{error}</p>}
            <button onClick={() => setStep("quote")} className="mt-8 text-gray-500 font-bold hover:text-blue-600 transition-colors">Cancel</button>
        </div>
      </div>
    );
  }

  if (step === "swapping") {
    return (
        <div className="min-h-screen flex flex-col items-center justify-center p-10 bg-gray-50 dark:bg-gray-900">
            <div className="relative w-24 h-24 mb-8">
                <div className="absolute inset-0 border-8 border-blue-600/20 rounded-full"></div>
                <div className="absolute inset-0 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Swapping Tokens</h2>
            <p className="text-gray-500 text-center">We're routing your trade through the best DEX for the lowest slippage.</p>
        </div>
    );
  }

  if (step === "success") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-gray-50 dark:bg-gray-900">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mb-8">
            <svg className="w-12 h-12 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
        </div>
        <h1 className="text-3xl font-black text-gray-900 dark:text-white mb-2">Trade Success!</h1>
        <p className="text-gray-500 mb-8 text-center px-10">Your swap has been submitted to the Cardano network.</p>
        
        <Card className="w-full max-w-xs p-4 bg-white dark:bg-gray-800 rounded-2xl border-none shadow-sm mb-10">
            <div className="text-center">
                <p className="text-xs text-gray-400 uppercase font-bold tracking-widest mb-1">Transaction ID</p>
                <p className="text-xs text-gray-900 dark:text-gray-100 font-mono break-all">{txHash}</p>
            </div>
        </Card>

        <Button fullWidth size="lg" className="rounded-2xl h-14" onClick={onBack}>Back to Wallet</Button>
      </div>
    );
  }

  if (step === "error") {
    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 p-6 flex flex-col items-center justify-center">
          <div className="w-20 h-20 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mb-6">
              <span className="text-3xl">⚠️</span>
          </div>
          <h2 className="text-2xl font-bold text-red-600 mb-2">Swap Failed</h2>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-2xl border border-red-100 dark:border-red-900/30 w-full mb-8">
              <p className="text-red-500 text-center text-sm font-medium">{error}</p>
          </div>
          <Button fullWidth size="lg" className="rounded-2xl h-14" onClick={() => setStep("input")}>Try Again</Button>
          <button onClick={onBack} className="mt-4 text-gray-500 font-bold">Dismiss</button>
        </div>
      );
  }

  return null;
};
