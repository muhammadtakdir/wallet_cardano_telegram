"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useWalletStore } from "@/hooks";
import { injectEduchainmagWallet } from "@/lib/cardano/cip30";

// Import DexHunter styles
import "@dexhunterio/swaps/lib/assets/style.css";

// Dynamically import DexHunter Swap widget to avoid SSR issues
const Swap = dynamic(() => import("@dexhunterio/swaps"), { 
  ssr: false,
  loading: () => (
    <div className="flex flex-col items-center justify-center h-[500px] bg-[#0E0F12] rounded-3xl border border-gray-800">
      <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mb-4"></div>
      <p className="text-gray-500 text-sm font-medium">Loading DexHunter Aggregator...</p>
    </div>
  )
});

export interface SwapScreenProps {
  onBack: () => void;
}

export const SwapScreen: React.FC<SwapScreenProps> = ({ onBack }) => {
  const { walletAddress, _walletInstance, network } = useWalletStore();
  const [isMounted, setIsMounted] = React.useState(false);

  React.useEffect(() => {
    setIsMounted(true);
    
    // Inject internal wallet for DexHunter to find
    if (_walletInstance) {
      injectEduchainmagWallet(_walletInstance, network);
    }
  }, [_walletInstance, network]);

  if (!isMounted) return null;

  return (
    <div className="min-h-screen bg-[#0E0F12] text-white">
      {/* Header with back button */}
      <header className="flex items-center gap-4 p-4 border-b border-gray-800 bg-[#0E0F12] sticky top-0 z-50">
        <button 
          onClick={onBack} 
          className="p-2 hover:bg-gray-800 rounded-full transition-colors text-gray-400"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
        <h1 className="text-xl font-bold">Token Swap</h1>
      </header>

      <main className="flex justify-center p-2 sm:p-4 pb-20">
        <div className="w-full max-w-[450px]">
          {/* DexHunter Widget with requested configuration */}

          <Swap
            orderTypes={["SWAP", "LIMIT"]}
            defaultTokenIn="lovelace"
            defaultTokenOut="0691b2fecca1ac4f53cb6dfb00b7013e561d1f34403b957cbb5af1fa4e49474854"
            colors={{
              background: "#0E0F12",
              containers: "#191B23",
              subText: "#88919E",
              mainText: "#FFFFFF",
              buttonText: "#FFFFFF",
              accent: "#007DFF"
            }}
            theme="dark"
            swapWidth={400}
            showChart={true}
            partnerCode={process.env.NEXT_PUBLIC_DEXHUNTER_API_HEADER || process.env.DEXHUNTER_API_HEADER || ""}
            partnerName={process.env.NEXT_PUBLIC_DEXHUNTER_PARTNER_NAME || process.env.DEXHUNTER_PARTNER_NAME || ""}
            selectedWallet={"educhainmag" as any}
            onSwapSuccess={(data: any) => console.log('Swap successful:', data)}
            onSwapError={(error: any) => console.error('Swap error:', error)}
          />
          
          <div className="mt-8 px-6 text-center">
             <div className="p-4 rounded-2xl bg-[#191B23] border border-gray-800">
                <p className="text-xs text-[#88919E] mb-1">Your Wallet Address</p>
                <p className="text-[10px] font-mono text-gray-400 break-all select-all">
                  {walletAddress}
                </p>
             </div>
             <p className="text-[10px] text-[#88919E] mt-4 uppercase tracking-widest font-bold">
               Aggregated Liquidity via DexHunter Aggregator
             </p>
          </div>
        </div>
      </main>
    </div>
  );
};