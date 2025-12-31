import { MeshWallet } from "@meshsdk/core";
import { getBlockfrostApiKey, getBlockfrostUrl, CardanoNetwork } from "./types";

// Lucid Evolution utilities untuk serialization (cross-platform browser/nodejs)
import { addressFromHexOrBech32 } from "@lucid-evolution/utils";

// Direct CML import for UTxO and Value serialization
let CML: any = null;
async function getCML() {
  if (CML) return CML;
  const module = await import('@lucid-evolution/lucid');
  CML = module.CML;
  return CML;
}

/**
 * Helper function to convert bech32 address to hex
 * Uses @lucid-evolution/utils addressFromHexOrBech32 which returns CML.Address
 */
function bech32ToHex(bech32Address: string): string {
  const cmlAddress = addressFromHexOrBech32(bech32Address);
  return cmlAddress.to_hex();
}

/**
 * CIP-30 Wallet API implementation for MeshWallet
 */
export class EduchainmagCIP30Provider {
  private wallet: MeshWallet;
  private networkName: CardanoNetwork;
  private networkId: number;
  private lucidInstance: any = null;

  constructor(wallet: MeshWallet, network: "mainnet" | "preview" | "preprod") {
    this.wallet = wallet;
    this.networkName = network;
    this.networkId = network === "mainnet" ? 1 : 0;
  }

  private async getLucid() {
    if (this.lucidInstance) return this.lucidInstance;

    const { Lucid, Blockfrost } = await import('@lucid-evolution/lucid');
    const apiKey = getBlockfrostApiKey(this.networkName);
    const url = getBlockfrostUrl(this.networkName);
    
    // Lucid Evolution uses Lucid() instead of Lucid.new()
    const lucid = await Lucid(
      new Blockfrost(url, apiKey),
      this.networkName === 'mainnet' ? 'Mainnet' : this.networkName === 'preprod' ? 'Preprod' : 'Preview'
    );

    const mnemonic = (this.wallet as any)._mnemonic;
    if (mnemonic) {
      // Lucid Evolution uses selectWallet.fromSeed()
      lucid.selectWallet.fromSeed(mnemonic);
    }

    this.lucidInstance = lucid;
    return lucid;
  }

  async getNetworkId(): Promise<number> {
    // Return actual network ID based on configured network
    // DexHunter V3 is Mainnet-only, but we return actual value for proper wallet behavior
    // For DexHunter to work, user MUST be on mainnet (networkId = 1)
    console.log('[CIP30] getNetworkId called, returning:', this.networkId, 'for network:', this.networkName);
    return this.networkId;
  }

