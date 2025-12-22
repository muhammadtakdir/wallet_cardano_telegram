"use client";

import * as React from "react";

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Application-wide providers wrapper
 * 
 * Note: MeshProvider removed as it's not needed for core wallet operations.
 * We use @meshsdk/core directly for wallet functionality.
 * MeshProvider was causing React Error #185 in some cases.
 */
export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <React.Fragment>
      {children}
    </React.Fragment>
  );
};

export default Providers;
