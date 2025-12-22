import * as bip39 from "bip39";

/**
 * Mnemonic word count options
 */
export type MnemonicStrength = 128 | 160 | 192 | 224 | 256;
export type MnemonicWordCount = 12 | 15 | 18 | 21 | 24;

/**
 * Map word count to bit strength
 */
const wordCountToStrength: Record<MnemonicWordCount, MnemonicStrength> = {
  12: 128,
  15: 160,
  18: 192,
  21: 224,
  24: 256,
};

/**
 * Generate a new BIP-39 mnemonic phrase
 * 
 * @param wordCount - Number of words (12, 15, 18, 21, or 24)
 * @returns The generated mnemonic phrase
 */
export const generateMnemonic = (wordCount: MnemonicWordCount = 24): string => {
  const strength = wordCountToStrength[wordCount];
  return bip39.generateMnemonic(strength);
};

/**
 * Validate a BIP-39 mnemonic phrase
 * 
 * @param mnemonic - The mnemonic phrase to validate
 * @returns boolean indicating if mnemonic is valid
 */
export const validateMnemonic = (mnemonic: string): boolean => {
  if (!mnemonic || typeof mnemonic !== "string") {
    return false;
  }

  // Normalize the mnemonic (trim and lowercase)
  const normalized = mnemonic.trim().toLowerCase();

  // Check word count
  const words = normalized.split(/\s+/);
  const validWordCounts = [12, 15, 18, 21, 24];
  if (!validWordCounts.includes(words.length)) {
    return false;
  }

  // Validate using bip39 library
  return bip39.validateMnemonic(normalized);
};

/**
 * Get word count from mnemonic
 */
export const getMnemonicWordCount = (mnemonic: string): number => {
  return mnemonic.trim().split(/\s+/).length;
};

/**
 * Convert mnemonic to entropy (for advanced use)
 */
export const mnemonicToEntropy = (mnemonic: string): string => {
  return bip39.mnemonicToEntropy(mnemonic);
};

/**
 * Convert entropy to mnemonic (for advanced use)
 */
export const entropyToMnemonic = (entropy: string): string => {
  return bip39.entropyToMnemonic(entropy);
};

/**
 * Normalize mnemonic (trim whitespace, lowercase)
 */
export const normalizeMnemonic = (mnemonic: string): string => {
  return mnemonic
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .join(" ");
};
