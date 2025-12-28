"use client";

import * as React from "react";
import { useWalletStore } from "@/hooks";
import { injectEduchainmagWallet } from "@/lib/cardano/cip30";

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Application-wide providers wrapper
 */
export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  const { _walletInstance, network } = useWalletStore();

  // Global wallet injection for dApps/Widgets
  React.useEffect(() => {
    if (_walletInstance) {
      injectEduchainmagWallet(_walletInstance, network);
    }
  }, [_walletInstance, network]);

  return (
    <React.Fragment>
      {children}
    </React.Fragment>
  );
};

export default Providers;
