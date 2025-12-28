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
  const { _walletInstance, network } = useWalletStore();
      const { user, initData, colorScheme } = useTelegram();
      const [isMounted, setIsMounted] = React.useState(false);
    
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
  
    if (!isMounted) return null;
  
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
  
                  <Swap
  
        
                        orderTypes={["SWAP", "LIMIT"]}
                        theme={colorScheme === "light" ? "light" : "dark"}
                                    defaultTokenIn="lovelace"
                                    defaultTokenOut="0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa4e49474854"
                                    partnerCode={process.env.NEXT_PUBLIC_DEXHUNTER_API_HEADER || process.env.DEXHUNTER_API_HEADER || ""}
                        
                        partnerName={process.env.NEXT_PUBLIC_DEXHUNTER_PARTNER_NAME || process.env.DEXHUNTER_PARTNER_NAME || "Educhainmag"}
                        selectedWallet={"nami" as any}
                        width="100%"
                        onSwapSuccess={handleSwapSuccess}
                        onSwapError={(error: any) => console.error('Swap error:', error)}
                      />
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
  