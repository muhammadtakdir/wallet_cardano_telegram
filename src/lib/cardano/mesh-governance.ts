
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

    console.log('[DRep] Wallet state:', { 
      utxosCount: utxos?.length, 
      changeAddress, 
      rewardAddress: rewardAddresses?.[0] 
    });

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

    console.log('[DRep] Debug Inputs:', {
      rewardAddress,
      rewardAddressType: typeof rewardAddress,
      drepId,
      drepIdType: typeof drepId
    });

    if (typeof drepId !== 'string' || !drepId) {
        return { success: false, error: 'Invalid DRep ID format' };
    }

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
    console.log('[DRep] Initializing TxBuilder...');
    const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider });

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
                console.log('[DRep] Stake key active:', stakeKeyActive);
            }
        }
    } catch (e) {
        console.warn('[DRep] Failed to check stake key status:', e);
    }

    if (!stakeKeyActive) {
        console.log('[DRep] Registering stake certificate...');
        txBuilder.registerStakeCertificate(rewardAddress);
    }

    // Delegate vote to DRep
    console.log('[DRep] Adding vote delegation certificate...');
    
    // In newer Mesh versions:
    if (typeof txBuilder.voteDelegationCertificate === 'function') {
       // @ts-ignore - Mesh SDK beta types might require DRep object or specific union type
       txBuilder.voteDelegationCertificate(rewardAddress, { drepId: drepId }); 
    } else {
       console.error('[DRep] voteDelegationCertificate method missing on txBuilder');
       return { success: false, error: 'Mesh SDK version incompatible with DRep delegation' };
    }

    console.log('[DRep] Building transaction...');
    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    console.log('[DRep] Transaction built successfully. Signing...');

    // Partial sign true for stake key witnessing
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
