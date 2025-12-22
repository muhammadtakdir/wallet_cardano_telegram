import CryptoJS from "crypto-js";
import {
  STORAGE_KEYS,
  getStorageItem,
  setStorageItem,
  removeStorageItem,
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
}

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
 * @returns boolean indicating success
 */
export const encryptAndSaveWallet = (
  mnemonic: string,
  pin: string,
  walletAddress: string
): boolean => {
  try {
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
    };

    // Store encrypted wallet data
    setStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET, JSON.stringify(encryptedData));

    // Store wallet address (public, for display)
    setStorageItem(STORAGE_KEYS.WALLET_ADDRESS, walletAddress);

    // Store PIN hash for verification
    setStorageItem(STORAGE_KEYS.PIN_HASH, hashPin(pin));

    // Store network
    setStorageItem(
      STORAGE_KEYS.WALLET_NETWORK,
      process.env.NEXT_PUBLIC_CARDANO_NETWORK || "preprod"
    );

    return true;
  } catch (error) {
    console.error("Error encrypting wallet:", error);
    return false;
  }
};

/**
 * Decrypt wallet mnemonic from localStorage
 * 
 * @param pin - User's PIN for decryption
 * @returns The decrypted mnemonic or null if failed
 */
export const decryptWallet = (pin: string): string | null => {
  try {
    // Get encrypted data from storage
    const storedData = getStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET);
    if (!storedData) {
      console.error("No wallet found in storage");
      return null;
    }

    // Verify PIN first
    const storedPinHash = getStorageItem(STORAGE_KEYS.PIN_HASH);
    if (storedPinHash && !verifyPin(pin, storedPinHash)) {
      console.error("Invalid PIN");
      return null;
    }

    // Parse encrypted data
    const encryptedData: EncryptedWalletData = JSON.parse(storedData);

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
 * @returns boolean indicating success
 */
export const changeWalletPin = (oldPin: string, newPin: string): boolean => {
  try {
    // Decrypt with old PIN
    const mnemonic = decryptWallet(oldPin);
    if (!mnemonic) {
      return false;
    }

    // Get wallet address
    const walletAddress = getStorageItem(STORAGE_KEYS.WALLET_ADDRESS);
    if (!walletAddress) {
      return false;
    }

    // Re-encrypt with new PIN
    return encryptAndSaveWallet(mnemonic, newPin, walletAddress);
  } catch (error) {
    console.error("Error changing PIN:", error);
    return false;
  }
};

/**
 * Delete wallet from storage
 */
export const deleteWallet = (): void => {
  removeStorageItem(STORAGE_KEYS.ENCRYPTED_WALLET);
  removeStorageItem(STORAGE_KEYS.WALLET_ADDRESS);
  removeStorageItem(STORAGE_KEYS.PIN_HASH);
  removeStorageItem(STORAGE_KEYS.WALLET_NETWORK);
  removeStorageItem(STORAGE_KEYS.LAST_SYNC);
};

/**
 * Get stored wallet address without decryption
 */
export const getStoredWalletAddress = (): string | null => {
  return getStorageItem(STORAGE_KEYS.WALLET_ADDRESS);
};

/**
 * Check if PIN is set for wallet
 */
export const hasPinSet = (): boolean => {
  return getStorageItem(STORAGE_KEYS.PIN_HASH) !== null;
};
