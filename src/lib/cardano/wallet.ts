
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

// ================================
// ADA HANDLE CONFIGURATION
// ================================

// ADA Handle policy IDs for different networks
const ADA_HANDLE_POLICY_IDS: Record<CardanoNetwork, string> = {
  mainnet: "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
  preprod: "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
  preview: "f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a",
};

/**
 * Check if input is an ADA Handle (starts with $)
 */
export const isAdaHandle = (input: string): boolean => {
  return input.startsWith("$") && input.length > 1 && /^[a-z0-9_.-]+$/i.test(input.slice(1));
};

/**
 * Resolve ADA Handle to Cardano address using Blockfrost
 * 
 * @param handle - ADA Handle (with or without $ prefix)
 * @returns Resolved address or null if not found
 */
export const resolveAdaHandle = async (handle: string): Promise<string | null> => {
  try {
    const network = getCurrentNetwork();
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) {
      console.warn("Blockfrost API key not set. Cannot resolve ADA Handle.");
      return null;
    }

    // Remove $ prefix if present
    const handleName = handle.startsWith("$") ? handle.slice(1) : handle;
    
    // Convert handle to hex (asset name)
    const handleHex = Buffer.from(handleName.toLowerCase()).toString("hex");
    
    // Get policy ID for current network
    const policyId = ADA_HANDLE_POLICY_IDS[network];
    
    // Build the asset unit
    const assetUnit = `${policyId}${handleHex}`;

    // Query Blockfrost for the asset addresses
    const response = await fetch(
      `${baseUrl}/assets/${assetUnit}/addresses`,
      {
        headers: { project_id: apiKey },
      }
    );

    if (!response.ok) {
      if (response.status === 404) {
        console.log(`ADA Handle ${handle} not found`);
        return null;
      }
      throw new Error(`Blockfrost API error: ${response.status}`);
    }

    const addresses = await response.json();
    
    // Return the first address that holds this handle
    if (addresses && addresses.length > 0) {
      return addresses[0].address;
    }

    return null;
  } catch (error) {
    console.error("Error resolving ADA Handle:", error);
    return null;
  }
};

/**
 * Resolve recipient input (address or ADA Handle)
 * 
 * @param input - Cardano address or ADA Handle
 * @returns Resolved address and whether it was a handle
 */
export const resolveRecipient = async (input: string): Promise<{
  address: string | null;
  isHandle: boolean;
  handleName?: string;
}> => {
  if (isAdaHandle(input)) {
    const address = await resolveAdaHandle(input);
    return {
      address,
      isHandle: true,
      handleName: input.startsWith("$") ? input : `$${input}`,
    };
  }
  
  return {
    address: input,
    isHandle: false,
  };
};

// ================================
// COLLATERAL MANAGEMENT
// ================================

// Minimum collateral amount (5 ADA recommended for most smart contracts)
const MIN_COLLATERAL_LOVELACE = "5000000"; // 5 ADA

/**
 * Check if wallet has suitable collateral UTxO
 * 
 * @param wallet - MeshWallet instance
 * @returns Collateral info or null if not available
 */
export const getCollateralUtxo = async (wallet: MeshWallet): Promise<{
  txHash: string;
  outputIndex: number;
  amount: string;
} | null> => {
  try {
    const utxos = await wallet.getUtxos();
    
    if (!utxos || utxos.length === 0) {
      return null;
    }

    // Find a suitable UTxO for collateral:
    // - Pure ADA (no native assets)
    // - Between 5-10 ADA (optimal for collateral)
    for (const utxo of utxos) {
      const hasOnlyLovelace = utxo.output.amount.length === 1 && 
                              utxo.output.amount[0].unit === "lovelace";
      
      if (hasOnlyLovelace) {
        const lovelace = BigInt(utxo.output.amount[0].quantity);
        const minCollateral = BigInt(MIN_COLLATERAL_LOVELACE);
        const maxCollateral = BigInt("10000000"); // 10 ADA
        
        if (lovelace >= minCollateral && lovelace <= maxCollateral) {
          return {
            txHash: utxo.input.txHash,
            outputIndex: utxo.input.outputIndex,
            amount: lovelace.toString(),
          };
        }
      }
    }

    // If no perfect UTxO found, look for any UTxO with only ADA >= 5 ADA
    for (const utxo of utxos) {
      const hasOnlyLovelace = utxo.output.amount.length === 1 && 
                              utxo.output.amount[0].unit === "lovelace";
      
      if (hasOnlyLovelace) {
        const lovelace = BigInt(utxo.output.amount[0].quantity);
        if (lovelace >= BigInt(MIN_COLLATERAL_LOVELACE)) {
          return {
            txHash: utxo.input.txHash,
            outputIndex: utxo.input.outputIndex,
            amount: lovelace.toString(),
          };
        }
      }
    }

    return null;
  } catch (error) {
    console.error("Error getting collateral UTxO:", error);
    return null;
  }
};

/**
 * Check if wallet can provide collateral for smart contract interactions
 * 
 * @param wallet - MeshWallet instance
 * @returns Whether collateral is available
 */
export const hasCollateral = async (wallet: MeshWallet): Promise<boolean> => {
  const collateral = await getCollateralUtxo(wallet);
  return collateral !== null;
};

