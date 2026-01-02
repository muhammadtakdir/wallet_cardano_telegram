/**
 * Multi-Send (Bulk Transaction) for Cardano
 * 
 * Leverages Cardano's eUTxO model to send to multiple recipients in ONE transaction.
 * Benefits: Pay only one transaction fee for sending to 20-50 recipients.
 * 
 * Limitation: Max transaction size ~16KB, so we batch into chunks of ~40 recipients.
 */

import { Transaction, MeshWallet } from "@meshsdk/core";
import type { Asset, IInitiator } from "@meshsdk/core";

// Re-export Asset type for external use
export type { Asset };

/**
 * Recipient structure for multi-send
 */
export interface MultiSendRecipient {
  address: string;
  assets: Asset[];
}

/**
 * Result of a batch send operation
 */
export interface BatchSendResult {
  success: boolean;
  txHash?: string;
  error?: string;
  recipientCount: number;
  batchIndex: number;
}

/**
 * Result of multi-send operation
 */
export interface MultiSendResult {
  totalRecipients: number;
  totalBatches: number;
  successfulBatches: number;
  failedBatches: number;
  results: BatchSendResult[];
  totalFees?: string;
}

// Safe batch size to stay under 16KB transaction limit
const BATCH_SIZE = 40;

// Use MeshWallet type directly for compatibility
type WalletInstance = MeshWallet;

/**
 * Send to multiple recipients in a single transaction
 * Uses MeshJS Transaction builder
 * 
 * @param wallet - MeshWallet instance (must be connected)
 * @param recipients - Array of recipients with addresses and assets
 * @returns Transaction hash
 */
export async function sendMultiTransaction(
  wallet: WalletInstance,
  recipients: MultiSendRecipient[]
): Promise<string> {
  if (!wallet) {
    throw new Error("Wallet not connected");
  }

  if (recipients.length === 0) {
    throw new Error("No recipients provided");
  }

  if (recipients.length > BATCH_SIZE) {
    throw new Error(
      `Too many recipients (${recipients.length}). Maximum ${BATCH_SIZE} per transaction. Use sendMultiTransactionBatched for larger sends.`
    );
  }

  // Validate all recipients have valid addresses
  for (const recipient of recipients) {
    if (!recipient.address || !recipient.address.startsWith("addr")) {
      throw new Error(`Invalid address: ${recipient.address}`);
    }
    if (!recipient.assets || recipient.assets.length === 0) {
      throw new Error(`No assets specified for ${recipient.address}`);
    }
  }

  try {
    // Initialize transaction with the wallet as initiator
    const tx = new Transaction({ initiator: wallet });

    // Add all recipients to the SAME transaction
    // This creates multiple outputs but only one transaction fee
    for (const recipient of recipients) {
      tx.sendAssets(recipient.address, recipient.assets);
    }

    // Build the transaction
    const unsignedTx = await tx.build();

    // Sign with wallet
    const signedTx = await wallet.signTx(unsignedTx);

    // Submit to network
    const txHash = await wallet.submitTx(signedTx);

    return txHash;
  } catch (error) {
    console.error("Multi-Send Error:", error);
    throw error;
  }
}

/**
 * Send to many recipients with automatic batching
 * Splits large recipient lists into chunks of BATCH_SIZE
 * 
 * @param wallet - MeshWallet instance
 * @param recipients - Array of all recipients
 * @param onBatchComplete - Callback after each batch completes
 * @returns Results of all batches
 */
export async function sendMultiTransactionBatched(
  wallet: WalletInstance,
  recipients: MultiSendRecipient[],
  onBatchComplete?: (result: BatchSendResult, progress: number) => void
): Promise<MultiSendResult> {
  const totalRecipients = recipients.length;
  const totalBatches = Math.ceil(totalRecipients / BATCH_SIZE);
  const results: BatchSendResult[] = [];

  let successfulBatches = 0;
  let failedBatches = 0;

  for (let i = 0; i < totalRecipients; i += BATCH_SIZE) {
    const batchIndex = Math.floor(i / BATCH_SIZE);
    const chunk = recipients.slice(i, i + BATCH_SIZE);

    try {
      const txHash = await sendMultiTransaction(wallet, chunk);
      
      const result: BatchSendResult = {
        success: true,
        txHash,
        recipientCount: chunk.length,
        batchIndex,
      };
      
      results.push(result);
      successfulBatches++;

      if (onBatchComplete) {
        const progress = ((batchIndex + 1) / totalBatches) * 100;
        onBatchComplete(result, progress);
      }

      // Small delay between batches to allow UTxO propagation
      if (i + BATCH_SIZE < totalRecipients) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    } catch (error) {
      const result: BatchSendResult = {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        recipientCount: chunk.length,
        batchIndex,
      };
      
      results.push(result);
      failedBatches++;

      if (onBatchComplete) {
        const progress = ((batchIndex + 1) / totalBatches) * 100;
        onBatchComplete(result, progress);
      }
    }
  }

  return {
    totalRecipients,
    totalBatches,
    successfulBatches,
    failedBatches,
    results,
  };
}

