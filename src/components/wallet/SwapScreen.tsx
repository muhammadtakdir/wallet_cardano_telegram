"use client";

import * as React from "react";
import { useWalletStore, useTelegram } from "@/hooks";
import {
  Token,
  ADA_TOKEN,
  POPULAR_TOKENS,
  getSwapEstimate,
  buildSwapTransaction,
  signAndSubmitWithLucid,
  SwapEstimateResponse,
  formatTokenAmount,
  lovelaceToAda,
  DexHunterError,
} from "@/lib/dexhunter-api";

export interface SwapScreenProps {
  onBack: () => void;
}

type SwapStatus = 'idle' | 'estimating' | 'building' | 'signing' | 'submitting' | 'success' | 'error';

// Token Icon Component with fallback
const TokenIcon: React.FC<{ token: Token; size?: 'sm' | 'md' | 'lg' }> = ({ token, size = 'md' }) => {
  const [imgError, setImgError] = React.useState(false);
  const sizeClasses = {
    sm: 'w-5 h-5 text-[10px]',
    md: 'w-6 h-6 text-xs',
    lg: 'w-10 h-10 text-sm',
  };
  const bgColor = token.id === '' ? 'bg-blue-500' : 'bg-purple-500';

  if (token.logo && !imgError) {
    return (
      <img
        src={token.logo}
        alt={token.ticker}
        className={`${sizeClasses[size]} rounded-full object-cover flex-shrink-0`}
        onError={() => setImgError(true)}
      />
    );
  }

  return (
    <div className={`${sizeClasses[size]} rounded-full ${bgColor} flex items-center justify-center text-white font-bold flex-shrink-0`}>
      {token.ticker.charAt(0)}
    </div>
  );
};