/**
 * Create a collateral UTxO if none exists
 * Sends 5 ADA to self to create a clean collateral UTxO
 * 
 * @param wallet - MeshWallet instance
 * @returns Transaction result
 */
export const setupCollateral = async (wallet: MeshWallet): Promise<{
  success: boolean;
  txHash?: string;
  error?: string;
}> => {
  try {
    // Check if collateral already exists
    const existingCollateral = await getCollateralUtxo(wallet);
    if (existingCollateral) {
      return { success: true, txHash: "already_setup" };
    }

    // Get wallet address and UTxOs
    const changeAddress = await wallet.getChangeAddress();
    const utxos = await wallet.getUtxos();

    if (!utxos || utxos.length === 0) {
      return { success: false, error: "No UTxOs available" };
    }

    // Calculate total ADA balance
    let totalLovelace = BigInt(0);
    for (const utxo of utxos) {
      for (const amount of utxo.output.amount) {
        if (amount.unit === "lovelace") {
          totalLovelace += BigInt(amount.quantity);
        }
      }
    }

    // Need at least 7 ADA (5 for collateral + ~2 for fee and minimum UTxO)
    if (totalLovelace < BigInt("7000000")) {
      return { success: false, error: "Insufficient funds to setup collateral (need at least 7 ADA)" };
    }

    // Create provider for transaction builder
    const provider = createBlockfrostProvider();

    // Build transaction to send 5 ADA to self (creating collateral UTxO)
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      verbose: false,
    });

    const unsignedTx = await txBuilder
      .txOut(changeAddress, [{ unit: "lovelace", quantity: MIN_COLLATERAL_LOVELACE }])
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Sign and submit
    const signedTx = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signedTx);

    return { success: true, txHash };
  } catch (error) {
    console.error("Error setting up collateral:", error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : "Failed to setup collateral" 
    };
  }
};

/**
 * Get collateral status for dApp interactions
 */
export interface CollateralStatus {
  hasCollateral: boolean;
  collateralUtxo: {
    txHash: string;
    outputIndex: number;
    amount: string;
  } | null;
  recommendedAmount: string;
  isEnabled: boolean;
}

