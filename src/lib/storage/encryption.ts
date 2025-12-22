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
 * Security constants for brute force protection
 */
const SECURITY_CONFIG = {
  MAX_PIN_ATTEMPTS: 5,
  LOCKOUT_DURATION_MS: 5 * 60 * 1000, // 5 minutes
  MIN_PIN_LENGTH: 6,
  MAX_PIN_LENGTH: 20,
};

/**
 * Storage keys for security tracking
 */
const SECURITY_KEYS = {
  PIN_ATTEMPTS: "cardano_pin_attempts",
  LOCKOUT_UNTIL: "cardano_lockout_until",
};

/**
 * Timing-safe string comparison to prevent timing attacks
 */
const secureCompare = (a: string, b: string): boolean => {
  if (a.length !== b.length) {
    // Still do comparison to maintain constant time
    let result = 1;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ (b.charCodeAt(i % b.length) || 0);
    }
    return false;
  }
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
};

/**
 * Check if user is locked out due to too many PIN attempts
 */
export const isLockedOut = (): boolean => {
  const lockoutUntil = getStorageItem(SECURITY_KEYS.LOCKOUT_UNTIL);
  if (!lockoutUntil) return false;
  return Date.now() < parseInt(lockoutUntil, 10);
};

/**
 * Get remaining lockout time in seconds
 */
export const getLockoutRemaining = (): number => {
  const lockoutUntil = getStorageItem(SECURITY_KEYS.LOCKOUT_UNTIL);
  if (!lockoutUntil) return 0;
  const remaining = parseInt(lockoutUntil, 10) - Date.now();
  return Math.max(0, Math.ceil(remaining / 1000));
};

/**
 * Record a failed PIN attempt
 */
const recordFailedAttempt = (): number => {
  const attempts = parseInt(getStorageItem(SECURITY_KEYS.PIN_ATTEMPTS) || "0", 10) + 1;
  setStorageItem(SECURITY_KEYS.PIN_ATTEMPTS, attempts.toString());
  
  if (attempts >= SECURITY_CONFIG.MAX_PIN_ATTEMPTS) {
    const lockoutUntil = Date.now() + SECURITY_CONFIG.LOCKOUT_DURATION_MS;
    setStorageItem(SECURITY_KEYS.LOCKOUT_UNTIL, lockoutUntil.toString());
  }
  
  return SECURITY_CONFIG.MAX_PIN_ATTEMPTS - attempts;
};

/**
 * Reset PIN attempts after successful unlock
 */
const resetPinAttempts = (): void => {
  removeStorageItem(SECURITY_KEYS.PIN_ATTEMPTS);
  removeStorageItem(SECURITY_KEYS.LOCKOUT_UNTIL);
};

/**
 * Validate PIN strength
 */
export const validatePinStrength = (pin: string): { valid: boolean; error?: string } => {
  if (!pin || typeof pin !== "string") {
    return { valid: false, error: "PIN is required" };
  }
  if (pin.length < SECURITY_CONFIG.MIN_PIN_LENGTH) {
    return { valid: false, error: `PIN must be at least ${SECURITY_CONFIG.MIN_PIN_LENGTH} characters` };
  }
  if (pin.length > SECURITY_CONFIG.MAX_PIN_LENGTH) {
    return { valid: false, error: `PIN must be at most ${SECURITY_CONFIG.MAX_PIN_LENGTH} characters` };
  }
  // Check for sequential or repeated patterns (weak PINs)
  if (/^(\d)\1+$/.test(pin)) {
    return { valid: false, error: "PIN cannot be all the same digit" };
  }
  if (/^(012345|123456|234567|345678|456789|567890|098765|987654|876543|765432|654321|543210)$/.test(pin)) {
    return { valid: false, error: "PIN cannot be a sequential pattern" };
  }
  return { valid: true };
};

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
 * Verify PIN against stored hash with timing-safe comparison
 */
export const verifyPin = (pin: string, storedHash: string): boolean => {
  try {
    const [salt, hash] = storedHash.split(":");
    if (!salt || !hash) return false;
    
    const computedHash = CryptoJS.PBKDF2(pin, salt, {
      keySize: 256 / 32,
      iterations: 10000,
    }).toString();
    
    // Use timing-safe comparison to prevent timing attacks
    return secureCompare(computedHash, hash);
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
 * @returns The decrypted mnemonic or null if failed, or "LOCKED" if too many attempts
 */
export const decryptWallet = (pin: string, walletId?: string): string | null => {
  try {
    // Check for lockout first
    if (isLockedOut()) {
      const remaining = getLockoutRemaining();
      console.error(`Account locked. Try again in ${remaining} seconds.`);
      return null;
    }

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

    // Verify PIN first with brute force protection
    if (encryptedData.pinHash && !verifyPin(pin, encryptedData.pinHash)) {
      const attemptsLeft = recordFailedAttempt();
      console.error(`Invalid PIN. ${attemptsLeft} attempts remaining.`);
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
      recordFailedAttempt();
      return null;
    }

    // Validate mnemonic format (basic check: should have valid word count)
    const wordCount = mnemonic.trim().split(/\s+/).length;
    if (![12, 15, 18, 21, 24].includes(wordCount)) {
      console.error("Decrypted data is not a valid mnemonic");
      return null;
    }

    // Reset failed attempts on successful unlock
    resetPinAttempts();

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
 * Get encrypted wallet data for verification purposes (no decryption)
 * 
 * @param walletId - The wallet ID (uses active wallet if not provided)
 * @returns Object containing pinHash for verification, or null if not found
 */
export const getStoredWalletForVerification = (walletId?: string): { pinHash: string } | null => {
  const id = walletId || getActiveWalletId();
  if (!id) return null;

  const storageKey = getWalletStorageKey(id);
  const storedData = getStorageItem(storageKey);
  if (!storedData) return null;

  try {
    const encryptedData: EncryptedWalletData = JSON.parse(storedData);
    if (!encryptedData.pinHash) return null;
    return { pinHash: encryptedData.pinHash };
  } catch {
    return null;
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
