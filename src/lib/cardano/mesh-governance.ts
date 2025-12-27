
import { MeshTxBuilder, resolvePaymentKeyHash } from '@meshsdk/core';
import type { MeshWallet } from '@meshsdk/core';
import type { CardanoNetwork } from './types';

/**
 * Delegate to a DRep using Mesh SDK
 */
export const delegateToDRepMesh = async (
  wallet: MeshWallet,
  drepId: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> => {
  try {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();
    const rewardAddresses = await wallet.getRewardAddresses();

    if (!utxos || utxos.length === 0) {
      return { success: false, error: 'No UTxOs available in wallet' };
    }
    if (!changeAddress) {
      return { success: false, error: 'Could not get change address' };
    }
    if (!rewardAddresses || rewardAddresses.length === 0) {
      return { success: false, error: 'Could not get reward address' };
    }
    
    const rewardAddress = rewardAddresses[0];

    // Import BlockfrostProvider dynamically
    const { BlockfrostProvider } = await import('@meshsdk/core');
    let apiKey = '';
    if (network === 'mainnet') {
      apiKey = process.env.NEXT_PUBLIC_BLOCKFROST_KEY_MAINNET || '';
    } else if (network === 'preprod') {
      apiKey = process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREPROD || '';
    } else {
      apiKey = process.env.NEXT_PUBLIC_BLOCKFROST_KEY_PREVIEW || '';
    }
    if (!apiKey) apiKey = process.env.NEXT_PUBLIC_BLOCKFROST_API_KEY || '';
    
    const provider = new BlockfrostProvider(apiKey);
    
    // Create TxBuilder
    const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });

    // Check if stake key is registered (active) - Reuse logic or assume active if delegating vote?
    // Usually, you need a registered stake key to delegate vote.
    // If not registered, we should register it.
    let stakeKeyActive = false;
    try {
        const baseUrl = network === 'mainnet'
        ? 'https://cardano-mainnet.blockfrost.io/api/v0'
        : network === 'preprod'
        ? 'https://cardano-preprod.blockfrost.io/api/v0'
        : 'https://cardano-preview.blockfrost.io/api/v0';
        
        if (apiKey) {
            const resp = await fetch(`${baseUrl}/accounts/${rewardAddress}`, { headers: { project_id: apiKey } });
            if (resp.ok) {
                const data = await resp.json();
                stakeKeyActive = !!data.active;
            }
        }
    } catch {}

    if (!stakeKeyActive) {
        txBuilder.registerStakeCertificate(rewardAddress);
    }

    // Delegate vote to DRep
    // Note: The method might be voteDelegationCertificate or similar depending on Mesh version
    // Checking Mesh docs, it is often voteDelegationCertificate(stakeCredential, drepId)
    // Or voteDelegation(stakeCredential, drepId)
    // We try the standard builder method.
    
    // In newer Mesh versions:
    if (typeof txBuilder.voteDelegationCertificate === 'function') {
       // @ts-ignore - Mesh SDK beta types might require DRep object or specific union type
       txBuilder.voteDelegationCertificate(rewardAddress, { drepId: drepId }); 
    } else {
       // Fallback or error if method differs in this specific beta version
       return { success: false, error: 'Mesh SDK version incompatible with DRep delegation' };
    }

    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Partial sign true for stake key witnessing
    const signed = await wallet.signTx(unsignedTx, true);
    const txHash = await wallet.submitTx(signed);

    return { success: true, txHash };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message || 'DRep delegation failed' };
  }
};