export const getCollateralStatus = async (wallet: MeshWallet): Promise<CollateralStatus> => {
  const collateral = await getCollateralUtxo(wallet);
  return {
    hasCollateral: collateral !== null,
    collateralUtxo: collateral,
    recommendedAmount: lovelaceToAda(MIN_COLLATERAL_LOVELACE),
    isEnabled: collateral !== null,
  };
};

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
export const createBlockfrostProvider = (network?: CardanoNetwork): BlockfrostProvider => {
  const apiKey = getBlockfrostApiKey(network);
  // const url = getBlockfrostUrl(network); // currently BlockfrostProvider takes only the key

  if (!apiKey) {
    console.warn("Blockfrost API key not configured for network. Some features may not work.");
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
  mnemonic: string,
  networkOverride?: CardanoNetwork
): Promise<CardanoWalletInstance> => {
  try {
    const network = networkOverride || getCurrentNetwork();
    const networkId = network === "mainnet" ? 1 : 0;
    // Normalize mnemonic to avoid issues with extra spaces/casing
    try {
      const { normalizeMnemonic } = await import('./mnemonic');
      mnemonic = normalizeMnemonic(String(mnemonic));
    } catch (e) {
      // ignore and continue with original mnemonic
    }

    const wallet = new MeshWallet({
      networkId,
      fetcher: createBlockfrostProvider(network),
      submitter: createBlockfrostProvider(network),
      key: {
        type: "mnemonic",
        words: String(mnemonic).trim().split(/\s+/),
      },
    });

    // Attach mnemonic to instance for backward compatibility with CSL-based flows
    try {
      (wallet as any)._mnemonic = mnemonic;
      (wallet as any).mnemonic = mnemonic;
      // Diagnostic: indicate mnemonic was attached to wallet instance (do NOT log mnemonic)
      // eslint-disable-next-line no-console
      console.info('[createWalletFromMnemonic] mnemonicAttached:', !!(wallet as any)._mnemonic, 'network:', network);
    } catch (e) {
      // ignore
    }

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
 * Get wallet transaction history with direction and amount
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

    // Fetch UTxO details for each transaction to determine direction and amount
    const transactionsWithDetails = await Promise.all(
      transactions.slice(0, 20).map(async (tx: { tx_hash: string; block_height: number; block_time: number; tx_index: number }) => {
        try {
          // Get transaction UTxOs
          const utxoResponse = await fetch(`${baseUrl}/txs/${tx.tx_hash}/utxos`, {
            headers: { project_id: apiKey },
          });
          
          if (!utxoResponse.ok) {
            return {
              hash: tx.tx_hash,
              blockHeight: tx.block_height,
              blockTime: tx.block_time,
              index: tx.tx_index,
            };
          }

          const utxoData = await utxoResponse.json();
          
          // Calculate amounts for this address
          let inputAmount = BigInt(0);
          let outputAmount = BigInt(0);
          
          // Check inputs (what this address sent)
          for (const input of utxoData.inputs || []) {
            if (input.address === address) {
              for (const amount of input.amount || []) {
                if (amount.unit === "lovelace") {
                  inputAmount += BigInt(amount.quantity);
                }
              }
            }
          }
          
          // Check outputs (what this address received)
          for (const output of utxoData.outputs || []) {
            if (output.address === address) {
              for (const amount of output.amount || []) {
                if (amount.unit === "lovelace") {
                  outputAmount += BigInt(amount.quantity);
                }
              }
            }
          }
          
          // Determine direction and net amount
          let direction: "incoming" | "outgoing" | "self" = "self";
          let netAmount = BigInt(0);
          
          if (inputAmount > BigInt(0) && outputAmount > BigInt(0)) {
            // Both input and output - could be self-send or change
            netAmount = outputAmount - inputAmount;
            if (netAmount > BigInt(0)) {
              direction = "incoming";
            } else if (netAmount < BigInt(0)) {
              direction = "outgoing";
              netAmount = -netAmount; // Make positive
            } else {
              direction = "self";
            }
          } else if (outputAmount > BigInt(0)) {
            // Only output - incoming
            direction = "incoming";
            netAmount = outputAmount;
          } else if (inputAmount > BigInt(0)) {
            // Only input - outgoing
            direction = "outgoing";
            netAmount = inputAmount;
          }
          
          // Convert to ADA (6 decimal places)
          const amountAda = (Number(netAmount) / 1_000_000).toFixed(2);
          
          return {
            hash: tx.tx_hash,
            blockHeight: tx.block_height,
            blockTime: tx.block_time,
            index: tx.tx_index,
            direction,
            amount: amountAda,
          };
        } catch (err) {
          console.error(`Error fetching UTxOs for tx ${tx.tx_hash}:`, err);
          return {
            hash: tx.tx_hash,
            blockHeight: tx.block_height,
            blockTime: tx.block_time,
            index: tx.tx_index,
          };
        }
      })
    );

    return transactionsWithDetails;
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
export const getAddressUtxos = async (address: string, network?: CardanoNetwork) => {
  try {
    const apiKey = getBlockfrostApiKey(network);
    const baseUrl = getBlockfrostUrl(network);

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

    // Create provider for transaction builder with current network
    const network = getCurrentNetwork();
    const provider = createBlockfrostProvider(network);

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
    // Create provider for transaction builder with current network
    const network = getCurrentNetwork();
    const provider = createBlockfrostProvider(network);

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
 * Multi-asset transaction output
 */
export interface MultiAssetOutput {
  unit: string;       // "lovelace" for ADA, or policyId+assetName for native assets
  quantity: string;   // Amount to send
}

/**
 * Send multiple assets in a single transaction
 * Supports ADA + multiple native assets together
 * 
 * @param wallet - MeshWallet instance
 * @param recipientAddress - Recipient's Cardano address
 * @param outputs - Array of assets to send
 * @param network - Optional network override (defaults to getCurrentNetwork())
 * @returns Transaction result with hash or error
 */
export const sendMultiAssetTransaction = async (
  wallet: MeshWallet,
  recipientAddress: string,
  outputs: MultiAssetOutput[],
  network?: CardanoNetwork
): Promise<SendTransactionResult> => {
  try {
    if (!outputs || outputs.length === 0) {
      return { success: false, error: "No assets specified to send" };
    }

    // Create provider for transaction builder with proper network
    const resolvedNetwork = network || getCurrentNetwork();
    const provider = createBlockfrostProvider(resolvedNetwork);

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

    // Separate lovelace from native assets
    let lovelaceAmount = BigInt(0);
    const nativeAssets: MultiAssetOutput[] = [];
    
    for (const output of outputs) {
      if (output.unit === "lovelace") {
        lovelaceAmount += BigInt(output.quantity);
      } else {
        nativeAssets.push(output);
      }
    }

    // Build the output amounts
    const txOutAmounts: { unit: string; quantity: string }[] = [];
    
    // Always include lovelace (for native assets, minimum ~1.5 ADA is required)
    if (nativeAssets.length > 0) {
      // If sending native assets, ensure minimum ADA for UTxO
      const minLovelace = BigInt(1500000) * BigInt(Math.max(1, nativeAssets.length)); // ~1.5 ADA per asset
      if (lovelaceAmount < minLovelace) {
        lovelaceAmount = minLovelace;
      }
    }
    
    if (lovelaceAmount > BigInt(0)) {
      txOutAmounts.push({ unit: "lovelace", quantity: lovelaceAmount.toString() });
    }
    
    // Add native assets
    for (const asset of nativeAssets) {
      txOutAmounts.push({ unit: asset.unit, quantity: asset.quantity });
    }

    // Build transaction
    const unsignedTx = await txBuilder
      .txOut(recipientAddress, txOutAmounts)
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
    console.error("Error sending multi-asset transaction:", error);
    const message = error instanceof Error ? error.message : String(error);
    
    // Parse common errors
    if (message.includes("INPUTS_EXHAUSTED") || message.includes("insufficient")) {
      return { success: false, error: "Insufficient funds for this transaction" };
    }
    if (message.includes("MIN_UTXO")) {
      return { success: false, error: "Amount below minimum UTxO requirement. Try adding more ADA." };
    }
    
    return { success: false, error: message || "Multi-asset transfer failed" };
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
    // Create provider for transaction builder with current network
    const network = getCurrentNetwork();
    const provider = createBlockfrostProvider(network);

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

// ================================
// STAKING FUNCTIONS
// ================================

// Default pool: Cardanesia [ADI] - will be searched dynamically by ticker
const DEFAULT_POOL_TICKER = "ADI";
const DEFAULT_POOL_NAME = "Cardanesia";

// ================================
// GOVERNANCE / DREP FUNCTIONS
// ================================

// Default DRep ID - Cardanesia DRep (Mainnet)
export const DEFAULT_DREP_ID = "drep1nm3mpnnvtxvlmqt7lpnskm0clhtm7ngg4pm7qklv42j5qcvhhnw";

export interface DRepInfo {
  drepId: string;
  view: string;
  url?: string;
  metadataHash?: string;
  deposit: string;
  active: boolean;
  amount: string; // Live stake
  name?: string; // Derived from metadata if available
  ticker?: string;
  image?: string; // DRep avatar/image URL (CIP-119)
  bio?: string; // DRep objectives/bio (CIP-119)
  website?: string; // DRep website URL
}

/**
 * Get DRep information from Blockfrost
 */
export const getDRepInfo = async (drepId: string): Promise<DRepInfo | null> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return null;

    // Fetch DRep details
    const response = await fetch(`${baseUrl}/governance/dreps/${drepId}`, {
      headers: { project_id: apiKey },
    });

    if (!response.ok) return null;

    const data = await response.json();
    
    // Fetch metadata from Blockfrost metadata endpoint (more reliable than direct URL fetch)
    let name = "";
    let image = "";
    let bio = "";
    let website = "";
    
    try {
      const metadataResponse = await fetch(
        `${baseUrl}/governance/dreps/${drepId}/metadata`,
        { headers: { project_id: apiKey } }
      );
      if (metadataResponse.ok) {
        const metadata = await metadataResponse.json();
        // CIP-119 compliant metadata structure
        name = metadata.givenName || metadata.name || "";
        image = metadata.image?.url || metadata.image || "";
        bio = metadata.objectives || metadata.bio || metadata.motivations || "";
        website = metadata.references?.[0]?.uri || "";
      }
    } catch (e) {
      console.warn("Failed to fetch DRep metadata from Blockfrost:", e);
    }

    // Fallback: try direct URL if Blockfrost metadata failed
    if ((!name || !image) && data.url) {
      try {
        const url = data.url.startsWith("ipfs://") 
          ? `https://ipfs.io/ipfs/${data.url.slice(7)}`
          : data.url;
        const metaResp = await fetch(url, { signal: AbortSignal.timeout(5000) });
        if (metaResp.ok) {
          const meta = await metaResp.json();
          const body = meta.body || meta;
          if (!name) name = body.givenName || body.name || "";
          if (!image) {
            const imgUrl = body.image?.url || body.image || "";
            image = imgUrl.startsWith("ipfs://") 
              ? `https://ipfs.io/ipfs/${imgUrl.slice(7)}`
              : imgUrl;
          }
          if (!bio) bio = body.objectives || body.bio || body.motivations || "";
          if (!website) website = body.references?.[0]?.uri || "";
        }
      } catch (e) {
        // Silently fail - URL fetch is just a fallback
      }
    }
    
    return {
      drepId: data.drep_id,
      view: data.hex,
      url: data.url,
      metadataHash: data.metadata_hash,
      deposit: data.deposit,
      active: data.active,
      amount: data.amount,
      name: name || undefined,
      image: image || undefined,
      bio: bio || undefined,
      website: website || undefined,
    };
  } catch (error) {
    console.warn("Error getting DRep info:", error);
    return null;
  }
};

/**
 * Search DReps (Mock implementation or limited ID lookup)
 * Real DRep search by name requires metadata indexer or specific Blockfrost endpoint
 */
export const searchDReps = async (query: string): Promise<DRepInfo[]> => {
  // If query looks like a DRep ID, try to fetch it directly
  if (query.startsWith("drep")) {
    const info = await getDRepInfo(query);
    return info ? [info] : [];
  }
  return [];
};

/**
 * Helper function to resolve IPFS URLs
 */
const resolveIpfsUrl = (url: string | undefined): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith("ipfs://")) {
    return `https://ipfs.io/ipfs/${url.slice(7)}`;
  }
  return url;
};

/**
 * Get list of DReps from Koios API with rich metadata
 * Koios often has pre-parsed metadata, making it faster and more complete
 */
export const listDRepsFromKoios = async (
  page: number = 1,
  count: number = 20
): Promise<{ dreps: DRepInfo[]; hasMore: boolean }> => {
  try {
    const network = getCurrentNetwork();
    const koiosBase = network === "mainnet" 
      ? "https://api.koios.rest/api/v1"
      : "https://preprod.koios.rest/api/v1";

    // Koios POST endpoint for DReps with filters
    const offset = (page - 1) * count;
    const response = await fetch(`${koiosBase}/drep_list?offset=${offset}&limit=${count}`, {
      method: "GET",
      headers: {
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      console.warn("Koios API error:", response.status);
      return { dreps: [], hasMore: false };
    }

    const data = await response.json();
    
    // Map Koios response to DRepInfo format
    const dreps: DRepInfo[] = (data || []).map((item: {
      drep_id?: string;
      hex?: string;
      url?: string;
      hash?: string;
      deposit?: string;
      active?: boolean;
      amount?: string;
      meta_json?: {
        body?: {
          givenName?: string;
          name?: string;
          image?: { url?: string } | string;
          objectives?: string;
          bio?: string;
          motivations?: string;
          references?: Array<{ uri?: string }>;
        };
      };
    }) => {
      const body = item.meta_json?.body;
      const imageUrl = typeof body?.image === "string" 
        ? body.image 
        : body?.image?.url;
      
      return {
        drepId: item.drep_id || "",
        view: item.hex || "",
        url: item.url,
        metadataHash: item.hash,
        deposit: item.deposit || "0",
        active: item.active ?? true,
        amount: item.amount || "0",
        name: body?.givenName || body?.name || undefined,
        image: resolveIpfsUrl(imageUrl),
        bio: body?.objectives || body?.bio || body?.motivations || undefined,
        website: body?.references?.[0]?.uri || undefined,
      };
    });

    return {
      dreps,
      hasMore: data.length === count,
    };
  } catch (error) {
    console.warn("Error listing DReps from Koios:", error);
    return { dreps: [], hasMore: false };
  }
};

/**
 * Get list of DReps from Blockfrost with pagination
 * Returns DReps sorted by voting power
 */
export const listDReps = async (
  page: number = 1,
  count: number = 20,
  order: "asc" | "desc" = "desc"
): Promise<{ dreps: DRepInfo[]; hasMore: boolean }> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return { dreps: [], hasMore: false };

    // Fetch list of DReps
    const response = await fetch(
      `${baseUrl}/governance/dreps?page=${page}&count=${count}&order=${order}`,
      { headers: { project_id: apiKey } }
    );

    if (!response.ok) return { dreps: [], hasMore: false };

    const data: Array<{ drep_id: string; hex: string }> = await response.json();
    
    // Fetch detailed info for each DRep (limit concurrent requests)
    const dreps: DRepInfo[] = [];
    
    for (const item of data) {
      const info = await getDRepInfo(item.drep_id);
      if (info) {
        dreps.push(info);
      }
    }

    return { 
      dreps, 
      hasMore: data.length === count 
    };
  } catch (error) {
    console.warn("Error listing DReps:", error);
    return { dreps: [], hasMore: false };
  }
};

/**
 * Get DRep delegators count from Blockfrost
 */
export const getDRepDelegators = async (drepId: string): Promise<number> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return 0;

    const response = await fetch(
      `${baseUrl}/governance/dreps/${drepId}/delegators?count=1`,
      { headers: { project_id: apiKey } }
    );

    if (!response.ok) return 0;

    // Blockfrost returns array, we need to get total count from headers or make another call
    // For now, we'll make a request with higher count
    const fullResponse = await fetch(
      `${baseUrl}/governance/dreps/${drepId}/delegators?count=100`,
      { headers: { project_id: apiKey } }
    );
    
    if (!fullResponse.ok) return 0;
    
    const delegators = await fullResponse.json();
    return Array.isArray(delegators) ? delegators.length : 0;
  } catch (error) {
    console.warn("Error getting DRep delegators:", error);
    return 0;
  }
};

/**
 * Stake pool information
 */
export interface StakePoolInfo {
  poolId: string;
  ticker: string;
  name: string;
  description?: string;
  homepage?: string;
  saturation: number; // percentage 0-100
  pledge: string; // lovelace
  margin: number; // percentage 0-100
  fixedCost: string; // lovelace
  activeStake: string; // lovelace
  liveStake: string; // lovelace
  blocksEpoch: number;
  blocksMinted: number;
  ros: number; // Return on Stake percentage
  delegators: number;
}

/**
 * Staking account information
 */
export interface StakingInfo {
  stakeAddress: string;
  active: boolean;
  poolId: string | null;
  drepId?: string | null;
  poolTicker?: string;
  poolName?: string;
  availableRewards: string; // lovelace
  totalWithdrawn: string; // lovelace
  controlledAmount: string; // lovelace (total staked)
}

/**
 * Epoch reward information
 */
export interface EpochReward {
  epoch: number;
  amount: string; // lovelace
  poolId: string;
}

/**
 * Get current epoch info from Blockfrost
 */
export const getCurrentEpoch = async (): Promise<{
  epoch: number;
  startTime: number;
  endTime: number;
  slotInEpoch: number;
  slotsPerEpoch: number;
} | null> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return null;

    const response = await fetch(`${baseUrl}/epochs/latest`, {
      headers: { project_id: apiKey },
    });

    if (!response.ok) return null;

    const data = await response.json();
    
    return {
      epoch: data.epoch,
      startTime: data.start_time,
      endTime: data.end_time,
      slotInEpoch: data.first_block_time,
      slotsPerEpoch: 432000, // 5 days worth of slots
    };
  } catch (error) {
    console.error("Error getting current epoch:", error);
    return null;
  }
};

