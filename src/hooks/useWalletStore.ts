"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { MeshWallet } from "@meshsdk/core";
import {
  createWalletFromMnemonic,
  getWalletBalance,
  getTransactionHistory,
  generateMnemonic,
  validateMnemonic,
  normalizeMnemonic,
  type WalletBalance,
  type TransactionInfo,
  type CardanoNetwork,
} from "@/lib/cardano";
import {
  encryptAndSaveWallet,
  decryptWallet,
  deleteWallet as deleteStoredWallet,
  getStoredWalletAddress,
  hasPinSet,
} from "@/lib/storage/encryption";
import { hasStoredWallet } from "@/lib/storage";

/**
 * Wallet state interface
 */
export interface WalletState {
  // Authentication state
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;

  // Wallet data
  walletAddress: string | null;
  balance: WalletBalance | null;
  transactions: TransactionInfo[];
  network: CardanoNetwork;

  // Internal wallet instance (not persisted)
  _walletInstance: MeshWallet | null;

  // Actions
  createNewWallet: (pin: string, wordCount?: 12 | 15 | 18 | 21 | 24) => Promise<string>;
  importWallet: (mnemonic: string, pin: string) => Promise<boolean>;
  unlockWallet: (pin: string) => Promise<boolean>;
  lockWallet: () => void;
  deleteWallet: () => void;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  setError: (error: string | null) => void;
  clearError: () => void;
  hasStoredWallet: () => boolean;
}

/**
 * Zustand store for wallet state management
 * 
 * This store handles:
 * - Wallet creation and import
 * - Wallet unlocking with PIN
 * - Balance and transaction fetching
 * - Secure state management
 */
