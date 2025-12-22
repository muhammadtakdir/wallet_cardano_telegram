import CryptoJS from "crypto-js";
import {
  getStorageItem,
  setStorageItem,
  removeStorageItem,
  generateWalletId,
  addWalletToList,
  removeWalletFromList,
  getWalletsList,
  setActiveWalletId,
  getActiveWalletId,
  type StoredWalletInfo,
} from "./index";

/**
 * Encrypted wallet data structure
 */
export interface EncryptedWalletData {
  encryptedMnemonic: string;
  salt: string;
  iv: string;
  timestamp: number;
  version: number;
  pinHash: string;
}

/**
 * Storage key for individual wallet
 */
const getWalletStorageKey = (walletId: string): string => {
  return `cardano_wallet_${walletId}`;
};

/**
 * Encryption configuration
 */
const ENCRYPTION_CONFIG = {
  keySize: 256 / 32, // 256-bit key
  iterations: 100000, // PBKDF2 iterations (high for security)
  version: 1, // For future migration support
};

/**
 * Generate a secure salt for key derivation
 */
const generateSalt = (): string => {
  return CryptoJS.lib.WordArray.random(128 / 8).toString();
};

/**
 * Generate a secure initialization vector
 */
const generateIV = (): string => {
  return CryptoJS.lib.WordArray.random(128 / 8).toString();
};

/**
 * Derive encryption key from PIN using PBKDF2
 */
const deriveKey = (pin: string, salt: string): CryptoJS.lib.WordArray => {
  return CryptoJS.PBKDF2(pin, CryptoJS.enc.Hex.parse(salt), {
    keySize: ENCRYPTION_CONFIG.keySize,
    iterations: ENCRYPTION_CONFIG.iterations,
  });
};

/**
 * Hash PIN for storage (to verify without decrypting)
 */
export const hashPin = (pin: string): string => {
  const salt = generateSalt();
  const hash = CryptoJS.PBKDF2(pin, salt, {
    keySize: 256 / 32,
    iterations: 10000, // Less iterations for quick verification
  }).toString();
  return `${salt}:${hash}`;
};

/**
 * Verify PIN against stored hash
 */
export const verifyPin = (pin: string, storedHash: string): boolean => {
  try {
    const [salt, hash] = storedHash.split(":");
    const computedHash = CryptoJS.PBKDF2(pin, salt, {
      keySize: 256 / 32,
      iterations: 10000,
    }).toString();
    return computedHash === hash;
  } catch {
    return false;
  }
};

/**
 * Encrypt and save wallet mnemonic to localStorage
 * 
 * @param mnemonic - The BIP-39 mnemonic phrase (space-separated words)
 * @param pin - User's PIN for encryption
 * @param walletAddress - The derived wallet address (for display without decryption)
 * @param walletName - Display name for the wallet
 * @param walletId - Optional wallet ID (generates new if not provided)
 * @returns The wallet ID if successful, null if failed
 */
export const encryptAndSaveWallet = (
  mnemonic: string,
  pin: string,
  walletAddress: string,
  walletName?: string,
  walletId?: string
): string | null => {
  try {
    // Generate or use provided wallet ID
    const id = walletId || generateWalletId();
    
    // Generate cryptographic values
    const salt = generateSalt();
    const iv = generateIV();

    // Derive encryption key from PIN
    const key = deriveKey(pin, salt);

    // Encrypt the mnemonic
    const encrypted = CryptoJS.AES.encrypt(mnemonic, key, {
      iv: CryptoJS.enc.Hex.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });

    // Prepare data for storage
    const encryptedData: EncryptedWalletData = {
      encryptedMnemonic: encrypted.toString(),
      salt,
      iv,
      timestamp: Date.now(),
      version: ENCRYPTION_CONFIG.version,
      pinHash: hashPin(pin),
    };

    // Store encrypted wallet data with unique key
    const storageKey = getWalletStorageKey(id);
    setStorageItem(storageKey, JSON.stringify(encryptedData));

    // Check if wallet already exists in list (for updates)
    const existingWallets = getWalletsList();
    const existingWallet = existingWallets.find((w) => w.id === id);
    
    if (!existingWallet) {
      // Get wallet count for default name
      const defaultName = walletName || `Wallet ${existingWallets.length + 1}`;

      // Add wallet to list
      const walletInfo: StoredWalletInfo = {
        id,
        name: defaultName,
        address: walletAddress,
        network: process.env.NEXT_PUBLIC_CARDANO_NETWORK || "preview",
        createdAt: Date.now(),
      };
      addWalletToList(walletInfo);
    }

    // Set as active wallet
    setActiveWalletId(id);

    return id;
  } catch (error) {
    console.error("Error encrypting wallet:", error);
    return null;
  }
};

/**
 * Decrypt wallet mnemonic from localStorage
 * 
 * @param pin - User's PIN for decryption
 * @param walletId - The wallet ID to decrypt (uses active wallet if not provided)
 * @returns The decrypted mnemonic or null if failed
 */
