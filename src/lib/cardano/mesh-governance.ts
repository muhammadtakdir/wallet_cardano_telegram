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
  console.log('[DRep] Starting delegation to:', drepId);
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

    // Import BlockfrostProvider and MeshTxBuilder dynamically
    const { BlockfrostProvider, MeshTxBuilder } = await import('@meshsdk/core');
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
    
    // Check if stake key is registered (active)
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

    const txBuilder: any = new MeshTxBuilder({ fetcher: provider, submitter: provider });

    // Register Stake Key if needed
    if (!stakeKeyActive) {
        console.log('[DRep] Registering stake certificate...');
        txBuilder.registerStakeCertificate(rewardAddress);
    }

    // Set Vote Delegation
    console.log('[DRep] Setting vote delegation...');
    if (typeof txBuilder.voteDelegation === 'function') {
        txBuilder.voteDelegation(rewardAddress, drepId);
    } else if (typeof txBuilder.delegateVote === 'function') {
        txBuilder.delegateVote(rewardAddress, drepId);
    } else {
         console.warn('[DRep] MeshTxBuilder missing voteDelegation method, trying default...');
         // Try default assumption or throw
         // Likely it is voteDelegation but just untyped in this beta
         if (txBuilder.voteDelegation) txBuilder.voteDelegation(rewardAddress, drepId);
         else throw new Error("MeshTxBuilder missing governance methods (voteDelegation)");
    }

    console.log('[DRep] Building transaction...');
    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    console.log('[DRep] Transaction built successfully. Signing...');

    // Sign with wallet - partialSign: true to ensure all witnesses are added
    const signed = await wallet.signTx(unsignedTx, true);
    
    console.log('[DRep] Transaction signed. Submitting...');
    const txHash = await wallet.submitTx(signed);
    
    console.log('[DRep] Submitted! Hash:', txHash);

    return { success: true, txHash };

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DRep] Delegation Error:', error);
    return { success: false, error: message || 'DRep delegation failed', _debug: error };
  }
};