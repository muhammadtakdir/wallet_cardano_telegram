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
  deleteAllWallets,
  getStoredWalletAddress,
  hasPinSet,
  renameWallet,
  getWalletInfo,
} from "@/lib/storage/encryption";
import {
  hasStoredWallet,
  getWalletsList,
  getActiveWalletId,
  setActiveWalletId,
  type StoredWalletInfo,
} from "@/lib/storage";

/**
 * Wallet state interface
 */
export interface WalletState {
  // Authentication state
  isLoggedIn: boolean;
  isLoading: boolean;
  error: string | null;

  // Multi-wallet support
  wallets: StoredWalletInfo[];
  activeWalletId: string | null;

  // Current wallet data
  walletAddress: string | null;
  walletName: string | null;
  balance: WalletBalance | null;
  transactions: TransactionInfo[];
  network: CardanoNetwork;

  // Internal wallet instance (not persisted)
  _walletInstance: MeshWallet | null;

  // Actions
  createNewWallet: (pin: string, name?: string, wordCount?: 12 | 15 | 18 | 21 | 24) => Promise<string>;
  importWallet: (mnemonic: string, pin: string, name?: string) => Promise<boolean>;
  unlockWallet: (pin: string, walletId?: string) => Promise<boolean>;
  lockWallet: () => void;
  switchWallet: (walletId: string, pin: string) => Promise<boolean>;
  deleteWallet: (walletId?: string) => void;
  deleteAllWallets: () => void;
  renameWallet: (walletId: string, newName: string) => boolean;
  refreshBalance: () => Promise<void>;
  refreshTransactions: () => Promise<void>;
  refreshWalletsList: () => void;
  setError: (error: string | null) => void;
  clearError: () => void;
  hasStoredWallet: () => boolean;
  getWalletCount: () => number;
}

