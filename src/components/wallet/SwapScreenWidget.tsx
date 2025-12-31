"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useWalletStore, useTelegram } from "@/hooks";
import { injectEduchainmagWallet } from "@/lib/cardano/cip30";

// Import DexHunter styles
import "@dexhunterio/swaps/lib/assets/style.css";

// Dynamically import DexHunter Swap widget to avoid SSR issues
const Swap = dynamic(() => import("@dexhunterio/swaps"), { 
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-[400px] w-full bg-[#0E0F12] rounded-3xl border border-gray-800">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
      <p className="text-gray-500 text-sm font-medium">Loading Swap...</p>
    </div>
  )
});

export interface SwapScreenProps {
  onBack: () => void;
}

export const SwapScreen: React.FC<SwapScreenProps> = ({ onBack }) => {
  const { _walletInstance, network, balance } = useWalletStore();
  const { user, initData, colorScheme } = useTelegram();
  const [isMounted, setIsMounted] = React.useState(false);
  const [walletReady, setWalletReady] = React.useState(false);
  const [swapReady, setSwapReady] = React.useState(false);
  const [loadingMessage, setLoadingMessage] = React.useState("Initializing...");
  const [widgetBalanceSynced, setWidgetBalanceSynced] = React.useState(false);
  const [syncAttempts, setSyncAttempts] = React.useState(0);
  const maxSyncAttempts = 30; // Max 30 attempts (30 seconds with 1s interval)

  // Inject wallet into window.cardano BEFORE mounting DexHunter widget
  React.useEffect(() => {
    if (_walletInstance && network) {
      setLoadingMessage("Connecting wallet...");
      console.log('[SwapScreen] Injecting wallet into window.cardano...');
      injectEduchainmagWallet(_walletInstance, network);
      setWalletReady(true);
      console.log('[SwapScreen] Wallet injected successfully. Balance:', balance?.ada, 'ADA');
      
      // Pre-warm CIP30 API - call all methods so data is cached
      const prewarmCIP30 = async () => {
        try {
          const nami = (window as any).cardano?.nami;
          if (nami) {
            console.log('[SwapScreen] Pre-warming CIP30 API...');
            const api = await nami.enable();
            
            // Call all methods to ensure data is ready
            const [networkId, utxos, balance, addresses, changeAddr] = await Promise.all([
              api.getNetworkId(),
              api.getUtxos(),
              api.getBalance(),
              api.getUsedAddresses(),
              api.getChangeAddress(),
            ]);
            
            console.log('[SwapScreen] CIP30 pre-warm complete:');
            console.log('  - Network ID:', networkId);
            console.log('  - UTxOs:', utxos?.length || 0);
            console.log('  - Balance CBOR length:', balance?.length || 0);
            console.log('  - Addresses:', addresses?.length || 0);
            console.log('  - Change address length:', changeAddr?.length || 0);
          }
        } catch (err) {
          console.error('[SwapScreen] CIP30 pre-warm error:', err);
        }
      };
      prewarmCIP30();
      
      // Give DexHunter time to initialize
      setLoadingMessage("Connecting...");
      const timer = setTimeout(() => {
        setSwapReady(true);
      }, 1500);
      
      return () => clearTimeout(timer);
    }
  }, [_walletInstance, network, balance]);

  // Poll to check if CIP30 API returns correct balance (sync check)
  React.useEffect(() => {
    if (!swapReady || !balance?.lovelace || widgetBalanceSynced) return;

    const expectedLovelace = BigInt(balance.lovelace);
    console.log('[SwapScreen] Starting balance sync check. Expected lovelace:', expectedLovelace.toString());

    const checkSync = async () => {
      try {
        const nami = (window as any).cardano?.nami;
        if (!nami) {
          console.log('[SwapScreen] Nami wallet not found in window.cardano');
          return false;
        }

        const api = await nami.enable();
        const balanceCbor = await api.getBalance();
        
        if (!balanceCbor || balanceCbor.length < 10) {
          console.log('[SwapScreen] Balance CBOR is empty or too short');
          return false;
        }

        // Parse CBOR to get lovelace value
        // CBOR format: 82 (array of 2) + 1a (uint32) + 4 bytes (lovelace)
        // or just 1a + 4 bytes if only lovelace (no multiasset)
        let lovelaceHex: string;
        if (balanceCbor.startsWith('82')) {
          // Array format: [coin, multiasset]
          lovelaceHex = balanceCbor.substring(4, 12); // Skip "821a" to get 4 bytes
        } else if (balanceCbor.startsWith('1a')) {
          // Direct uint32
          lovelaceHex = balanceCbor.substring(2, 10);
        } else if (balanceCbor.startsWith('1b')) {
          // uint64
          lovelaceHex = balanceCbor.substring(2, 18);
        } else {
          console.log('[SwapScreen] Unknown CBOR format:', balanceCbor.substring(0, 20));
          return false;
        }

        const cborLovelace = BigInt('0x' + lovelaceHex);
        console.log('[SwapScreen] Sync check - CBOR lovelace:', cborLovelace.toString(), 'Expected:', expectedLovelace.toString());

        // Check if balance matches (allow small difference due to fees/timing)
        const diff = cborLovelace > expectedLovelace 
          ? cborLovelace - expectedLovelace 
          : expectedLovelace - cborLovelace;
        
        // Consider synced if difference is less than 1 ADA (1,000,000 lovelace)
        if (diff < BigInt(1000000)) {
          console.log('[SwapScreen] Balance synced! Difference:', diff.toString(), 'lovelace');
          return true;
        }

        console.log('[SwapScreen] Balance not synced yet. Difference:', diff.toString(), 'lovelace');
        return false;
      } catch (err) {
        console.error('[SwapScreen] Sync check error:', err);
        return false;
      }
    };

    const interval = setInterval(async () => {
      setSyncAttempts(prev => {
        const newAttempts = prev + 1;
        
        if (newAttempts >= maxSyncAttempts) {
          // Give up after max attempts - show widget anyway
          console.log('[SwapScreen] Max sync attempts reached, showing widget anyway');
          setWidgetBalanceSynced(true);
          setLoadingMessage("Ready");
          clearInterval(interval);
          return newAttempts;
        }

        // Update loading message with attempt count
        setLoadingMessage(`Connecting... (${newAttempts}s)`);
        return newAttempts;
      });

      const isSynced = await checkSync();
      if (isSynced) {
        setWidgetBalanceSynced(true);
        setLoadingMessage("Ready");
        clearInterval(interval);
      }
    }, 1000);

    // Initial check
    checkSync().then(isSynced => {
      if (isSynced) {
        setWidgetBalanceSynced(true);
        setLoadingMessage("Ready");
        clearInterval(interval);
      }
    });

    return () => clearInterval(interval);
  }, [swapReady, balance?.lovelace, widgetBalanceSynced]);

  React.useEffect(() => {
    setIsMounted(true);
  }, []);

  const handleSwapSuccess = (data: any) => {
    console.log('Swap successful:', data);
    if (initData) {
      fetch('/api/user/add-points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ initData, actionType: 'swap' }),
      }).catch(console.warn);
    }
  };

  // Loading screen while wallet initializes
  if (!isMounted || !walletReady || !swapReady || !widgetBalanceSynced) {
    return (
      <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col">
        <header className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-50">
          <button 
            onClick={onBack} 
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-400"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-xl font-bold">Swap</h1>
        </header>
        <main className="flex-1 flex flex-col items-center justify-center p-4">
          <div className="flex flex-col items-center justify-center h-[450px] w-full max-w-[450px] bg-white dark:bg-[#1a1b1f] rounded-3xl border border-gray-200 dark:border-gray-800 shadow-lg">
            <div className="relative mb-6">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-200 dark:border-blue-900"></div>
              <div className="absolute inset-0 animate-spin rounded-full h-16 w-16 border-t-4 border-blue-500" style={{ animationDuration: '1s' }}></div>
            </div>
            <p className="text-gray-600 dark:text-gray-300 text-lg font-medium mb-2">{loadingMessage}</p>
            {balance && (
              <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-xl">
                <p className="text-sm text-gray-500 dark:text-gray-400">Wallet Balance</p>
                <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{balance.ada} ADA</p>
                {balance.assets && balance.assets.length > 0 && (
                  <p className="text-xs text-gray-400 mt-1">+ {balance.assets.length} token(s)</p>
                )}
              </div>
            )}
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-4 text-center px-6">
              Syncing wallet balance with DexHunter...<br/>
              Please wait a moment.
            </p>
            {syncAttempts > 10 && (
              <button
                onClick={() => setWidgetBalanceSynced(true)}
                className="mt-4 px-4 py-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                Skip waiting →
              </button>
            )}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-white flex flex-col">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 sticky top-0 z-50">
        <button 
          onClick={onBack} 
          className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors text-gray-500 dark:text-gray-400"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Swap</h1>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center p-4">
        {network !== "mainnet" && (
          <div className="w-full max-w-[450px] mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl text-center">
            <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
              Note: DexHunter Swap works on Mainnet only.
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              You are currently on <b>{network}</b>. Please switch to Mainnet in settings to use Swap.
            </p>
          </div>
        )}

        <div className="w-full max-w-[450px]">
          {/* Show actual wallet balance above widget */}
          {balance && (
            <div className="mb-3 p-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center">
                    <span className="text-white font-bold text-xs">₳</span>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Available Balance</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{balance.ada} ADA</p>
                  </div>
                </div>
                {balance.assets && balance.assets.length > 0 && (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">+ {balance.assets.length} token(s)</p>
                  </div>
                )}
              </div>
            </div>
          )}
          
          <Swap
            orderTypes={["SWAP", "LIMIT"]}
            theme={colorScheme === "light" ? "light" : "dark"}
            defaultTokenIn=""
            defaultTokenOut="0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa4e49474854"
            partnerCode={process.env.NEXT_PUBLIC_DEXHUNTER_API_HEADER || process.env.DEXHUNTER_API_HEADER || ""}
            partnerName={process.env.NEXT_PUBLIC_DEXHUNTER_PARTNER_NAME || process.env.DEXHUNTER_PARTNER_NAME || "Educhainmag"}
            selectedWallet={"nami" as any}
            width="100%"
            onSwapSuccess={handleSwapSuccess}
            onSwapError={(error: any) => console.error('Swap error:', error)}
            onWalletConnect={(data: any) => {
              console.log('[DexHunter] onWalletConnect data:', data);
              console.log('[DexHunter] onWalletConnect data JSON:', JSON.stringify(data, null, 2));
            }}
          />
          
          {/* Helper note about ADA balance */}
          <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
            <p className="text-xs text-gray-500 dark:text-gray-400 text-center">
              💡 If the widget shows 0 ADA, you can still type the amount manually.
              <br/>Your actual balance is shown above.
            </p>
          </div>
          
          <style jsx global>{`
            /* Hide connect wallet button if it still appears */
            .dh-connect-wallet-button, 
            button:contains("Connect Wallet"),
            button:contains("Select Wallet") {
              display: none !important;
            }
          `}</style>
        </div>
      </main>
    </div>
  );
};