/**
 * Get stake address from payment address
 */
export const getStakeAddressFromAddress = async (address: string): Promise<string | null> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return null;

    const response = await fetch(`${baseUrl}/addresses/${address}`, {
      headers: { project_id: apiKey },
    });

    if (!response.ok) return null;

    const data = await response.json();
    return data.stake_address || null;
  } catch (error) {
    console.error("Error getting stake address:", error);
    return null;
  }
};

/**
 * Get staking account information
 */
export const getStakingInfo = async (stakeAddress: string): Promise<StakingInfo | null> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return null;

    const response = await fetch(`${baseUrl}/accounts/${stakeAddress}`, {
      headers: { project_id: apiKey },
    });

    if (!response.ok) {
      if (response.status === 404) {
        // Stake address not registered yet
        return {
          stakeAddress,
          active: false,
          poolId: null,
          availableRewards: "0",
          totalWithdrawn: "0",
          controlledAmount: "0",
        };
      }
      return null;
    }

    const data = await response.json();
    
    // Get pool info if delegating
    let poolTicker: string | undefined;
    let poolName: string | undefined;
    
    if (data.pool_id) {
      const poolInfo = await getPoolInfo(data.pool_id);
      if (poolInfo) {
        poolTicker = poolInfo.ticker;
        poolName = poolInfo.name;
      }
    }

    return {
      stakeAddress,
      active: data.active,
      poolId: data.pool_id || null,
      drepId: data.drep_id || null,
      poolTicker,
      poolName,
      availableRewards: data.withdrawable_amount || "0",
      totalWithdrawn: data.withdrawals_sum || "0",
      controlledAmount: data.controlled_amount || "0",
    };
  } catch (error) {
    console.error("Error getting staking info:", error);
    return null;
  }
};

