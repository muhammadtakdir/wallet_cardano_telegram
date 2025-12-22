"use client";

import * as React from "react";
import { MeshProvider } from "@meshsdk/react";

interface ProvidersProps {
  children: React.ReactNode;
}

/**
 * Application-wide providers wrapper
 * 
 * Includes:
 * - MeshProvider for Cardano wallet functionality
 * - Additional providers can be added here
 */
export const Providers: React.FC<ProvidersProps> = ({ children }) => {
  return (
    <MeshProvider>
      {children}
    </MeshProvider>
  );
};

export default Providers;
