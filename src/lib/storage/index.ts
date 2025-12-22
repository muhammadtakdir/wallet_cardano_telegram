/**
 * Storage Keys used throughout the application
 */
export const STORAGE_KEYS = {
  ENCRYPTED_WALLET: "cardano_wallet_encrypted",
  WALLET_ADDRESS: "cardano_wallet_address",
  WALLET_NETWORK: "cardano_wallet_network",
  PIN_HASH: "cardano_pin_hash",
  LAST_SYNC: "cardano_last_sync",
} as const;

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
 * Clear all wallet-related data from storage
 */
export const clearWalletStorage = (): void => {
  if (!isBrowser()) return;
  
  Object.values(STORAGE_KEYS).forEach((key) => {
    removeStorageItem(key);
  });
};

/**
 * Check if wallet exists in storage
 */
export const hasStoredWallet = (): boolean => {
  return getStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET) !== null;
};