  async getUtxos(amount?: string, paginate?: { page: number; pageSize: number }): Promise<string[] | null> {
    try {
        console.log('[CIP30] getUtxos called...');
        const cml = await getCML();
        const lucid = await this.getLucid();
        // Use Lucid's wallet to get UTXOs (handles fetching from provider across all addresses)
        const utxos = await lucid.wallet().getUtxos();
        
        console.log('[CIP30] getUtxos: Found', utxos?.length || 0, 'UTxOs');
        
        // Convert to CBOR hex using CML directly for proper format
        const result: string[] = [];
        for (let i = 0; i < utxos.length; i++) {
          const u = utxos[i];
          try {
            console.log(`[CIP30] getUtxos: UTxO ${i} - txHash: ${u.txHash}, outputIndex: ${u.outputIndex}`);
            console.log(`[CIP30] getUtxos: UTxO ${i} - assets:`, JSON.stringify(u.assets, (k, v) => typeof v === 'bigint' ? v.toString() : v));
            
            // Build TransactionInput
            const txInput = cml.TransactionInput.new(
              cml.TransactionHash.from_hex(u.txHash),
              BigInt(u.outputIndex)
            );
            
            // Build Value (coin + optional multiasset)
            const lovelace = BigInt(u.assets.lovelace || 0);
            const assetKeys = Object.keys(u.assets).filter(k => k !== 'lovelace');
            
            // Build MultiAsset if there are native tokens
            const multiAsset = cml.MultiAsset.new();
            
            if (assetKeys.length > 0) {
              const policies = Array.from(new Set(assetKeys.map(unit => unit.slice(0, 56))));
              
              for (const policy of policies) {
                const policyUnits = assetKeys.filter(unit => unit.slice(0, 56) === policy);
                const assetsMap = cml.MapAssetNameToCoin.new();
                
                for (const unit of policyUnits) {
                  const assetNameHex = unit.slice(56);
                  const assetName = cml.AssetName.from_hex(assetNameHex);
                  assetsMap.insert(assetName, BigInt(u.assets[unit] as any));
                }
                
                multiAsset.insert_assets(cml.ScriptHash.from_hex(policy), assetsMap);
              }
            }
            
            // Create Value - use from_coin for lovelace only, or new() with multiasset
            let value: any;
            if (assetKeys.length > 0) {
              value = cml.Value.new(lovelace, multiAsset);
            } else {
              // For lovelace only, use from_coin which creates proper CBOR
              value = cml.Value.from_coin(lovelace);
            }
            
            // Build TransactionOutput
            const address = cml.Address.from_bech32(u.address);
            const txOutput = cml.TransactionOutput.new(address, value);
            
            // Build TransactionUnspentOutput (the full UTxO)
            const utxo = cml.TransactionUnspentOutput.new(txInput, txOutput);
            const cborHex = utxo.to_cbor_hex();
            
            console.log(`[CIP30] getUtxos: UTxO ${i} - CBOR hex length:`, cborHex.length);
            console.log(`[CIP30] getUtxos: UTxO ${i} - CBOR hex FULL:`, cborHex);
            
            // Debug: decode and verify the Value in TransactionOutput
            try {
              const decoded = cml.TransactionUnspentOutput.from_cbor_hex(cborHex);
              const output = decoded.output();
              const decodedValue = output.amount();
              console.log(`[CIP30] getUtxos: UTxO ${i} - Decoded Value coin:`, decodedValue.coin().toString());
              const ma = decodedValue.multi_asset();
              if (ma) {
                console.log(`[CIP30] getUtxos: UTxO ${i} - Decoded Value has multiasset: true`);
              } else {
                console.log(`[CIP30] getUtxos: UTxO ${i} - Decoded Value has multiasset: false`);
              }
            } catch (decodeErr) {
              console.error(`[CIP30] getUtxos: UTxO ${i} - Failed to decode for verification:`, decodeErr);
            }
            
            result.push(cborHex);
          } catch (e) {
            console.warn('[CIP30] getUtxos: Failed to convert UTXO:', e);
          }
        }
        console.log('[CIP30] getUtxos: Returning', result.length, 'UTxOs');
        return result;
    } catch (e) {
        console.error("[CIP30] getUtxos error:", e);
        return [];
    }
  }

  async getCollateral(): Promise<string[] | null> {
    try {
        const cml = await getCML();
        const lucid = await this.getLucid();
        const utxos = await lucid.wallet().getUtxos();
        // Simple filter for pure ADA utxo >= 2 ADA
        const collateral = utxos.find((u: any) => Object.keys(u.assets).length === 1 && u.assets.lovelace >= BigInt(2000000));
        
        if (collateral) {
            // Build TransactionInput
            const txInput = cml.TransactionInput.new(
              cml.TransactionHash.from_hex(collateral.txHash),
              BigInt(collateral.outputIndex)
            );
            
            // Build Value (only lovelace for collateral)
            const lovelace = BigInt(collateral.assets.lovelace);
            const value = cml.Value.new(lovelace);
            
            // Build TransactionOutput
            const address = cml.Address.from_bech32(collateral.address);
            const txOutput = cml.TransactionOutput.new(address, value);
            
            // Build TransactionUnspentOutput
            const utxo = cml.TransactionUnspentOutput.new(txInput, txOutput);
            return [utxo.to_cbor_hex()];
        }
        return [];
    } catch (e) {
        return [];
    }
  }