/**
 * Parse CSV content into recipient list
 * Expected format: address,amount (in ADA) per line
 * 
 * @param csvContent - Raw CSV string
 * @param unit - Asset unit (default "lovelace")
 * @param globalAmount - If provided, use this amount for all (in lovelace)
 * @returns Array of recipients
 */
export function parseCSVToRecipients(
  csvContent: string,
  unit: string = "lovelace",
  globalAmount?: string
): MultiSendRecipient[] {
  const lines = csvContent
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#")); // Skip empty and comments

  const recipients: MultiSendRecipient[] = [];

  for (const line of lines) {
    const parts = line.split(",").map((p) => p.trim());
    
    if (parts.length === 0 || !parts[0]) continue;

    const address = parts[0];
    
    // Validate address format
    if (!address.startsWith("addr")) {
      console.warn(`Skipping invalid address: ${address}`);
      continue;
    }

    let quantity: string;
    
    if (globalAmount) {
      // Use global amount (already in lovelace)
      quantity = globalAmount;
    } else if (parts.length >= 2 && parts[1]) {
      // Parse amount from CSV (assume ADA, convert to lovelace)
      const adaAmount = parseFloat(parts[1]);
      if (isNaN(adaAmount) || adaAmount <= 0) {
        console.warn(`Skipping invalid amount for ${address}: ${parts[1]}`);
        continue;
      }
      quantity = Math.floor(adaAmount * 1_000_000).toString();
    } else {
      console.warn(`No amount specified for ${address}`);
      continue;
    }

    recipients.push({
      address,
      assets: [{ unit, quantity }],
    });
  }

  return recipients;
}

/**
 * Validate recipient list before sending
 * @returns Array of validation errors (empty if valid)
 */
export function validateRecipients(recipients: MultiSendRecipient[]): string[] {
  const errors: string[] = [];

  if (recipients.length === 0) {
    errors.push("No recipients provided");
    return errors;
  }

  recipients.forEach((r, index) => {
    if (!r.address) {
      errors.push(`Recipient ${index + 1}: Address is required`);
    } else if (!r.address.startsWith("addr")) {
      errors.push(`Recipient ${index + 1}: Invalid address format`);
    }

    if (!r.assets || r.assets.length === 0) {
      errors.push(`Recipient ${index + 1}: No assets specified`);
    } else {
      r.assets.forEach((asset) => {
        const qty = BigInt(asset.quantity || "0");
        if (qty <= 0) {
          errors.push(`Recipient ${index + 1}: Amount must be greater than 0`);
        }
      });
    }
  });

  // Check for duplicate addresses
  const addresses = recipients.map((r) => r.address);
  const duplicates = addresses.filter((addr, i) => addresses.indexOf(addr) !== i);
  if (duplicates.length > 0) {
    errors.push(`Duplicate addresses found: ${[...new Set(duplicates)].join(", ")}`);
  }

  return errors;
}

/**
 * Calculate total amount being sent
 * @returns Total in lovelace as string
 */
export function calculateTotalAmount(recipients: MultiSendRecipient[]): string {
  let total = BigInt(0);
  
  for (const recipient of recipients) {
    for (const asset of recipient.assets) {
      if (asset.unit === "lovelace") {
        total += BigInt(asset.quantity);
      }
    }
  }

  return total.toString();
}

/**
 * Format lovelace to ADA string
 */
export function formatLovelaceToAda(lovelace: string): string {
  const ada = Number(lovelace) / 1_000_000;
  return ada.toLocaleString(undefined, { maximumFractionDigits: 6 });
}