/**
 * Get stake pool information
 */
export const getPoolInfo = async (poolId: string): Promise<StakePoolInfo | null> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return null;

    // Get pool metadata and info in parallel
    const [poolResponse, metadataResponse] = await Promise.all([
      fetch(`${baseUrl}/pools/${poolId}`, {
        headers: { project_id: apiKey },
      }),
      fetch(`${baseUrl}/pools/${poolId}/metadata`, {
        headers: { project_id: apiKey },
      }),
    ]);

    if (!poolResponse.ok) return null;

    const poolData = await poolResponse.json();
    let metadata: { ticker?: string; name?: string; description?: string; homepage?: string } = {};
    
    if (metadataResponse.ok) {
      metadata = await metadataResponse.json();
    }

    return {
      poolId,
      ticker: metadata.ticker || "Unknown",
      name: metadata.name || "Unknown Pool",
      description: metadata.description,
      homepage: metadata.homepage,
      saturation: poolData.live_saturation ? parseFloat(poolData.live_saturation) * 100 : 0,
      pledge: poolData.declared_pledge || "0",
      margin: poolData.margin_cost ? parseFloat(poolData.margin_cost) * 100 : 0,
      fixedCost: poolData.fixed_cost || "340000000",
      activeStake: poolData.active_stake || "0",
      liveStake: poolData.live_stake || "0",
      blocksEpoch: poolData.blocks_epoch || 0,
      blocksMinted: poolData.blocks_minted || 0,
      ros: 0, // Will calculate from rewards history
      delegators: poolData.live_delegators || 0,
    };
  } catch (error) {
    console.error("Error getting pool info:", error);
    return null;
  }
};