export const SwapScreen: React.FC<SwapScreenProps> = ({ onBack }) => {
  const { _walletInstance, _mnemonic, network, balance, refreshBalance } = useWalletStore();
  const { initData, colorScheme } = useTelegram();
  
  // Swap state
  const [tokenIn, setTokenIn] = React.useState<Token>(ADA_TOKEN);
  const [tokenOut, setTokenOut] = React.useState<Token>(POPULAR_TOKENS[1]);
  const [amountIn, setAmountIn] = React.useState('');
  const [slippage, setSlippage] = React.useState(2);
  
  // Quote & Transaction state
  const [estimate, setEstimate] = React.useState<SwapEstimateResponse | null>(null);
  const [estimateError, setEstimateError] = React.useState<string | null>(null);
  const [status, setStatus] = React.useState<SwapStatus>('idle');
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  
  // UI state
  const [showTokenSelect, setShowTokenSelect] = React.useState<'in' | 'out' | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);

  const isDark = colorScheme === 'dark';
  const isMainnet = network === 'mainnet';

  // Get wallet address
  const getWalletAddress = React.useCallback(async (): Promise<string> => {
    if (!_walletInstance) throw new Error('Wallet not connected');
    const addresses = await _walletInstance.getUsedAddresses();
    if (addresses.length > 0) return addresses[0];
    const unusedAddresses = await _walletInstance.getUnusedAddresses();
    if (unusedAddresses.length > 0) return unusedAddresses[0];
    return await _walletInstance.getChangeAddress();
  }, [_walletInstance]);

  // Get token balance
  const getTokenBalance = React.useCallback((token: Token): string => {
    if (!balance) return '0';
    if (token.id === '') return lovelaceToAda(balance.lovelace);
    const asset = balance.assets?.find(a => a.unit === token.id);
    return asset ? formatTokenAmount(asset.quantity, token.decimals) : '0';
  }, [balance]);

  // Fetch estimate with debounce
  React.useEffect(() => {
    const amount = parseFloat(amountIn);
    if (!amountIn || isNaN(amount) || amount <= 0) {
      setEstimate(null);
      setEstimateError(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        setStatus('estimating');
        setEstimateError(null);
        const result = await getSwapEstimate(tokenIn.id, tokenOut.id, amount, slippage);
        if (!controller.signal.aborted) {
          setEstimate(result);
          setStatus('idle');
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setEstimateError(err instanceof DexHunterError ? err.message : 'Failed to get quote');
          setEstimate(null);
          setStatus('idle');
        }
      }
    }, 600);

    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [amountIn, tokenIn.id, tokenOut.id, slippage]);

  // Swap direction
  const handleSwapTokens = React.useCallback(() => {
    setTokenIn(tokenOut);
    setTokenOut(tokenIn);
    setAmountIn('');
    setEstimate(null);
  }, [tokenIn, tokenOut]);

  // Set max amount
  const handleSetMax = React.useCallback(() => {
    if (tokenIn.id === '' && balance) {
      const maxLovelace = BigInt(balance.lovelace) - BigInt(5000000);
      if (maxLovelace > 0) setAmountIn(lovelaceToAda(maxLovelace));
    } else if (balance?.assets) {
      const asset = balance.assets.find(a => a.unit === tokenIn.id);
      if (asset) setAmountIn(formatTokenAmount(asset.quantity, tokenIn.decimals));
    }
  }, [tokenIn, balance]);

  // Execute swap
  const handleSwap = async () => {
    if (!_walletInstance || !estimate || !amountIn || !_mnemonic) return;

    setError(null);
    setTxHash(null);

    try {
      const amountValue = parseFloat(amountIn);
      
      // Validation
      if (tokenIn.id === '' && amountValue < 3) {
        throw new Error('Minimum swap amount is 3 ADA');
      }
      
      if (tokenIn.id === '' && balance) {
        const balanceAda = parseFloat(lovelaceToAda(balance.lovelace));
        if (balanceAda < amountValue + 5) {
          throw new Error(`Insufficient balance. Need ${(amountValue + 5).toFixed(2)} ADA`);
        }
      }

      // Build transaction
      setStatus('building');
      const address = await getWalletAddress();
      const buildResult = await buildSwapTransaction(address, tokenIn.id, tokenOut.id, amountValue, slippage);

      // Sign and submit
      setStatus('signing');
      setStatus('submitting');
      const hash = await signAndSubmitWithLucid(buildResult.cbor, _mnemonic, network === 'mainnet' ? 'mainnet' : 'preprod');

      setTxHash(hash);
      setStatus('success');
      
      // Add points (non-blocking)
      if (initData) {
        fetch('/api/user/add-points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, actionType: 'swap' }),
        }).catch(() => {});
      }

      setTimeout(refreshBalance, 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Swap failed');
      setStatus('error');
    }
  };

  // Reset form
  const handleReset = () => {
    setAmountIn('');
    setEstimate(null);
    setStatus('idle');
    setTxHash(null);
    setError(null);
  };

  // Select token
  const handleSelectToken = (token: Token) => {
    if (showTokenSelect === 'in') {
      setTokenIn(token);
    } else {
      setTokenOut(token);
    }
    setShowTokenSelect(null);
    setAmountIn('');
    setEstimate(null);
  };

  // Button state
  const getButtonState = () => {
    if (status === 'success') return { text: 'Swap Again', disabled: false, color: 'bg-green-500 hover:bg-green-600' };
    if (status === 'estimating') return { text: 'Getting quote...', disabled: true, color: 'bg-gray-400' };
    if (status === 'building') return { text: 'Building...', disabled: true, color: 'bg-gray-400' };
    if (status === 'signing') return { text: 'Signing...', disabled: true, color: 'bg-gray-400' };
    if (status === 'submitting') return { text: 'Submitting...', disabled: true, color: 'bg-gray-400' };
    if (!isMainnet) return { text: 'Switch to Mainnet', disabled: true, color: 'bg-gray-400' };
    if (!amountIn) return { text: 'Enter amount', disabled: true, color: 'bg-gray-400' };
    if (!estimate) return { text: 'Getting quote...', disabled: true, color: 'bg-gray-400' };
    return { text: 'Swap', disabled: false, color: 'bg-blue-500 hover:bg-blue-600' };
  };

  const buttonState = getButtonState();

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'} flex flex-col`}>
      {/* Header */}
      <header className={`flex items-center justify-between px-4 py-3 border-b ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} sticky top-0 z-50`}>
        <div className="flex items-center gap-3">
          <button onClick={onBack} className={`p-2 -ml-2 rounded-full ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-lg font-bold">Swap</h1>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className={`p-2 -mr-2 rounded-full ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      <main className="flex-1 p-4 space-y-3">
        {/* Network Warning */}
        {!isMainnet && (
          <div className="p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-center">
            <p className="text-sm text-yellow-800 dark:text-yellow-200">⚠️ Swap only works on Mainnet</p>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className={`p-3 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white shadow'}`}>
            <h3 className="text-sm font-semibold mb-2">Slippage Tolerance</h3>
            <div className="flex gap-2">
              {[0.5, 1, 2, 3].map((s) => (
                <button key={s} onClick={() => setSlippage(s)}
                  className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                    slippage === s ? 'bg-blue-500 text-white' : isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'
                  }`}>
                  {s}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Swap Card */}
        <div className={`rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-white shadow-lg'} p-3 space-y-2`}>
          {/* Token In */}
          <div className={`p-3 rounded-xl ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-gray-500">You pay</span>
              <span className="text-xs text-gray-500">Balance: {getTokenBalance(tokenIn)}</span>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                inputMode="decimal"
                value={amountIn}
                onChange={(e) => setAmountIn(e.target.value)}
                placeholder="0.00"
                className={`flex-1 min-w-0 text-xl font-bold bg-transparent outline-none ${isDark ? 'text-white' : 'text-gray-900'}`}
                disabled={!['idle', 'error'].includes(status)}
              />
              <button
                onClick={() => setShowTokenSelect('in')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0 ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white shadow hover:bg-gray-50'}`}
              >
                <TokenIcon token={tokenIn} size="sm" />
                <span className="font-semibold text-sm">{tokenIn.ticker}</span>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            <div className="flex justify-end mt-1">
              <button onClick={handleSetMax} className="text-xs text-blue-500 font-medium">MAX</button>
            </div>
          </div>

          {/* Swap Direction Button */}
          <div className="flex justify-center -my-0.5 relative z-10">
            <button onClick={handleSwapTokens} className={`p-2 rounded-full ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'} transition-colors`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
              </svg>
            </button>
          </div>

          {/* Token Out */}
          <div className={`p-3 rounded-xl ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs text-gray-500">You receive</span>
              <span className="text-xs text-gray-500">Balance: {getTokenBalance(tokenOut)}</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 text-xl font-bold truncate">
                {status === 'estimating' ? (
                  <span className="text-gray-400">Loading...</span>
                ) : estimate ? (
                  <span className={isDark ? 'text-white' : 'text-gray-900'}>
                    ~{formatTokenAmount(estimate.total_output_without_slippage || estimate.total_output || '0', tokenOut.decimals)}
                  </span>
                ) : (
                  <span className="text-gray-400">0.00</span>
                )}
              </div>
              <button
                onClick={() => setShowTokenSelect('out')}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl flex-shrink-0 ${isDark ? 'bg-gray-800 hover:bg-gray-700' : 'bg-white shadow hover:bg-gray-50'}`}
              >
                <TokenIcon token={tokenOut} size="sm" />
                <span className="font-semibold text-sm">{tokenOut.ticker}</span>
                <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
          </div>

          {/* Estimate Details */}
          {estimate && (
            <div className={`p-2.5 rounded-xl text-xs ${isDark ? 'bg-gray-900' : 'bg-gray-50'} space-y-1`}>
              <div className="flex justify-between">
                <span className="text-gray-500">Price Impact</span>
                <span className={parseFloat(String(estimate.price_impact || 0)) > 5 ? 'text-red-500' : 'text-green-500'}>
                  {estimate.price_impact || '0'}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Min. received</span>
                <span>{formatTokenAmount(estimate.min_output || estimate.total_output || '0', tokenOut.decimals)} {tokenOut.ticker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Routes</span>
                <span>{estimate.routes?.length || estimate.splits?.length || 1} DEX</span>
              </div>
            </div>
          )}

          {/* Error */}
          {(estimateError || error) && (
            <div className="p-2.5 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-xs text-red-600 dark:text-red-400">{estimateError || error}</p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && txHash && (
            <div className="p-2.5 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">✅ Swap successful!</p>
              <a href={`https://cardanoscan.io/transaction/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline break-all">
                View on Cardanoscan →
              </a>
            </div>
          )}

          {/* Swap Button */}
          <button
            onClick={status === 'success' ? handleReset : handleSwap}
            disabled={buttonState.disabled}
            className={`w-full py-3.5 rounded-xl font-bold transition-colors text-white ${buttonState.color} ${buttonState.disabled ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {buttonState.text}
          </button>
        </div>

        {/* Powered by DexHunter */}
        <a href="https://dexhunter.io" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 py-1">
          <span className="text-xs text-gray-500">Powered by</span>
          <span className="text-xs font-semibold text-blue-500">DexHunter</span>
        </a>
      </main>

      {/* Token Select Modal */}
      {showTokenSelect && (
        <div className="fixed inset-0 bg-black/60 flex items-end z-50" onClick={() => setShowTokenSelect(null)}>
          <div
            className={`w-full rounded-t-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} max-h-[70vh] overflow-hidden`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-gray-800">
              <h3 className="text-lg font-bold">Select Token</h3>
              <button onClick={() => setShowTokenSelect(null)} className={`p-1.5 rounded-full ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(70vh-60px)] p-2">
              {POPULAR_TOKENS.map((token) => (
                <button
                  key={token.id}
                  onClick={() => handleSelectToken(token)}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800 active:bg-gray-700' : 'hover:bg-gray-100 active:bg-gray-200'}`}
                >
                  <TokenIcon token={token} size="lg" />
                  <div className="flex-1 min-w-0 text-left">
                    <div className="font-semibold">{token.ticker}</div>
                    <div className="text-xs text-gray-500 truncate">{token.name}</div>
                  </div>
                  <div className="text-sm text-gray-500 text-right">{getTokenBalance(token)}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SwapScreen;