  async getBalance(): Promise<string> {
    try {
        console.log('[CIP30] getBalance called...');
        const cml = await getCML();
        const lucid = await this.getLucid();
        
        // Get all UTXOs managed by this wallet (aggregation across all addresses)
        const utxos = await lucid.wallet().getUtxos();
        
        console.log('[CIP30] getBalance: Found', utxos?.length || 0, 'UTxOs');
        
        let totalLovelace = BigInt(0);
        const totalAssets: Record<string, bigint> = {};

        for (const u of utxos) {
            // Debug: log each UTXO's assets
            console.log('[CIP30] getBalance: UTXO assets:', JSON.stringify(u.assets, (k, v) => typeof v === 'bigint' ? v.toString() : v));
            
            // Correct access to lovelace in Lucid UTXO
            totalLovelace += BigInt(u.assets.lovelace || 0);
            
            for (const [unit, qty] of Object.entries(u.assets)) {
                if (unit !== 'lovelace') {
                    totalAssets[unit] = (totalAssets[unit] || BigInt(0)) + BigInt(qty as any);
                }
            }
        }

        console.log('[CIP30] getBalance: Total lovelace:', totalLovelace.toString());
        console.log('[CIP30] getBalance: Total ADA:', Number(totalLovelace) / 1_000_000);
        console.log('[CIP30] getBalance: Total native assets count:', Object.keys(totalAssets).length);

        // Build CML.Value directly for proper CBOR serialization
        // Build MultiAsset for native tokens
        const multiAsset = cml.MultiAsset.new();
        const units = Object.keys(totalAssets);
        
        if (units.length > 0) {
            const policies = Array.from(new Set(units.map((unit) => unit.slice(0, 56))));
            
            for (const policy of policies) {
                const policyUnits = units.filter((unit) => unit.slice(0, 56) === policy);
                const assetsMap = cml.MapAssetNameToCoin.new();
                
                for (const unit of policyUnits) {
                    const assetNameHex = unit.slice(56);
                    const assetName = cml.AssetName.from_hex(assetNameHex);
                    assetsMap.insert(assetName, BigInt(totalAssets[unit]));
                }
                
                multiAsset.insert_assets(cml.ScriptHash.from_hex(policy), assetsMap);
            }
        }

        // Create Value with coin and multiasset
        const value = cml.Value.new(totalLovelace, multiAsset);
        
        // Debug: Check the Value object
        const coin = value.coin();
        const hasMultiAssets = value.has_multiassets();
        console.log('[CIP30] getBalance: Value.coin():', coin.toString());
        console.log('[CIP30] getBalance: Value.has_multiassets():', hasMultiAssets);
        
        // Use standard CBOR encoding
        const result = value.to_cbor_hex();
        console.log('[CIP30] getBalance: CBOR hex length:', result.length);
        console.log('[CIP30] getBalance: CBOR hex:', result);
        
        // Verify the CBOR can be decoded back
        try {
            const verifyValue = cml.Value.from_cbor_hex(result);
            console.log('[CIP30] getBalance: Verification - Value decoded successfully');
            console.log('[CIP30] getBalance: Verification - coin:', verifyValue.coin().toString());
        } catch (verifyErr) {
            console.error('[CIP30] getBalance: CBOR verification failed:', verifyErr);
        }
        
        return result;
    } catch (e) {
        console.error("[CIP30] getBalance error:", e);
        return "";
    }
  }

  async getUsedAddresses(): Promise<string[]> {
    try {
        const lucid = await this.getLucid();
        const addr = await lucid.wallet().address(); // Bech32
        const addrHex = bech32ToHex(addr);
        console.log('[CIP30] getUsedAddresses: bech32:', addr);
        console.log('[CIP30] getUsedAddresses: hex:', addrHex);
        return [addrHex];
    } catch (e) {
        console.error('[CIP30] getUsedAddresses error:', e);
        return [];
    }
  }

  async getUnusedAddresses(): Promise<string[]> {
    return [];
  }

  async getChangeAddress(): Promise<string> {
    try {
        const lucid = await this.getLucid();
        const addr = await lucid.wallet().address(); // Bech32
        const addrHex = bech32ToHex(addr);
        return addrHex;
    } catch {
        return "";
    }
  }