/**
 * Search stake pools by ticker or name
 */
export const searchPools = async (query: string): Promise<StakePoolInfo[]> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey || !query) return [];

    const searchLower = query.toLowerCase().trim();

    // 1. Direct Pool ID lookup
    if (searchLower.startsWith("pool1") && searchLower.length > 50) {
      const pool = await getPoolInfo(searchLower);
      return pool ? [pool] : [];
    }

    // 2. Search top pools (fetching more candidates, parallel processing)
    // We fetch top 100 pools to have a decent candidate set
    const response = await fetch(`${baseUrl}/pools/extended?count=100&order=desc`, {
      headers: { project_id: apiKey },
    });

    if (!response.ok) return [];

    const pools = await response.json();
    
    // Process pools in batches to avoid rate limits but improve speed
    const batchSize = 10;
    const results: StakePoolInfo[] = [];
    
    // Check first 50 pools (most relevant usually)
    const candidates = pools.slice(0, 50);
    
    for (let i = 0; i < candidates.length; i += batchSize) {
      const batch = candidates.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (pool: any) => {
          try {
            const metaResponse = await fetch(`${baseUrl}/pools/${pool.pool_id}/metadata`, {
              headers: { project_id: apiKey },
            });
            
            if (!metaResponse.ok) return null;
            
            const meta = await metaResponse.json();
            const ticker = meta.ticker?.toLowerCase() || "";
            const name = meta.name?.toLowerCase() || "";
            
            if (ticker.includes(searchLower) || name.includes(searchLower)) {
              return {
                poolId: pool.pool_id,
                ticker: meta.ticker || "Unknown",
                name: meta.name || "Unknown Pool",
                description: meta.description,
                homepage: meta.homepage,
                saturation: pool.live_saturation ? parseFloat(pool.live_saturation) * 100 : 0,
                pledge: pool.declared_pledge || "0",
                margin: pool.margin_cost ? parseFloat(pool.margin_cost) * 100 : 0,
                fixedCost: pool.fixed_cost || "340000000",
                activeStake: pool.active_stake || "0",
                liveStake: pool.live_stake || "0",
                blocksEpoch: pool.blocks_epoch || 0,
                blocksMinted: pool.blocks_minted || 0,
                ros: 0,
                delegators: pool.live_delegators || 0,
              };
            }
          } catch {
            return null;
          }
          return null;
        })
      );
      
      const found = batchResults.filter((p): p is StakePoolInfo => p !== null);
      results.push(...found);
      
      // Early exit if we found enough results
      if (results.length >= 20) break;
    }

    return results;
  } catch (error) {
    console.error("Error searching pools:", error);
    return [];
  }
};

