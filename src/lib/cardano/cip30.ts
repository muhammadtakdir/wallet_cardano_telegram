import { MeshWallet } from "@meshsdk/core";

/**
 * CIP-30 Wallet API implementation for MeshWallet
 * This allows external components (like DexHunter widget) to interact with our internal wallet.
 */
export class EduchainmagCIP30Provider {
  private wallet: MeshWallet;
  private network: number; // 0 for testnet, 1 for mainnet

  constructor(wallet: MeshWallet, network: "mainnet" | "preview" | "preprod") {
    this.wallet = wallet;
    this.network = network === "mainnet" ? 1 : 0;
  }

  async getNetworkId(): Promise<number> {
    return this.network;
  }

  async getUtxos(amount?: string, paginate?: { page: number; pageSize: number }): Promise<string[] | null> {
    const utxos = await this.wallet.getUtxos();
    // Return CBOR encoded UTxOs (Mesh SDK provides them in a format we can use)
    // Note: Most dApps expect hex-encoded CBOR strings for UTxOs
    // Mesh's getUtxos returns UTxO objects. We need to convert them to hex CBOR.
    // For now, let's return them as they are or find a way to encode them.
    // Actually, Mesh's wallet.getUtxos() returns the objects.
    // A full CIP-30 implementation is complex, but let's try a simplified one.
    return utxos.map(utxo => {
        // This is a placeholder. Real CIP-30 needs full CBOR.
        // But some components might work with the objects if they use Mesh under the hood.
        return (utxo as any).cbor || ""; 
    }).filter(c => !!c);
  }

  async getCollateral(): Promise<string[] | null> {
    const utxos = await this.wallet.getUtxos();
    // Find a suitable collateral UTxO
    const collateral = utxos.find(u => u.output.amount.length === 1 && u.output.amount[0].unit === "lovelace");
    return collateral ? [(collateral as any).cbor] : null;
  }

  async getBalance(): Promise<string> {
    // Should return hex encoded CBOR of the balance
    return ""; // Placeholder
  }

  async getUsedAddresses(): Promise<string[]> {
    const address = await this.wallet.getUsedAddresses();
    return address;
  }

  async getUnusedAddresses(): Promise<string[]> {
    return [];
  }

  async getChangeAddress(): Promise<string> {
    return await this.wallet.getChangeAddress();
  }

  async getRewardAddresses(): Promise<string[]> {
    return await this.wallet.getRewardAddresses();
  }

  async signTx(tx: string, partialSign: boolean = false): Promise<string> {
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

  const educhainmagWallet = {
    name: "Educhainmag",
    icon: "https://educhainmag.com/favicon.ico", // Updated icon placeholder
    apiVersion: "0.1.0",
    enable: async () => provider,
    isEnabled: async () => true,
  };

  if (!window.cardano) {
    (window as any).cardano = {};
  }

  (window as any).cardano.educhainmag = educhainmagWallet;
  
  // Also set it as the default if requested or if no other wallet exists
  // window.cardano.selectedWallet = "educhainmag";
};