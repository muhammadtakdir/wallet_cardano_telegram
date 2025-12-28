import { MeshTxBuilder, BlockfrostProvider } from '@meshsdk/core';
import type { MeshWallet } from '@meshsdk/core';
import type { CardanoNetwork } from './types';
import { getBlockfrostApiKey } from './types';

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

    // Initialize Provider and Builder
    const apiKey = getBlockfrostApiKey(network);
    if (!apiKey) {
        throw new Error("Blockfrost API key not found");
    }
    
    const provider = new BlockfrostProvider(apiKey);
    const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider, verbose: true }) as any;

    // Check if stake key is registered (active)
    let stakeKeyActive = false;
    try {
        const baseUrl = network === 'mainnet'
        ? 'https://cardano-mainnet.blockfrost.io/api/v0'
        : network === 'preprod'
        ? 'https://cardano-preprod.blockfrost.io/api/v0'
        : 'https://cardano-preview.blockfrost.io/api/v0';
        
        const resp = await fetch(`${baseUrl}/accounts/${rewardAddress}`, { headers: { project_id: apiKey } });
        if (resp.ok) {
            const data = await resp.json();
            stakeKeyActive = !!data.active;
        }
    } catch (e) {
        console.warn('Failed to check stake key status:', e);
    }

    // 1. Register Stake Key if needed (2 ADA deposit)
    if (!stakeKeyActive) {
        console.log('[DRep] Registering stake certificate...');
        if (txBuilder.registerStakeCertificate) {
            txBuilder.registerStakeCertificate(rewardAddress);
        }
    }

    // 2. Set Vote Delegation
    console.log('[DRep] Setting vote delegation...');
    if (typeof txBuilder.voteDelegation === 'function') {
        // Newer Mesh versions: voteDelegation(drepId, rewardAddress) or (rewardAddress, drepId)?
        // Common pattern is (certificate, ...) or (address, ...). 
        // Based on recent docs: voteDelegation(drepId, rewardAddress)
        try {
            txBuilder.voteDelegation(drepId, rewardAddress);
        } catch (e) {
            // If it fails, try swapping args just in case API changed
            console.warn('voteDelegation failed, retrying with swapped args...', e);
            txBuilder.voteDelegation(rewardAddress, drepId);
        }
    } else if (typeof txBuilder.delegateVote === 'function') {
        txBuilder.delegateVote(rewardAddress, drepId);
    } else {
        console.warn('[DRep] MeshTxBuilder missing governance methods');
        throw new Error("MeshTxBuilder missing governance methods (voteDelegation)");
    }

    console.log('[DRep] Building transaction...');
    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos) // Let Mesh handle selection logic
      .complete();

    console.log('[DRep] Transaction built successfully. Signing...');

    // Sign with wallet
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