/**
 * Get top pools (paginated) for browsing
 */
export const getTopPools = async (page: number = 1): Promise<StakePoolInfo[]> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return [];

    // Fetch pools sorted by stake (descending)
    // count=20 per page
    const response = await fetch(`${baseUrl}/pools/extended?count=20&page=${page}&order=desc`, {
      headers: { project_id: apiKey },
    });

    if (!response.ok) return [];

    const pools = await response.json();
    
    // Fetch metadata in parallel
    const poolInfos = await Promise.all(
      pools.map(async (pool: any) => {
        try {
          const metaResponse = await fetch(`${baseUrl}/pools/${pool.pool_id}/metadata`, {
            headers: { project_id: apiKey },
          });
          
          let ticker = "Unknown";
          let name = "Unknown Pool";
          let description = undefined;
          let homepage = undefined;

          if (metaResponse.ok) {
            const meta = await metaResponse.json();
            ticker = meta.ticker || ticker;
            name = meta.name || name;
            description = meta.description;
            homepage = meta.homepage;
          }

          return {
            poolId: pool.pool_id,
            ticker,
            name,
            description,
            homepage,
            saturation: pool.live_saturation ? parseFloat(pool.live_saturation) * 100 : 0,
            pledge: pool.declared_pledge || "0",
            margin: pool.margin_cost ? parseFloat(pool.margin_cost) * 100 : 0,
            fixedCost: pool.fixed_cost || "340000000",
            activeStake: pool.active_stake || "0",
            liveStake: pool.live_stake || "0",
            blocksEpoch: pool.blocks_epoch || 0,
            blocksMinted: pool.blocks_minted || 0,
            ros: 0,
            delegators: pool.live_delegators || 0,
          };
        } catch {
          return null;
        }
      })
    );

    return poolInfos.filter((p): p is StakePoolInfo => p !== null);
  } catch (error) {
    console.error("Error getting top pools:", error);
    return [];
  }
};

/**
 * Get default stake pool (Cardanesia ADI) - searches dynamically
 */
export const getDefaultPool = (): { ticker: string; name: string } => {
  return {
    ticker: DEFAULT_POOL_TICKER,
    name: DEFAULT_POOL_NAME,
  };
};

/**
 * Search for default pool (Cardanesia ADI) by ticker
 * Returns the pool info if found on current network
 */

export const findDefaultPool = async (): Promise<StakePoolInfo | null> => {
  const network = getCurrentNetwork();
  if (network === "mainnet") {
    // Always return Cardanesia [ADI] mainnet pool
    return {
      poolId: "pool1pfprlfz0ywcnewjegazz05ghgcfkvu40v6edsz6yn8w362sdjr8",
      ticker: "ADI",
      name: "Cardanesia",
      description: "Cardanesia Stake Pool [ADI]",
      homepage: "https://cardanesia.com/",
      saturation: 0,
      pledge: "0",
      margin: 0,
      fixedCost: "340000000",
      activeStake: "0",
      liveStake: "0",
      blocksEpoch: 0,
      blocksMinted: 0,
      ros: 0,
      delegators: 0,
    };
  } else {
    try {
      const pools = await searchPools(DEFAULT_POOL_TICKER);
      // Find exact ticker match
      const exactMatch = pools.find(p => p.ticker.toUpperCase() === DEFAULT_POOL_TICKER);
      return exactMatch || pools[0] || null;
    } catch (error) {
      console.error("Error finding default pool:", error);
      return null;
    }
  }
};

/**
 * Get reward history for stake address (last 5 epochs)
 */
export const getRewardHistory = async (stakeAddress: string, count: number = 5): Promise<EpochReward[]> => {
  try {
    const apiKey = getBlockfrostApiKey();
    const baseUrl = getBlockfrostUrl();

    if (!apiKey) return [];

    const response = await fetch(
      `${baseUrl}/accounts/${stakeAddress}/rewards?count=${count}&order=desc`,
      { headers: { project_id: apiKey } }
    );

    if (!response.ok) return [];

    const data = await response.json();
    
    return data.map((reward: { epoch: number; amount: string; pool_id: string }) => ({
      epoch: reward.epoch,
      amount: reward.amount,
      poolId: reward.pool_id,
    }));
  } catch (error) {
    console.error("Error getting reward history:", error);
    return [];
  }
};

/**
 * Delegate to a stake pool
 */
