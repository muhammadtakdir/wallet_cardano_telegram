/**
 * Cardano Network Types
 */
export type CardanoNetwork = "mainnet" | "preprod" | "preview";

// Default DRep ID for delegation
export const DEFAULT_DREP_ID = "drep1nm3mpnnvtxvlmqt7lpnskm0clhtm7ngg4pm7qklv42j5qcvhhnw";

/**
 * Get current network from storage or environment
 */
export const getCurrentNetwork = (): CardanoNetwork => {
  // First check localStorage for user preference
  if (typeof window !== "undefined") {
    const storedNetwork = localStorage.getItem("cardano_network");
    if (storedNetwork === "mainnet" || storedNetwork === "preprod" || storedNetwork === "preview") {
      return storedNetwork;
    }
  }
  
  // Fall back to environment variable
  const network = process.env.NEXT_PUBLIC_CARDANO_NETWORK;
  if (network === "mainnet" || network === "preprod" || network === "preview") {
    return network;
  }
  return "preview"; // Default to preview for development
};

/**
 * Get Blockfrost URL based on network
 */
export const getBlockfrostUrl = (network?: CardanoNetwork): string => {
  const currentNetwork = network || getCurrentNetwork();
  const baseUrls: Record<CardanoNetwork, string> = {
    mainnet: "https://cardano-mainnet.blockfrost.io/api/v0",
    preprod: "https://cardano-preprod.blockfrost.io/api/v0",
    preview: "https://cardano-preview.blockfrost.io/api/v0",
  };
  return baseUrls[currentNetwork];
};

/**
 * Get Blockfrost API key for specific network
 */
export const getBlockfrostApiKey = (network?: CardanoNetwork): string => {
  const currentNetwork = network || getCurrentNetwork();
  
  // Check for network-specific keys first
  const networkKeys: Record<CardanoNetwork, string | undefined> = {
    mainnet: process.env.NEXT_PUBLIC_BLOCKFROST_KEY_MAINNET,
    preprod: process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD,
    preview: process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREVIEW,
  };
  
  // Return network-specific key or fall back to generic key
  return networkKeys[currentNetwork] || process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY || "";
};

/**
 * Wallet type definitions
 */
export interface WalletAsset {
  unit: string;
  quantity: string;
  fingerprint?: string;
  policyId?: string;
  assetName?: string;
  metadata?: AssetMetadata;
}

export interface AssetMetadata {
  name?: string;
  description?: string;
  ticker?: string;
  decimals?: number;
  logo?: string;
}

export interface TransactionInfo {
  hash: string;
  blockHeight?: number;
  blockTime?: number;
  slot?: number;
  index?: number;
  fees?: string;
  deposit?: string;
  size?: number;
  inputs?: TransactionUTxO[];
  outputs?: TransactionUTxO[];
  direction?: "incoming" | "outgoing" | "self";
  amount?: string; // Net ADA change
}

export interface TransactionUTxO {
  address: string;
  amount: WalletAsset[];
  txHash?: string;
  outputIndex?: number;
}

export interface WalletBalance {
  lovelace: string;
  ada: string;
  assets: WalletAsset[];
}

/**
 * Format lovelace to ADA string
 */
export const lovelaceToAda = (lovelace: string | number): string => {
  try {
    const value = typeof lovelace === "string" ? BigInt(lovelace || "0") : BigInt(lovelace || 0);
    const ada = Number(value) / 1_000_000;
    // Use fixed format to avoid locale issues
    return ada.toFixed(6);
  } catch (error) {
    console.warn("Error converting lovelace to ADA:", error);
    return "0.000000";
  }
};

/**
 * Format ADA to lovelace string
 */
export const adaToLovelace = (ada: string | number): string => {
  const value = typeof ada === "string" ? parseFloat(ada) : ada;
  return Math.floor(value * 1_000_000).toString();
};

/**
 * Shorten address for display
 */
export const shortenAddress = (address: string, chars: number = 8): string => {
  if (!address || typeof address !== "string") return "";
  if (address.length <= chars * 2 + 3) return address;
  return `${address.slice(0, chars)}...${address.slice(-chars)}`;
};

/**
 * Format timestamp to readable date
 */
export const formatTimestamp = (timestamp: number): string => {
  try {
    if (!timestamp || typeof timestamp !== "number") return "";
    return new Date(timestamp * 1000).toLocaleDateString();
  } catch (error) {
    return "";
  }
};

/**
 * Validate Cardano address format
 */
export const isValidCardanoAddress = (address: string): boolean => {
  // Basic validation - Cardano addresses start with addr (mainnet) or addr_test (testnet)
  if (!address) return false;
  
  const mainnetPrefix = address.startsWith("addr1");
  const testnetPrefix = address.startsWith("addr_test1");
  
  // Check length (Shelley addresses are typically 58-116 characters in bech32)
  const validLength = address.length >= 58 && address.length <= 120;
  
  return (mainnetPrefix || testnetPrefix) && validLength;
};

/**
 * Minimum ADA for UTxO
 */
export const MIN_ADA_UTXO = "1000000"; // 1 ADA in lovelace

/**
 * Check if amount meets minimum UTxO requirement
 */
export const meetsMinUtxo = (lovelace: string): boolean => {
  return BigInt(lovelace) >= BigInt(MIN_ADA_UTXO);
};
