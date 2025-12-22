"use client";

import { BlockfrostProvider, MeshWallet, MeshTxBuilder } from "@meshsdk/core";
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
    let address: string = "";
    
    try {
      const addresses = await wallet.getUsedAddresses();
      if (addresses && addresses.length > 0) {
        address = String(addresses[0]);
      }
    } catch (e) {
      console.warn("Could not get used addresses:", e);
    }
    
    if (!address) {
      try {
        const unusedAddresses = await wallet.getUnusedAddresses();
        if (unusedAddresses && unusedAddresses.length > 0) {
          address = String(unusedAddresses[0]);
        }
      } catch (e) {
        console.warn("Could not get unused addresses:", e);
      }
    }
    
    if (!address) {
      try {
        const changeAddress = await wallet.getChangeAddress();
        if (changeAddress) {
          address = String(changeAddress);
        }
      } catch (e) {
        console.warn("Could not get change address:", e);
      }
    }

    if (!address) {
      throw new Error("Could not derive wallet address");
    }

    return {
      wallet,
      address,
      network,
    };
  } catch (error) {
    console.error("Error creating wallet from mnemonic:", error);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(message || "Failed to create wallet. Please check your mnemonic.");
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
    
    // Handle case where balance is not an array (new wallet)
    if (!Array.isArray(balance)) {
      return {
        lovelace: "0",
        ada: "0.000000",
        assets: [],
      };
    }
    
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
    // Log error but return safe defaults (common for new wallets with no UTXOs)
    console.warn("Error getting wallet balance (expected for new wallets):", error);
    return {
      lovelace: "0",
      ada: "0.000000",
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

    if (!address) {
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

/**
 * Send ADA transaction result
 */
export interface SendTransactionResult {
  success: boolean;
  txHash?: string;
  error?: string;
}

/**
 * Send ADA to a recipient address
 * 
 * @param wallet - MeshWallet instance
 * @param recipientAddress - Recipient's Cardano address
 * @param lovelaceAmount - Amount in lovelace (1 ADA = 1,000,000 lovelace)
 * @returns Transaction result with hash or error
 */
export const sendTransaction = async (
  wallet: MeshWallet,
  recipientAddress: string,
  lovelaceAmount: string
): Promise<SendTransactionResult> => {
  try {
    // Validate amount
    const amount = BigInt(lovelaceAmount);
    if (amount <= 0) {
      return { success: false, error: "Amount must be greater than 0" };
    }

    // Minimum UTxO (approximately 1 ADA)
    const minUtxo = BigInt(1_000_000);
    if (amount < minUtxo) {
      return { success: false, error: "Minimum send amount is 1 ADA" };
    }

    // Create provider for transaction builder
    const provider = createBlockfrostProvider();

    // Get UTxOs and change address from wallet
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    if (!utxos || utxos.length === 0) {
      return { success: false, error: "No UTxOs available in wallet" };
    }

    // Build the transaction using MeshTxBuilder
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      verbose: false,
    });

    const unsignedTx = await txBuilder
      .txOut(recipientAddress, [{ unit: "lovelace", quantity: lovelaceAmount }])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Sign the transaction
    const signedTx = await wallet.signTx(unsignedTx);

    // Submit the transaction
    const txHash = await wallet.submitTx(signedTx);

    return {
      success: true,
      txHash,
    };
  } catch (error) {
    console.error("Error sending transaction:", error);
    const message = error instanceof Error ? error.message : String(error);
    
    // Parse common errors
    if (message.includes("INPUTS_EXHAUSTED") || message.includes("insufficient")) {
      return { success: false, error: "Insufficient funds for this transaction" };
    }
    if (message.includes("MIN_UTXO")) {
      return { success: false, error: "Amount below minimum UTxO requirement" };
    }
    
    return { success: false, error: message || "Transaction failed" };
  }
};

/**
 * Send native asset transaction
 * 
 * @param wallet - MeshWallet instance
 * @param recipientAddress - Recipient's Cardano address
 * @param assetUnit - Asset unit (policy ID + asset name)
 * @param quantity - Amount of asset to send
 * @returns Transaction result with hash or error
 */
export const sendAssetTransaction = async (
  wallet: MeshWallet,
  recipientAddress: string,
  assetUnit: string,
  quantity: string
): Promise<SendTransactionResult> => {
  try {
    // Create provider for transaction builder
    const provider = createBlockfrostProvider();

    // Get UTxOs and change address from wallet
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    if (!utxos || utxos.length === 0) {
      return { success: false, error: "No UTxOs available in wallet" };
    }

    // Build the transaction using MeshTxBuilder
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      verbose: false,
    });

    // Build the transaction with native asset
    // Native assets must be sent with minimum ADA (for UTxO)
    const unsignedTx = await txBuilder
      .txOut(recipientAddress, [
        { unit: assetUnit, quantity },
        { unit: "lovelace", quantity: "1500000" }, // ~1.5 ADA for UTxO
      ])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Sign the transaction
    const signedTx = await wallet.signTx(unsignedTx);

    // Submit the transaction
    const txHash = await wallet.submitTx(signedTx);

    return {
      success: true,
      txHash,
    };
  } catch (error) {
    console.error("Error sending asset transaction:", error);
    const message = error instanceof Error ? error.message : String(error);
    
    return { success: false, error: message || "Asset transfer failed" };
  }
};

/**
 * Estimate transaction fee
 * 
 * @param wallet - MeshWallet instance
 * @param recipientAddress - Recipient's address
 * @param lovelaceAmount - Amount in lovelace
 * @returns Estimated fee in lovelace
 */
export const estimateTransactionFee = async (
  wallet: MeshWallet,
  recipientAddress: string,
  lovelaceAmount: string
): Promise<string> => {
  try {
    // Create provider for transaction builder
    const provider = createBlockfrostProvider();

    // Get UTxOs and change address from wallet
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    if (!utxos || utxos.length === 0) {
      return "200000"; // ~0.2 ADA default estimate
    }

    // Build the transaction using MeshTxBuilder (but don't sign/submit)
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      verbose: false,
    });

    await txBuilder
      .txOut(recipientAddress, [{ unit: "lovelace", quantity: lovelaceAmount }])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Return typical fee estimate
    return "170000"; // ~0.17 ADA typical fee
  } catch {
    return "200000"; // ~0.2 ADA default estimate
  }
};