export const decryptWallet = (pin: string, walletId?: string): string | null => {
  try {
    // Get wallet ID
    const id = walletId || getActiveWalletId();
    if (!id) {
      console.error("No wallet ID provided or active");
      return null;
    }

    // Get encrypted data from storage
    const storageKey = getWalletStorageKey(id);
    const storedData = getStorageItem(storageKey);
    if (!storedData) {
      console.error("No wallet found in storage");
      return null;
    }

    // Parse encrypted data
    const encryptedData: EncryptedWalletData = JSON.parse(storedData);

    // Verify PIN first
    if (encryptedData.pinHash && !verifyPin(pin, encryptedData.pinHash)) {
      console.error("Invalid PIN");
      return null;
    }

    // Derive the same key using stored salt
    const key = deriveKey(pin, encryptedData.salt);

    // Decrypt the mnemonic
    const decrypted = CryptoJS.AES.decrypt(
      encryptedData.encryptedMnemonic,
      key,
      {
        iv: CryptoJS.enc.Hex.parse(encryptedData.iv),
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7,
      }
    );

    // Convert to string
    const mnemonic = decrypted.toString(CryptoJS.enc.Utf8);

    // Validate decryption worked (mnemonic should not be empty)
    if (!mnemonic || mnemonic.trim().length === 0) {
      console.error("Decryption resulted in empty mnemonic - wrong PIN?");
      return null;
    }

    return mnemonic;
  } catch (error) {
    console.error("Error decrypting wallet:", error);
    return null;
  }
};

/**
 * Change wallet PIN
 * 
 * @param oldPin - Current PIN
 * @param newPin - New PIN to set
 * @param walletId - The wallet ID (uses active wallet if not provided)
 * @returns boolean indicating success
 */
export const changeWalletPin = (
  oldPin: string,
  newPin: string,
  walletId?: string
): boolean => {
  try {
    const id = walletId || getActiveWalletId();
    if (!id) return false;

    // Decrypt with old PIN
    const mnemonic = decryptWallet(oldPin, id);
    if (!mnemonic) {
      return false;
    }

    // Get wallet info from list
    const wallets = getWalletsList();
    const wallet = wallets.find((w) => w.id === id);
    if (!wallet) return false;

    // Re-encrypt with new PIN
    const result = encryptAndSaveWallet(
      mnemonic,
      newPin,
      wallet.address,
      wallet.name,
      id
    );
    return result !== null;
  } catch (error) {
    console.error("Error changing PIN:", error);
    return false;
  }
};

/**
 * Delete wallet from storage
 * 
 * @param walletId - The wallet ID to delete (uses active wallet if not provided)
 */
export const deleteWallet = (walletId?: string): void => {
  const id = walletId || getActiveWalletId();
  if (!id) return;

  // Remove encrypted data
  const storageKey = getWalletStorageKey(id);
  removeStorageItem(storageKey);

  // Remove from list
  removeWalletFromList(id);

  // If this was the active wallet, set another one as active
  const wallets = getWalletsList();
  if (wallets.length > 0) {
    setActiveWalletId(wallets[0].id);
  }
};

/**
 * Delete all wallets from storage
 */
export const deleteAllWallets = (): void => {
  const wallets = getWalletsList();
  wallets.forEach((wallet) => {
    const storageKey = getWalletStorageKey(wallet.id);
    removeStorageItem(storageKey);
  });
  removeStorageItem("cardano_wallets_list");
  removeStorageItem("cardano_active_wallet_id");
};

/**
 * Get stored wallet address without decryption
 * 
 * @param walletId - The wallet ID (uses active wallet if not provided)
 */
export const getStoredWalletAddress = (walletId?: string): string | null => {
  const id = walletId || getActiveWalletId();
  if (!id) return null;

  const wallets = getWalletsList();
  const wallet = wallets.find((w) => w.id === id);
  return wallet?.address || null;
};

/**
 * Check if PIN is set for wallet
 * 
 * @param walletId - The wallet ID (uses active wallet if not provided)
 */
export const hasPinSet = (walletId?: string): boolean => {
  const id = walletId || getActiveWalletId();
  if (!id) return false;

  const storageKey = getWalletStorageKey(id);
  const storedData = getStorageItem(storageKey);
  if (!storedData) return false;

  try {
    const encryptedData: EncryptedWalletData = JSON.parse(storedData);
    return !!encryptedData.pinHash;
  } catch {
    return false;
  }
};

/**
 * Rename wallet
 * 
 * @param walletId - The wallet ID
 * @param newName - New name for the wallet
 */
export const renameWallet = (walletId: string, newName: string): boolean => {
  const wallets = getWalletsList();
  const index = wallets.findIndex((w) => w.id === walletId);
  if (index === -1) return false;

  wallets[index].name = newName;
  setStorageItem("cardano_wallets_list", JSON.stringify(wallets));
  return true;
};

/**
 * Get wallet info by ID
 */
export const getWalletInfo = (walletId: string): StoredWalletInfo | null => {
  const wallets = getWalletsList();
  return wallets.find((w) => w.id === walletId) || null;
};