  async getRewardAddresses(): Promise<string[]> {
    try {
        const lucid = await this.getLucid();
        const addr = await lucid.wallet().rewardAddress(); // Bech32
        if (!addr) return [];
        const addrHex = bech32ToHex(addr);
        return [addrHex];
    } catch {
        return [];
    }
  }

  async signTx(tx: string, partialSign: boolean = false): Promise<string> {
    // DexHunter sends CBOR hex. Mesh signTx expects CBOR hex.
    return await this.wallet.signTx(tx, partialSign);
  }

  async signData(addr: string, payload: string): Promise<{ signature: string; key: string }> {
    return await this.wallet.signData(addr, payload);
  }

  async submitTx(tx: string): Promise<string> {
    return await this.wallet.submitTx(tx);
  }
}

/**
 * Inject the wallet into window.cardano
 */
export const injectEduchainmagWallet = (wallet: MeshWallet, network: any) => {
  if (typeof window === "undefined") return;

  const provider = new EduchainmagCIP30Provider(wallet, network);

  // Create the enabled API object that will be returned by enable()
  const enabledApi = {
    getNetworkId: async () => {
      console.log('[CIP30 API] getNetworkId called');
      const result = await provider.getNetworkId();
      console.log('[CIP30 API] getNetworkId result:', result);
      return result;
    },
    getUtxos: async (amount?: string, paginate?: any) => {
      console.log('[CIP30 API] getUtxos called, amount:', amount, 'paginate:', paginate);
      const result = await provider.getUtxos(amount, paginate);
      console.log('[CIP30 API] getUtxos result count:', result?.length || 0);
      return result;
    },
    getCollateral: async () => {
      console.log('[CIP30 API] getCollateral called');
      const result = await provider.getCollateral();
      console.log('[CIP30 API] getCollateral result:', result);
      return result;
    },
    getBalance: async () => {
      console.log('[CIP30 API] getBalance called');
      const result = await provider.getBalance();
      console.log('[CIP30 API] getBalance result length:', result?.length || 0);
      console.log('[CIP30 API] getBalance result (first 100 chars):', result?.substring(0, 100));
      return result;
    },
    getUsedAddresses: async () => {
      console.log('[CIP30 API] getUsedAddresses called');
      const result = await provider.getUsedAddresses();
      console.log('[CIP30 API] getUsedAddresses result:', result);
      return result;
    },
    getUnusedAddresses: async () => {
      console.log('[CIP30 API] getUnusedAddresses called');
      const result = await provider.getUnusedAddresses();
      return result;
    },
    getChangeAddress: async () => {
      console.log('[CIP30 API] getChangeAddress called');
      const result = await provider.getChangeAddress();
      console.log('[CIP30 API] getChangeAddress result:', result);
      return result;
    },
    getRewardAddresses: async () => {
      console.log('[CIP30 API] getRewardAddresses called');
      const result = await provider.getRewardAddresses();
      console.log('[CIP30 API] getRewardAddresses result:', result);
      return result;
    },
    signTx: async (tx: string, partialSign?: boolean) => {
      console.log('[CIP30 API] signTx called');
      return provider.signTx(tx, partialSign);
    },
    signData: async (addr: string, payload: string) => {
      console.log('[CIP30 API] signData called');
      return provider.signData(addr, payload);
    },
    submitTx: async (tx: string) => {
      console.log('[CIP30 API] submitTx called');
      return provider.submitTx(tx);
    },
  };

  const walletMetadata = {
    name: "Nami", // Masquerade as Nami for compatibility
    icon: "https://namiwallet.io/favicon.ico", 
    apiVersion: "0.1.0",
    enable: async () => {
      console.log('[CIP30] enable() called');
      return enabledApi;
    },
    isEnabled: async () => {
      console.log('[CIP30] isEnabled() called');
      return true;
    },
  };

  if (!window.cardano) {
    (window as any).cardano = {};
  }

  // Inject as nami to ensure auto-connect
  (window as any).cardano.nami = walletMetadata;
  (window as any).cardano.educhainmag = {
      ...walletMetadata,
      name: "Educhainmag Wallet",
      icon: "https://educhainmag.com/favicon.ico"
  };
  
  console.log('[CIP30] Wallet injected into window.cardano.nami');
};