/**
 * Zustand store for wallet state management
 * 
 * This store handles:
 * - Multiple wallet creation and import
 * - Wallet switching
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
      wallets: [],
      activeWalletId: null,
      walletAddress: null,
      walletName: null,
      balance: null,
      transactions: [],
      network: (process.env.NEXT_PUBLIC_CARDANO_NETWORK as CardanoNetwork) || "preview",
      _walletInstance: null,

      /**
       * Create a new wallet with a fresh mnemonic
       * Returns the mnemonic for user backup (MUST be shown to user!)
       */
      createNewWallet: async (pin: string, name?: string, wordCount = 24) => {
        set({ isLoading: true, error: null });

        try {
          // Generate new mnemonic
          const mnemonic = generateMnemonic(wordCount);

          // Create wallet instance
          const { wallet, address, network } = await createWalletFromMnemonic(mnemonic);

          // Get wallet count for default name
          const existingWallets = getWalletsList();
          const walletName = name || `Wallet ${existingWallets.length + 1}`;

          // Encrypt and save to localStorage
          const walletId = encryptAndSaveWallet(mnemonic, pin, address, walletName);
          if (!walletId) {
            throw new Error("Failed to save wallet securely");
          }

          // Get initial balance
          const balance = await getWalletBalance(wallet);

          // Refresh wallets list
          const wallets = getWalletsList();

          set({
            isLoggedIn: true,
            isLoading: false,
            wallets,
            activeWalletId: walletId,
            walletAddress: address,
            walletName,
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
      importWallet: async (mnemonic: string, pin: string, name?: string) => {
        set({ isLoading: true, error: null });

        try {
          // Normalize and validate mnemonic
          const normalizedMnemonic = normalizeMnemonic(mnemonic);
          if (!validateMnemonic(normalizedMnemonic)) {
            throw new Error("Invalid mnemonic phrase. Please check your words.");
          }

          // Create wallet instance
          const { wallet, address, network } = await createWalletFromMnemonic(normalizedMnemonic);

          // Get wallet count for default name
          const existingWallets = getWalletsList();
          const walletName = name || `Wallet ${existingWallets.length + 1}`;

          // Encrypt and save to localStorage
          const walletId = encryptAndSaveWallet(normalizedMnemonic, pin, address, walletName);
          if (!walletId) {
            throw new Error("Failed to save wallet securely");
          }

          // Get initial balance
          const balance = await getWalletBalance(wallet);

          // Get transaction history
          const transactions = await getTransactionHistory(address);

          // Refresh wallets list
          const wallets = getWalletsList();

          set({
            isLoggedIn: true,
            isLoading: false,
            wallets,
            activeWalletId: walletId,
            walletAddress: address,
            walletName,
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
      unlockWallet: async (pin: string, walletId?: string) => {
        set({ isLoading: true, error: null });

        try {
          // Get wallet ID (use provided or active)
          const id = walletId || getActiveWalletId();
          if (!id) {
            throw new Error("No wallet to unlock");
          }

          // Set as active wallet
          setActiveWalletId(id);

          // Decrypt mnemonic from storage
          const mnemonic = decryptWallet(pin, id);
          if (!mnemonic) {
            throw new Error("Invalid PIN or wallet data corrupted");
          }

          // Create wallet instance
          const { wallet, address, network } = await createWalletFromMnemonic(mnemonic);

          // Get wallet info
          const walletInfo = getWalletInfo(id);

          // Get balance
          const balance = await getWalletBalance(wallet);

          // Get transaction history
          const transactions = await getTransactionHistory(address);

          // Refresh wallets list
          const wallets = getWalletsList();

          set({
            isLoggedIn: true,
            isLoading: false,
            wallets,
            activeWalletId: id,
            walletAddress: address,
            walletName: walletInfo?.name || null,
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
          // Keep wallets list and active wallet ID for quick unlock
        });
      },

      /**
       * Switch to a different wallet
       */
      switchWallet: async (walletId: string, pin: string) => {
        return get().unlockWallet(pin, walletId);
      },

      /**
       * Delete a specific wallet
       */
      deleteWallet: (walletId?: string) => {
        const id = walletId || get().activeWalletId;
        if (!id) return;

        // Clear storage
        deleteStoredWallet(id);

        // Refresh wallets list
        const wallets = getWalletsList();
        const newActiveId = wallets.length > 0 ? wallets[0].id : null;

        // Reset state if deleting active wallet
        if (id === get().activeWalletId) {
          set({
            isLoggedIn: false,
            wallets,
            activeWalletId: newActiveId,
            walletAddress: newActiveId ? getStoredWalletAddress(newActiveId) : null,
            walletName: newActiveId ? getWalletInfo(newActiveId)?.name || null : null,
            balance: null,
            transactions: [],
            _walletInstance: null,
          });
        } else {
          set({ wallets });
        }
      },

      /**
       * Delete all wallets
       */
      deleteAllWallets: () => {
        deleteAllWallets();
        set({
          isLoggedIn: false,
          isLoading: false,
          error: null,
          wallets: [],
          activeWalletId: null,
          walletAddress: null,
          walletName: null,
          balance: null,
          transactions: [],
          _walletInstance: null,
        });
      },

      /**
       * Rename a wallet
       */
      renameWallet: (walletId: string, newName: string) => {
        const success = renameWallet(walletId, newName);
        if (success) {
          const wallets = getWalletsList();
          set({ wallets });
          if (walletId === get().activeWalletId) {
            set({ walletName: newName });
          }
        }
        return success;
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
       * Refresh wallets list from storage
       */
      refreshWalletsList: () => {
        const wallets = getWalletsList();
        const activeId = getActiveWalletId();
        set({ 
          wallets,
          activeWalletId: activeId,
        });
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
       * Check if any wallet exists in storage
       */
      hasStoredWallet: () => {
        return hasStoredWallet();
      },

      /**
       * Get wallet count
       */
      getWalletCount: () => {
        return getWalletsList().length;
      },
    }),
    {
      name: "cardano-wallet-state",
      storage: createJSONStorage(() => localStorage),
      // Only persist non-sensitive data
      partialize: (state) => ({
        activeWalletId: state.activeWalletId,
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
  const activeWalletId = getActiveWalletId();
  const hasPIN = activeWalletId ? hasPinSet(activeWalletId) : false;
  const storedAddress = activeWalletId ? getStoredWalletAddress(activeWalletId) : null;
  const walletCount = getWalletsList().length;

  return {
    hasWallet,
    hasPIN,
    storedAddress,
    walletCount,
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
    walletName: state.walletName,
    balance: state.balance,
    network: state.network,
    wallets: state.wallets,
    activeWalletId: state.activeWalletId,
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
    switchWallet: state.switchWallet,
    deleteWallet: state.deleteWallet,
    deleteAllWallets: state.deleteAllWallets,
    renameWallet: state.renameWallet,
    refreshBalance: state.refreshBalance,
    refreshTransactions: state.refreshTransactions,
    refreshWalletsList: state.refreshWalletsList,
  }));
};