export const useWalletStore = create<WalletState>()(
  persist(
    (set, get) => ({
      // Initial state
      isLoggedIn: false,
      isLoading: false,
      error: null,
      walletAddress: null,
      balance: null,
      transactions: [],
      network: (process.env.NEXT_PUBLIC_CARDANO_NETWORK as CardanoNetwork) || "preprod",
      _walletInstance: null,

      /**
       * Create a new wallet with a fresh mnemonic
       * Returns the mnemonic for user backup (MUST be shown to user!)
       */
      createNewWallet: async (pin: string, wordCount = 24) => {
        set({ isLoading: true, error: null });

        try {
          // Generate new mnemonic
          const mnemonic = generateMnemonic(wordCount);

          // Create wallet instance
          const { wallet, address, network } = await createWalletFromMnemonic(mnemonic);

          // Encrypt and save to localStorage
          const saved = encryptAndSaveWallet(mnemonic, pin, address);
          if (!saved) {
            throw new Error("Failed to save wallet securely");
          }

          // Get initial balance
          const balance = await getWalletBalance(wallet);

          set({
            isLoggedIn: true,
            isLoading: false,
            walletAddress: address,
            balance,
            network,
            _walletInstance: wallet,
          });

          // Return mnemonic for user to backup
          // IMPORTANT: This is the ONLY time the mnemonic is returned in plain text
          return mnemonic;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to create wallet";
          set({ isLoading: false, error: errorMessage });
          throw error;
        }
      },

      /**
       * Import existing wallet from mnemonic
       */
      importWallet: async (mnemonic: string, pin: string) => {
        set({ isLoading: true, error: null });

        try {
          // Normalize and validate mnemonic
          const normalizedMnemonic = normalizeMnemonic(mnemonic);
          if (!validateMnemonic(normalizedMnemonic)) {
            throw new Error("Invalid mnemonic phrase. Please check your words.");
          }

          // Create wallet instance
          const { wallet, address, network } = await createWalletFromMnemonic(normalizedMnemonic);

          // Encrypt and save to localStorage
          const saved = encryptAndSaveWallet(normalizedMnemonic, pin, address);
          if (!saved) {
            throw new Error("Failed to save wallet securely");
          }

          // Get initial balance
          const balance = await getWalletBalance(wallet);

          // Get transaction history
          const transactions = await getTransactionHistory(address);

          set({
            isLoggedIn: true,
            isLoading: false,
            walletAddress: address,
            balance,
            transactions,
            network,
            _walletInstance: wallet,
          });

          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to import wallet";
          set({ isLoading: false, error: errorMessage });
          return false;
        }
      },

      /**
       * Unlock wallet with PIN
       */
      unlockWallet: async (pin: string) => {
        set({ isLoading: true, error: null });

        try {
          // Decrypt mnemonic from storage
          const mnemonic = decryptWallet(pin);
          if (!mnemonic) {
            throw new Error("Invalid PIN or wallet data corrupted");
          }

          // Create wallet instance
          const { wallet, address, network } = await createWalletFromMnemonic(mnemonic);

          // Get balance
          const balance = await getWalletBalance(wallet);

          // Get transaction history
          const transactions = await getTransactionHistory(address);

          set({
            isLoggedIn: true,
            isLoading: false,
            walletAddress: address,
            balance,
            transactions,
            network,
            _walletInstance: wallet,
          });

          return true;
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : "Failed to unlock wallet";
          set({ isLoading: false, error: errorMessage });
          return false;
        }
      },

      /**
       * Lock wallet (clear sensitive data from memory)
       */
      lockWallet: () => {
        set({
          isLoggedIn: false,
          _walletInstance: null,
          // Keep address and balance for display on lock screen
        });
      },

      /**
       * Delete wallet completely
       */
      deleteWallet: () => {
        // Clear storage
        deleteStoredWallet();

        // Reset state
        set({
          isLoggedIn: false,
          isLoading: false,
          error: null,
          walletAddress: null,
          balance: null,
          transactions: [],
          _walletInstance: null,
        });
      },

      /**
       * Refresh wallet balance
       */
      refreshBalance: async () => {
        const { _walletInstance, walletAddress } = get();

        if (!_walletInstance || !walletAddress) {
          return;
        }

        try {
          const balance = await getWalletBalance(_walletInstance);
          set({ balance });
        } catch (error) {
          console.error("Error refreshing balance:", error);
        }
      },

      /**
       * Refresh transaction history
       */
      refreshTransactions: async () => {
        const { walletAddress } = get();

        if (!walletAddress) {
          return;
        }

        try {
          const transactions = await getTransactionHistory(walletAddress);
          set({ transactions });
        } catch (error) {
          console.error("Error refreshing transactions:", error);
        }
      },

      /**
       * Set error message
       */
      setError: (error: string | null) => {
        set({ error });
      },

      /**
       * Clear error message
       */
      clearError: () => {
        set({ error: null });
      },

      /**
       * Check if wallet exists in storage
       */
      hasStoredWallet: () => {
        return hasStoredWallet();
      },
    }),
    {
      name: "cardano-wallet-state",
      storage: createJSONStorage(() => localStorage),
      // Only persist non-sensitive data
      partialize: (state) => ({
        walletAddress: state.walletAddress,
        network: state.network,
        // Never persist: mnemonic, _walletInstance, PIN
      }),
    }
  )
);

/**
 * Hook to check if wallet needs setup
 */
export const useWalletStatus = () => {
  const hasWallet = hasStoredWallet();
  const hasPIN = hasPinSet();
  const storedAddress = getStoredWalletAddress();

  return {
    hasWallet,
    hasPIN,
    storedAddress,
    needsSetup: !hasWallet,
    needsUnlock: hasWallet && !hasPIN,
  };
};

/**
 * Selector for just the essential wallet data
 */
export const useWalletData = () => {
  return useWalletStore((state) => ({
    isLoggedIn: state.isLoggedIn,
    walletAddress: state.walletAddress,
    balance: state.balance,
    network: state.network,
  }));
};

/**
 * Selector for wallet actions
 */
export const useWalletActions = () => {
  return useWalletStore((state) => ({
    createNewWallet: state.createNewWallet,
    importWallet: state.importWallet,
    unlockWallet: state.unlockWallet,
    lockWallet: state.lockWallet,
    deleteWallet: state.deleteWallet,
    refreshBalance: state.refreshBalance,
    refreshTransactions: state.refreshTransactions,
  }));
};
