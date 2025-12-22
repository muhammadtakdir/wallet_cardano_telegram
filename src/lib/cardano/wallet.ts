"use client";

import { BlockfrostProvider, MeshWallet } from "@meshsdk/core";
import {
  getBlockfrostApiKey,
  getBlockfrostUrl,
  getCurrentNetwork,
  WalletBalance,
  TransactionInfo,
  lovelaceToAda,
  type CardanoNetwork,
} from "./types";

/**
 * Wallet wrapper interface
 */
export interface CardanoWalletInstance {
  wallet: MeshWallet;
  address: string;
  network: CardanoNetwork;
}

/**
 * Create a Blockfrost provider instance
 */
export const createBlockfrostProvider = (): BlockfrostProvider => {
  const apiKey = getBlockfrostApiKey();
  const url = getBlockfrostUrl();

  if (!apiKey) {
    console.warn("Blockfrost API key not configured. Some features may not work.");
  }

  return new BlockfrostProvider(apiKey);
};

/**
 * Create a new wallet instance from mnemonic
 * 
 * @param mnemonic - BIP-39 mnemonic phrase
 * @returns Wallet instance with address and network info
 */
export const createWalletFromMnemonic = async (
  mnemonic: string
): Promise<CardanoWalletInstance> => {
  try {
    const network = getCurrentNetwork();
    const networkId = network === "mainnet" ? 1 : 0;

    const wallet = new MeshWallet({
      networkId,
      fetcher: createBlockfrostProvider(),
      submitter: createBlockfrostProvider(),
      key: {
        type: "mnemonic",
        words: mnemonic.split(" "),
      },
    });

    // Get the first address (these methods return promises in newer MeshJS versions)
    const addresses = await wallet.getUsedAddresses();
    const unusedAddresses = await wallet.getUnusedAddresses();
    const changeAddress = await wallet.getChangeAddress();
    const address = addresses[0] || unusedAddresses[0] || changeAddress;

    return {
      wallet,
      address,
      network,
    };
  } catch (error) {
    console.error("Error creating wallet from mnemonic:", error);
    throw new Error("Failed to create wallet. Please check your mnemonic.");
  }
};

/**
 * Get wallet balance
 * 
 * @param wallet - MeshWallet instance
 * @returns Wallet balance with ADA and assets
 */
export const getWalletBalance = async (
  wallet: MeshWallet
): Promise<WalletBalance> => {
  try {
    const balance = await wallet.getBalance();
    
    // Find lovelace (ADA) in balance
    const lovelaceAsset = balance.find((asset) => asset.unit === "lovelace");
    const lovelace = lovelaceAsset?.quantity || "0";
    
    // Filter out lovelace to get other assets
    const assets = balance.filter((asset) => asset.unit !== "lovelace");

    return {
      lovelace,
      ada: lovelaceToAda(lovelace),
      assets,
    };
  } catch (error) {
    console.error("Error getting wallet balance:", error);
    return {
      lovelace: "0",
      ada: "0",
      assets: [],
    };
  }
};

/**
 * Get wallet transaction history
 * 
 * @param address - Wallet address
 * @returns Array of transaction info
 */
export const getTransactionHistory = async (
  address: string
): Promise<TransactionInfo[]> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) {
      console.warn("Blockfrost API key not set. Cannot fetch transactions.");
      return [];
    }

    // Fetch transactions from Blockfrost
    const response = await fetch(
      `${baseUrl}/addresses/${address}/transactions?order=desc`,
      {
        headers: {
          project_id: apiKey,
        },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        // Address not found - likely new wallet with no transactions
        return [];
      }
      throw new Error(`Blockfrost API error: ${response.status}`);
    }

    const transactions = await response.json();

    // Map to our transaction format
    return transactions.map((tx: { tx_hash: string; block_height: number; block_time: number; tx_index: number }) => ({
      hash: tx.tx_hash,
      blockHeight: tx.block_height,
      blockTime: tx.block_time,
      index: tx.tx_index,
    }));
  } catch (error) {
    console.error("Error fetching transaction history:", error);
    return [];
  }
};

/**
 * Get detailed transaction info
 * 
 * @param txHash - Transaction hash
 * @returns Detailed transaction info
 */
export const getTransactionDetails = async (
  txHash: string
): Promise<TransactionInfo | null> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) {
      console.warn("Blockfrost API key not set.");
      return null;
    }

    const response = await fetch(`${baseUrl}/txs/${txHash}`, {
      headers: {
        project_id: apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Blockfrost API error: ${response.status}`);
    }

    const tx = await response.json();

    return {
      hash: tx.hash,
      blockHeight: tx.block_height,
      blockTime: tx.block_time,
      slot: tx.slot,
      index: tx.index,
      fees: tx.fees,
      deposit: tx.deposit,
      size: tx.size,
    };
  } catch (error) {
    console.error("Error fetching transaction details:", error);
    return null;
  }
};

/**
 * Get UTxOs for address
 */
export const getAddressUtxos = async (address: string) => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) {
      return [];
    }

    const response = await fetch(`${baseUrl}/addresses/${address}/utxos`, {
      headers: {
        project_id: apiKey,
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        return [];
      }
      throw new Error(`Blockfrost API error: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.error("Error fetching UTxOs:", error);
    return [];
  }
};

/**
 * Check if address exists on chain (has any UTxOs)
 */
export const addressExistsOnChain = async (address: string): Promise<boolean> => {
  const utxos = await getAddressUtxos(address);
  return utxos.length > 0;
};