export const delegateToPool = async (
  wallet: MeshWallet,
  poolId: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> => {
  try {
    // Development simulation mode: return a fake successful delegation without touching network
    const simulate = process.env.NEXT_PUBLIC_SIMULATE_DELEGATION === 'true' || process.env.SIMULATE_DELEGATION === 'true';
    if (simulate) {
      const txHash = `simulated-delegate-${poolId}-${Date.now()}`;
      // eslint-disable-next-line no-console
      console.info('[delegateToPool] SIMULATED delegation active - returning fake success', { poolId, network, txHash });
      return { success: true, txHash, _debug: { simulated: true, poolId, network } };
    }
    // Prefer MeshTxBuilder-based delegation when possible
    let meshResultRef: any = null;
    try {
      const { delegateToPoolMesh } = await import('./mesh-stake');
      const meshResult = await delegateToPoolMesh(wallet, poolId, network);
      meshResultRef = meshResult;
      if (meshResult && meshResult.success) return meshResult;
      // If mesh result failed but returned an error, log it (keep meshResult for diagnostics)
      console.warn('Mesh delegation failed, result:', meshResult);
      // If configured to use Mesh-only staking, do not fallback — include mesh debug info
      const meshOnly = process.env.NEXT_PUBLIC_MESH_ONLY === 'true' || process.env.MESH_ONLY === 'true';
      if (meshOnly) {
        return {
          success: false,
          error: 'Mesh delegation failed and fallback is disabled (MESH_ONLY=true)',
          _debug: meshResult && meshResult._debug ? meshResult._debug : { meshError: meshResult && meshResult.error ? meshResult.error : 'unknown' }
        };
      }
    } catch (meshErr) {
      console.warn('Mesh delegation not available or failed:', meshErr);
    }

    // Fallback to Lucid-based delegation which uses mnemonic
    const mnemonicRaw = (wallet as any)._mnemonic || (wallet as any).mnemonic;
    if (!mnemonicRaw) {
      console.warn('[delegateToPool] Mesh failed and no mnemonic available for Lucid fallback');
      return { success: false, error: 'Mesh delegation failed and no mnemonic available for fallback', _debug: { mesh: meshResultRef } };
    }
    // Normalize and log mnemonic metadata (do NOT log the mnemonic itself)
    try {
      const { normalizeMnemonic, validateMnemonic, getMnemonicWordCount } = await import('./mnemonic');
      const normalizedMnemonic = normalizeMnemonic(String(mnemonicRaw));
      const wordCount = getMnemonicWordCount(normalizedMnemonic);
      const valid = validateMnemonic(normalizedMnemonic);
      // eslint-disable-next-line no-console
      console.info('[delegateToPool] using Lucid fallback - mnemonic wordCount:', wordCount, 'valid:', valid);
      if (!valid) {
        return { success: false, error: '[lucid-fallback] Invalid mnemonic', _debug: { wordCount, valid, mesh: meshResultRef } };
      }
      const { delegateToPoolLucid } = await import('./lucid-stake');
      const lucidResult = await delegateToPoolLucid(String(normalizedMnemonic), poolId, network);
      if (!lucidResult.success) {
        // include mesh debug for tracing
        lucidResult._debug = { ...(lucidResult._debug || {}), mesh: meshResultRef };
      }
      return lucidResult;
    } catch (lucidErr) {
      const lucidMsg = lucidErr instanceof Error ? lucidErr.message : String(lucidErr);
      // eslint-disable-next-line no-console
      console.error('[delegateToPool] Lucid fallback error:', lucidMsg);
      return {
        success: false,
        error: 'Mesh and Lucid delegation both failed',
        _debug: {
          mesh: meshResultRef,
          lucid: lucidMsg,
        },
      };
    }
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
};

/**
 * Withdraw staking rewards
 */
export const withdrawRewards = async (
  wallet: MeshWallet
): Promise<{ success: boolean; txHash?: string; error?: string; stack?: string }> => {
  try {
    const network = getCurrentNetwork();
    const provider = createBlockfrostProvider(network);
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const rewardAddresses = await wallet.getRewardAddresses();

    if (!utxos || utxos.length === 0) {
      return { success: false, error: "No UTxOs available in wallet" };
    }

    if (!rewardAddresses || rewardAddresses.length === 0) {
      return { success: false, error: "Could not get reward address" };
    }

    const rewardAddress = rewardAddresses[0];
    
    // Get available rewards
    const stakingInfo = await getStakingInfo(rewardAddress);
    
    if (!stakingInfo || stakingInfo.availableRewards === "0") {
      return { success: false, error: "No rewards available to withdraw" };
    }

    // Build withdrawal transaction
    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      verbose: false,
    });

    let unsignedTx: any;
    try {
      unsignedTx = await txBuilder
        .withdrawal(rewardAddress, stakingInfo.availableRewards)
        .changeAddress(changeAddress)
        .selectUtxosFrom(utxos)
        .complete();
    } catch (err) {
      console.error('Error building withdrawal transaction:', err);
      return { success: false, error: 'Error building withdrawal transaction: ' + (err instanceof Error ? err.message : String(err)), stack: err instanceof Error ? err.stack : undefined };
    }

    try {
        // Sign the transaction
        const signedTx = await wallet.signTx(unsignedTx);

        // Submit the transaction
        const txHash = await wallet.submitTx(signedTx);

        return { success: true, txHash };
    } catch (err) {
        console.error('Error signing/submitting withdrawal transaction:', err);
        // Try Lucid fallback if mnemonic available on wallet instance
        try {
          const mnemonic = (wallet as any)._mnemonic || (wallet as any).mnemonic;
          if (mnemonic) {
            const { withdrawRewardsLucid } = await import('./lucid-stake');
            const network = getCurrentNetwork();
            const lucidRes = await withdrawRewardsLucid(mnemonic, network);
            return lucidRes as any;
          }
        } catch (lucidErr) {
          console.warn('Lucid fallback for withdraw failed:', lucidErr);
        }

        return { success: false, error: 'Error signing/submitting withdrawal transaction: ' + (err instanceof Error ? err.message : String(err)) };
    }
  } catch (error) {
    console.error("Error withdrawing rewards:", error);
    const message = error instanceof Error ? error.message : String(error);
    
    return { success: false, error: message || "Withdrawal failed" };
  }
};
