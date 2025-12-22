/**
 * Storage Keys used throughout the application
 */
export const STORAGE_KEYS = {
  WALLETS_LIST: "cardano_wallets_list",
  ACTIVE_WALLET_ID: "cardano_active_wallet_id",
  // Legacy keys (for migration)
  ENCRYPTED_WALLET: "cardano_wallet_encrypted",
  WALLET_ADDRESS: "cardano_wallet_address",
  WALLET_NETWORK: "cardano_wallet_network",
  PIN_HASH: "cardano_pin_hash",
  LAST_SYNC: "cardano_last_sync",
} as const;

/**
 * Wallet info stored in list
 */
export interface StoredWalletInfo {
  id: string;
  name: string;
  address: string;
  network: string;
  createdAt: number;
}

/**
 * Check if we're running in browser environment
 */
export const isBrowser = (): boolean => {
  return typeof window !== "undefined";
};

/**
 * Safe localStorage getter
 */
export const getStorageItem = (key: string): string | null => {
  if (!isBrowser()) return null;
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.error(`Error getting item ${key} from localStorage:`, error);
    return null;
  }
};

/**
 * Safe localStorage setter
 */
export const setStorageItem = (key: string, value: string): boolean => {
  if (!isBrowser()) return false;
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.error(`Error setting item ${key} in localStorage:`, error);
    return false;
  }
};

/**
 * Safe localStorage remover
 */
export const removeStorageItem = (key: string): boolean => {
  if (!isBrowser()) return false;
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.error(`Error removing item ${key} from localStorage:`, error);
    return false;
  }
};

/**
 * Generate unique wallet ID
 */
export const generateWalletId = (): string => {
  return `wallet_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
};

/**
 * Get all stored wallets list
 */
export const getWalletsList = (): StoredWalletInfo[] => {
  const data = getStorageItem(STORAGE_KEYS.WALLETS_LIST);
  if (!data) return [];
  try {
    return JSON.parse(data);
  } catch {
    return [];
  }
};

/**
 * Save wallets list
 */
export const saveWalletsList = (wallets: StoredWalletInfo[]): boolean => {
  return setStorageItem(STORAGE_KEYS.WALLETS_LIST, JSON.stringify(wallets));
};

/**
 * Add wallet to list
 */
export const addWalletToList = (wallet: StoredWalletInfo): boolean => {
  const wallets = getWalletsList();
  wallets.push(wallet);
  return saveWalletsList(wallets);
};

/**
 * Remove wallet from list
 */
export const removeWalletFromList = (walletId: string): boolean => {
  const wallets = getWalletsList();
  const filtered = wallets.filter((w) => w.id !== walletId);
  return saveWalletsList(filtered);
};

/**
 * Update wallet in list
 */
export const updateWalletInList = (walletId: string, updates: Partial<StoredWalletInfo>): boolean => {
  const wallets = getWalletsList();
  const index = wallets.findIndex((w) => w.id === walletId);
  if (index === -1) return false;
  wallets[index] = { ...wallets[index], ...updates };
  return saveWalletsList(wallets);
};

/**
 * Get active wallet ID
 */
export const getActiveWalletId = (): string | null => {
  return getStorageItem(STORAGE_KEYS.ACTIVE_WALLET_ID);
};

/**
 * Set active wallet ID
 */
export const setActiveWalletId = (walletId: string): boolean => {
  return setStorageItem(STORAGE_KEYS.ACTIVE_WALLET_ID, walletId);
};

/**
 * Clear all wallet-related data from storage
 */
export const clearWalletStorage = (): void => {
  if (!isBrowser()) return;
  
  Object.values(STORAGE_KEYS).forEach((key) => {
    removeStorageItem(key);
  });
};

/**
 * Check if any wallet exists in storage
 */
export const hasStoredWallet = (): boolean => {
  const wallets = getWalletsList();
  return wallets.length > 0;
};

/**
 * Get wallet count
 */
export const getWalletCount = (): number => {
  return getWalletsList().length;
};
