import { MeshWallet } from "@meshsdk/core";
import { getBlockfrostApiKey, getBlockfrostUrl, CardanoNetwork } from "./types";

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

    const { Lucid, Blockfrost } = await import('lucid-cardano');
    const apiKey = getBlockfrostApiKey(this.networkName);
    const url = getBlockfrostUrl(this.networkName);
    
    const lucid = await Lucid.new(
      new Blockfrost(url, apiKey),
      this.networkName === 'mainnet' ? 'Mainnet' : this.networkName === 'preprod' ? 'Preprod' : 'Preview'
    );

    const mnemonic = (this.wallet as any)._mnemonic;
    if (mnemonic) {
      lucid.selectWalletFromSeed(mnemonic);
    }

    this.lucidInstance = lucid;
    return lucid;
  }

  async getNetworkId(): Promise<number> {
    return this.networkId;
  }

  async getUtxos(amount?: string, paginate?: { page: number; pageSize: number }): Promise<string[] | null> {
    try {
        const lucid = await this.getLucid();
        // Use Lucid's wallet to get UTXOs (handles fetching from provider)
        const utxos = await lucid.wallet.getUtxos();
        
        // Convert to CBOR hex
        const utxosCore = utxos.map((u: any) => lucid.utils.utxoToCore(u));
        return utxosCore.map((u: any) => u.to_hex());
    } catch (e) {
        console.error("CIP30 getUtxos error:", e);
        return [];
    }
  }

  async getCollateral(): Promise<string[] | null> {
    try {
        const lucid = await this.getLucid();
        const utxos = await lucid.wallet.getUtxos();
        // Lower threshold to 2 ADA for testing (standard is 5, but 3 ADA wallet needs to work)
        const collateral = utxos.find((u: any) => Object.keys(u.assets).length === 1 && u.assets.lovelace >= BigInt(2000000));
        
        if (collateral) {
             const core = lucid.utils.utxoToCore(collateral);
             return [core.to_hex()];
        }
        return [];
    } catch (e) {
        return [];
    }
  }

  async getBalance(): Promise<string> {
    const start = Date.now();
    console.log("[CIP30] getBalance called");
    try {
        const lucid = await this.getLucid();
        console.log("[CIP30] Lucid init took:", Date.now() - start, "ms");
        
        const address = await this.wallet.getChangeAddress();
        console.log("[CIP30] Address:", address);
        
        // Use Lucid's wallet to get UTXOs (handles fetching from provider)
        const utxos = await lucid.wallet.getUtxos();
        console.log("[CIP30] UTXOs fetched:", utxos.length, "Time:", Date.now() - start, "ms");
        
        // Import CSL once
        const { C } = await import('lucid-cardano');
        
        let totalLovelace = BigInt(0);
        const totalAssets: Record<string, bigint> = {};

        for (const u of utxos) {
            totalLovelace += u.assets.lovelace;
            for (const [unit, qty] of Object.entries(u.assets)) {
                if (unit !== 'lovelace') {
                    totalAssets[unit] = (totalAssets[unit] || BigInt(0)) + (qty as bigint);
                }
            }
        }
        
        console.log("[CIP30] Total Lovelace:", totalLovelace.toString());

        // Use Lucid to construct value CBOR
        const value = C.Value.new(C.BigNum.from_str(totalLovelace.toString()));
        
        if (Object.keys(totalAssets).length > 0) {
            const multiAsset = C.MultiAsset.new();
            for (const [unit, qty] of Object.entries(totalAssets)) {
                const policyId = C.ScriptHash.from_bytes(Buffer.from(unit.slice(0, 56), 'hex'));
                const assetName = C.AssetName.new(Buffer.from(unit.slice(56), 'hex'));
                const amount = C.BigNum.from_str(qty.toString());
                multiAsset.set_asset(policyId, assetName, amount);
            }
            value.set_multiasset(multiAsset);
        }

        const hex = Buffer.from(value.to_bytes()).toString('hex');
        console.log("[CIP30] Balance Hex generated. Total time:", Date.now() - start, "ms");
        return hex;
    } catch (e) {
        console.error("CIP30 getBalance error:", e);
        // Return 0 balance on error to avoid timeout
        return "1a00000000"; // Or simplified empty value logic
    }
  }

  async getUsedAddresses(): Promise<string[]> {
    try {
        const lucid = await this.getLucid();
        const addr = await lucid.wallet.address(); // Bech32
        const { C } = await import('lucid-cardano');
        const addrHex = Buffer.from(C.Address.from_bech32(addr).to_bytes()).toString('hex');
        return [addrHex];
    } catch {
        return [];
    }
  }

  async getUnusedAddresses(): Promise<string[]> {
    return [];
  }

  async getChangeAddress(): Promise<string> {
    try {
        const lucid = await this.getLucid();
        const addr = await lucid.wallet.address(); // Bech32
        const { C } = await import('lucid-cardano');
        const addrHex = Buffer.from(C.Address.from_bech32(addr).to_bytes()).toString('hex');
        return addrHex;
    } catch {
        return "";
    }
  }

  async getRewardAddresses(): Promise<string[]> {
    try {
        const lucid = await this.getLucid();
        const addr = await lucid.wallet.rewardAddress(); // Bech32
        if (!addr) return [];
        const { C } = await import('lucid-cardano');
        const addrHex = Buffer.from(C.Address.from_bech32(addr).to_bytes()).toString('hex');
        return [addrHex];
    } catch {
        return [];
    }
  }

  async signTx(tx: string, partialSign: boolean = false): Promise<string> {
    // DexHunter sends CBOR hex. Mesh signTx expects CBOR hex.
    // Using MeshWallet for signing as it is already initialized with keys.
    // Mesh signTx returns CBOR witness set.
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

  const walletMetadata = {
    name: "Nami", // Masquerade as Nami for compatibility
    icon: "https://namiwallet.io/favicon.ico", // Use Nami icon or our own
    apiVersion: "0.1.0",
    enable: async () => provider,
    isEnabled: async () => true,
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
};
