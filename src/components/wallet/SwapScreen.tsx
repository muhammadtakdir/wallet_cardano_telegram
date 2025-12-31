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

export const SwapScreen: React.FC<SwapScreenProps> = ({ onBack }) => {
  const { _walletInstance, _mnemonic, network, balance, refreshBalance } = useWalletStore();
  const { initData, colorScheme } = useTelegram();
  
  // Swap state
  const [tokenIn, setTokenIn] = React.useState<Token>(ADA_TOKEN);
  const [tokenOut, setTokenOut] = React.useState<Token>(POPULAR_TOKENS[1]); // NIGHT default
  const [amountIn, setAmountIn] = React.useState<string>('');
  const [slippage, setSlippage] = React.useState<number>(2);
  
  // Quote state
  const [estimate, setEstimate] = React.useState<SwapEstimateResponse | null>(null);
  const [estimateError, setEstimateError] = React.useState<string | null>(null);
  
  // Transaction state
  const [status, setStatus] = React.useState<SwapStatus>('idle');
  const [txHash, setTxHash] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  
  // UI state
  const [showTokenSelect, setShowTokenSelect] = React.useState<'in' | 'out' | null>(null);
  const [showSettings, setShowSettings] = React.useState(false);

  // Get user's wallet address
  const getWalletAddress = React.useCallback(async (): Promise<string> => {
    if (!_walletInstance) throw new Error('Wallet not connected');
    
    const addresses = await _walletInstance.getUsedAddresses();
    if (addresses.length > 0) return addresses[0];
    
    const unusedAddresses = await _walletInstance.getUnusedAddresses();
    if (unusedAddresses.length > 0) return unusedAddresses[0];
    
    return await _walletInstance.getChangeAddress();
  }, [_walletInstance]);

  // Fetch estimate when amount changes
  React.useEffect(() => {
    const fetchEstimate = async () => {
      if (!amountIn || parseFloat(amountIn) <= 0) {
        setEstimate(null);
        setEstimateError(null);
        return;
      }

      try {
        setStatus('estimating');
        setEstimateError(null);
        
        const amountValue = parseFloat(amountIn);
        
        const result = await getSwapEstimate(
          tokenIn.id,
          tokenOut.id,
          amountValue,
          slippage
        );
        
        setEstimate(result);
        setStatus('idle');
      } catch (err) {
        console.error('Estimate error:', err);
        setEstimateError(err instanceof DexHunterError ? err.message : 'Failed to get quote');
        setEstimate(null);
        setStatus('idle');
      }
    };

    const timer = setTimeout(fetchEstimate, 500);
    return () => clearTimeout(timer);
  }, [amountIn, tokenIn, tokenOut, slippage]);

  // Swap tokens (reverse direction)
  const handleSwapTokens = () => {
    const tempToken = tokenIn;
    setTokenIn(tokenOut);
    setTokenOut(tempToken);
    setAmountIn('');
    setEstimate(null);
  };

  // Set max amount
  const handleSetMax = () => {
    if (tokenIn.id === '' && balance) {
      // For ADA, leave 5 ADA for fees
      const maxLovelace = BigInt(balance.lovelace) - BigInt(5000000);
      if (maxLovelace > 0) {
        setAmountIn(lovelaceToAda(maxLovelace));
      }
    } else if (balance?.assets) {
      const asset = balance.assets.find(a => a.unit === tokenIn.id);
      if (asset) {
        setAmountIn(formatTokenAmount(asset.quantity, tokenIn.decimals));
      }
    }
  };

  // Execute swap
  const handleSwap = async () => {
    if (!_walletInstance || !estimate || !amountIn) return;

    setError(null);
    setTxHash(null);

    try {
      if (!_mnemonic) {
        throw new Error('Wallet mnemonic not available. Please re-unlock your wallet.');
      }

      const amountValue = parseFloat(amountIn);
      if (tokenIn.id === '' && amountValue < 3) {
        throw new Error('Minimum swap amount is 3 ADA');
      }
      
      // Check balance
      if (tokenIn.id === '' && balance) {
        const balanceAda = parseFloat(lovelaceToAda(balance.lovelace));
        const requiredAda = amountValue + 5;
        if (balanceAda < requiredAda) {
          throw new Error(`Insufficient balance. Need ${requiredAda.toFixed(2)} ADA (${amountValue} + ~5 for fees). You have: ${balanceAda.toFixed(2)} ADA`);
        }
      }

      // Build transaction
      setStatus('building');
      const address = await getWalletAddress();
      console.log('[Swap] Address:', address);

      const buildResult = await buildSwapTransaction(
        address,
        tokenIn.id,
        tokenOut.id,
        amountValue,
        slippage
      );
      console.log('[Swap] Build OK');

      // Sign and submit with Lucid (handles stake key)
      setStatus('signing');
      const networkName = network === 'mainnet' ? 'mainnet' : 'preprod';
      
      setStatus('submitting');
      const hash = await signAndSubmitWithLucid(
        buildResult.cbor,
        _mnemonic,
        networkName
      );
      console.log('[Swap] TX:', hash);

      setTxHash(hash);
      setStatus('success');
      
      // Add points
      if (initData) {
        fetch('/api/user/add-points', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ initData, actionType: 'swap' }),
        }).catch(console.warn);
      }

      setTimeout(() => refreshBalance(), 3000);

    } catch (err) {
      console.error('[Swap] Error:', err);
      setError(err instanceof Error ? err.message : 'Swap failed');
      setStatus('error');
    }
  };

  const handleReset = () => {
    setAmountIn('');
    setEstimate(null);
    setStatus('idle');
    setTxHash(null);
    setError(null);
  };

  const getTokenBalance = (token: Token): string => {
    if (!balance) return '0';
    if (token.id === '') return lovelaceToAda(balance.lovelace);
    const asset = balance.assets?.find(a => a.unit === token.id);
    return asset ? formatTokenAmount(asset.quantity, token.decimals) : '0';
  };

  const isMainnet = network === 'mainnet';
  const isDark = colorScheme === 'dark';

  return (
    <div className={`min-h-screen ${isDark ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-900'} flex flex-col`}>
      {/* Header */}
      <header className={`flex items-center justify-between p-4 border-b ${isDark ? 'border-gray-800 bg-gray-900' : 'border-gray-200 bg-white'} sticky top-0 z-50`}>
        <div className="flex items-center gap-4">
          <button onClick={onBack} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Swap</h1>
        </div>
        <button onClick={() => setShowSettings(!showSettings)} className={`p-2 rounded-full transition-colors ${isDark ? 'hover:bg-gray-800 text-gray-400' : 'hover:bg-gray-100 text-gray-500'}`}>
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
        </button>
      </header>

      <main className="flex-1 p-4 space-y-4">
        {/* Network Warning */}
        {!isMainnet && (
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-center">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">⚠️ Swap only works on Mainnet</p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">Current: <b>{network}</b></p>
          </div>
        )}

        {/* Settings Panel */}
        {showSettings && (
          <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-800 border border-gray-700' : 'bg-white border border-gray-200'}`}>
            <h3 className="text-sm font-semibold mb-3">Slippage Tolerance</h3>
            <div className="flex gap-2">
              {[0.5, 1, 2, 3].map((s) => (
                <button key={s} onClick={() => setSlippage(s)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${slippage === s ? 'bg-blue-500 text-white' : isDark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
                  {s}%
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Swap Card */}
        <div className={`rounded-2xl ${isDark ? 'bg-gray-800' : 'bg-white shadow-lg'} p-4 space-y-3`}>
          {/* Token In */}
          <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">You pay</span>
              <span className="text-sm text-gray-500">Balance: {getTokenBalance(tokenIn)} {tokenIn.ticker}</span>
            </div>
            <div className="flex items-center gap-3">
              <input type="number" value={amountIn} onChange={(e) => setAmountIn(e.target.value)} placeholder="0.00"
                className={`flex-1 text-2xl font-bold bg-transparent outline-none ${isDark ? 'text-white' : 'text-gray-900'}`}
                disabled={status !== 'idle'} />
              <button onClick={() => setShowTokenSelect('in')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white shadow'}`}>
                {tokenIn.logo ? (
                  <img src={tokenIn.logo} alt={tokenIn.ticker} className="w-6 h-6 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                ) : null}
                <div className={`w-6 h-6 rounded-full bg-blue-500 flex items-center justify-center text-white text-xs font-bold ${tokenIn.logo ? 'hidden' : ''}`}>{tokenIn.ticker.charAt(0)}</div>
                <span className="font-semibold">{tokenIn.ticker}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
            <div className="flex justify-end mt-2">
              <button onClick={handleSetMax} className="text-xs text-blue-500 hover:text-blue-600 font-medium">MAX</button>
            </div>
          </div>

          {/* Swap Direction */}
          <div className="flex justify-center -my-1">
            <button onClick={handleSwapTokens} className={`p-2 rounded-full ${isDark ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-100 hover:bg-gray-200'} transition-colors`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" /></svg>
            </button>
          </div>

          {/* Token Out */}
          <div className={`p-4 rounded-xl ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-500">You receive</span>
              <span className="text-sm text-gray-500">Balance: {getTokenBalance(tokenOut)} {tokenOut.ticker}</span>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 text-2xl font-bold">
                {status === 'estimating' ? <span className="text-gray-400">Loading...</span> :
                 estimate ? <span className={isDark ? 'text-white' : 'text-gray-900'}>~{formatTokenAmount(estimate.total_output_without_slippage || estimate.total_output || '0', tokenOut.decimals)}</span> :
                 <span className="text-gray-400">0.00</span>}
              </div>
              <button onClick={() => setShowTokenSelect('out')}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl ${isDark ? 'bg-gray-800' : 'bg-white shadow'}`}>
                {tokenOut.logo ? (
                  <img src={tokenOut.logo} alt={tokenOut.ticker} className="w-6 h-6 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                ) : null}
                <div className={`w-6 h-6 rounded-full bg-purple-500 flex items-center justify-center text-white text-xs font-bold ${tokenOut.logo ? 'hidden' : ''}`}>{tokenOut.ticker.charAt(0)}</div>
                <span className="font-semibold">{tokenOut.ticker}</span>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </button>
            </div>
          </div>

          {/* Estimate Details */}
          {estimate && (
            <div className={`p-3 rounded-xl text-sm ${isDark ? 'bg-gray-900' : 'bg-gray-50'}`}>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Price Impact</span>
                <span className={estimate.price_impact && parseFloat(String(estimate.price_impact)) > 5 ? 'text-red-500' : 'text-green-500'}>{estimate.price_impact || '0'}%</span>
              </div>
              <div className="flex justify-between mb-1">
                <span className="text-gray-500">Min. received</span>
                <span>{formatTokenAmount(estimate.min_output || estimate.total_output || '0', tokenOut.decimals)} {tokenOut.ticker}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Routes</span>
                <span>{(estimate.routes?.length || estimate.splits?.length || 1)} DEX{(estimate.routes?.length || estimate.splits?.length || 1) > 1 ? 'es' : ''}</span>
              </div>
            </div>
          )}

          {/* Error */}
          {(estimateError || error) && (
            <div className="p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-600 dark:text-red-400">{estimateError || error}</p>
            </div>
          )}

          {/* Success */}
          {status === 'success' && txHash && (
            <div className="p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
              <p className="text-sm text-green-600 dark:text-green-400 font-medium mb-1">✅ Swap successful!</p>
              <a href={`https://cardanoscan.io/transaction/${txHash}`} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline break-all">View on Cardanoscan →</a>
            </div>
          )}

          {/* Swap Button */}
          <button onClick={status === 'success' ? handleReset : handleSwap}
            disabled={status === 'success' ? false : !isMainnet || !amountIn || parseFloat(amountIn) <= 0 || !estimate || !['idle', 'error'].includes(status)}
            className={`w-full py-4 rounded-xl font-bold text-lg transition-colors ${
              status === 'success' ? 'bg-green-500 hover:bg-green-600 text-white' :
              (!isMainnet || !amountIn || !estimate || !['idle', 'error'].includes(status)) ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed' :
              'bg-blue-500 hover:bg-blue-600 text-white'
            }`}>
            {status === 'success' ? 'Swap Again' :
             status === 'estimating' ? 'Getting quote...' :
             status === 'building' ? 'Building...' :
             status === 'signing' ? 'Signing...' :
             status === 'submitting' ? 'Submitting...' :
             !isMainnet ? 'Switch to Mainnet' :
             !amountIn ? 'Enter amount' :
             !estimate ? 'Getting quote...' : 'Swap'}
          </button>
        </div>

        <a href="https://dexhunter.io" target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 py-2">
          <span className="text-xs text-gray-500">Powered by</span>
          <img src="https://app.dexhunter.io/dexhunter_logo.svg" alt="DexHunter" className="h-4" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
          <span className="text-xs font-medium text-blue-500">DexHunter</span>
        </a>
      </main>

      {/* Token Select Modal */}
      {showTokenSelect && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50">
          <div className={`w-full max-w-lg rounded-t-2xl ${isDark ? 'bg-gray-900' : 'bg-white'} p-4 max-h-[70vh] overflow-y-auto`}>
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold">Select Token</h3>
              <button onClick={() => setShowTokenSelect(null)} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full">
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-2">
              {POPULAR_TOKENS.map((token) => (
                <button key={token.id} onClick={() => { showTokenSelect === 'in' ? setTokenIn(token) : setTokenOut(token); setShowTokenSelect(null); setAmountIn(''); setEstimate(null); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${isDark ? 'hover:bg-gray-800' : 'hover:bg-gray-100'}`}>
                  {token.logo ? (
                    <img src={token.logo} alt={token.ticker} className="w-10 h-10 rounded-full object-cover" onError={(e) => { e.currentTarget.style.display = 'none'; e.currentTarget.nextElementSibling?.classList.remove('hidden'); }} />
                  ) : null}
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-bold ${token.id === '' ? 'bg-blue-500' : 'bg-purple-500'} ${token.logo ? 'hidden' : ''}`}>{token.ticker.charAt(0)}</div>
                  <div className="flex-1 text-left">
                    <div className="font-semibold">{token.ticker}</div>
                    <div className="text-sm text-gray-500">{token.name}</div>
                  </div>
                  <div className="text-right text-sm text-gray-500">{getTokenBalance(token)}</div>
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
