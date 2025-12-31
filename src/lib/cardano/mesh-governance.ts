import { MeshTxBuilder, BlockfrostProvider } from '@meshsdk/core';
import type { MeshWallet } from '@meshsdk/core';
import type { CardanoNetwork } from './types';
import { getBlockfrostApiKey, getBlockfrostUrl } from './types';

/**
 * Delegate to a DRep using Lucid Evolution with proper Conway era support
 * Using @lucid-evolution/lucid which has native delegate.VoteToDRep method
 */
export const delegateToDRepMesh = async (
  wallet: MeshWallet,
  drepId: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> => {
  console.log('[DRep] Starting delegation to:', drepId);
  
  // Get mnemonic for Lucid signing (which handles stake key properly)
  const mnemonic = (wallet as any)._mnemonic || (wallet as any).mnemonic;
  if (!mnemonic) {
    return { success: false, error: 'Could not access wallet mnemonic for signing' };
  }

  const blockfrostKey = getBlockfrostApiKey(network);
  const blockfrostUrl = getBlockfrostUrl(network);
  if (!blockfrostKey) {
    return { success: false, error: 'Blockfrost API key not set for network: ' + network };
  }

  try {
    const { normalizeMnemonic } = await import('./mnemonic');
    const normalized = normalizeMnemonic(mnemonic);
    
    // Import from @lucid-evolution/lucid (Conway era support)
    const { Lucid, Blockfrost } = await import('@lucid-evolution/lucid');
    
    // Lucid Evolution uses Lucid() instead of Lucid.new()
    const lucid = await Lucid(
      new Blockfrost(blockfrostUrl, blockfrostKey),
      network === 'mainnet' ? 'Mainnet' : network === 'preprod' ? 'Preprod' : 'Preview'
    );

    // Lucid Evolution uses selectWallet.fromSeed()
    lucid.selectWallet.fromSeed(normalized);
    
    const rewardAddress = await lucid.wallet().rewardAddress();
    if (!rewardAddress) {
      return { success: false, error: 'Could not derive reward address' };
    }

    console.log('[DRep] Reward address:', rewardAddress);

    // Check if stake key is registered
    let isRegistered = false;
    try {
      const resp = await fetch(`${blockfrostUrl}/accounts/${rewardAddress}`, {
        headers: { project_id: blockfrostKey },
      });
      if (resp.ok) {
        const data = await resp.json();
        isRegistered = data.active;
        console.log('[DRep] Stake key registered:', isRegistered);
      }
    } catch (e) {
      console.warn('[DRep] Failed to check registration status', e);
    }

    // Build transaction with Lucid Evolution
    let txBuilder = lucid.newTx();
    
    if (!isRegistered) {
      console.log('[DRep] Registering stake key...');
      txBuilder = txBuilder.register.Stake(rewardAddress);
    }

    // Use drepIDToCredential for DRep ID conversion, or handle special cases
    const { drepIDToCredential } = await import('@lucid-evolution/lucid');
    
    // Check if this is a special delegation (AlwaysAbstain/AlwaysNoConfidence)
    if (drepId === 'abstain' || drepId.toLowerCase().includes('abstain')) {
      txBuilder = txBuilder.delegate.VoteToDRep(rewardAddress, { __typename: 'AlwaysAbstain' });
    } else if (drepId === 'no-confidence' || drepId.toLowerCase().includes('no-confidence')) {
      txBuilder = txBuilder.delegate.VoteToDRep(rewardAddress, { __typename: 'AlwaysNoConfidence' });
    } else {
      // Convert DRep ID to credential
      const drepCredential = drepIDToCredential(drepId);
      txBuilder = txBuilder.delegate.VoteToDRep(rewardAddress, drepCredential);
    }

    // Complete and sign transaction
    const txComplete = await txBuilder.complete();
    const signed = await txComplete.sign.withWallet().complete();
    const txHash = await signed.submit();
    
    console.log('[DRep] Success! Hash:', txHash);
    return { success: true, txHash };

  } catch (error: any) {
    console.error('[DRep] Error:', error);
    
    // If Lucid Evolution fails, try Mesh fallback
    if (error?.message?.includes('not a function') || error?.message?.includes('undefined')) {
      console.log('[DRep] Trying Mesh fallback...');
      return await delegateWithMesh(wallet, drepId, network, blockfrostKey, '', false);
    }
    
    return { 
      success: false, 
      error: error?.message || 'DRep delegation failed',
      _debug: error 
    };
  }
};

/**
 * Mesh-based delegation with manual CBOR manipulation for stake key witness
 */
async function delegateWithMesh(
  wallet: MeshWallet,
  drepId: string,
  network: CardanoNetwork,
  apiKey: string,
  rewardAddress: string,
  isRegistered: boolean
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const utxos = await wallet.getUtxos();
    const changeAddress = await wallet.getChangeAddress();

    if (!utxos || utxos.length === 0) {
      return { success: false, error: 'No UTxOs available' };
    }

    const provider = new BlockfrostProvider(apiKey);
    const txBuilder = new MeshTxBuilder({ fetcher: provider, submitter: provider, verbose: true }) as any;

    // Register stake key if needed
    if (!isRegistered && txBuilder.registerStakeCertificate) {
      console.log('[DRep-Mesh] Registering stake certificate...');
      txBuilder.registerStakeCertificate(rewardAddress);
    }

    // Add vote delegation certificate
    console.log('[DRep-Mesh] Adding vote delegation certificate...');
    let certAdded = false;
    
    if (typeof txBuilder.voteDelegationCertificate === 'function') {
      txBuilder.voteDelegationCertificate({ dRepId: drepId }, rewardAddress);
      certAdded = true;
      console.log('[DRep-Mesh] Used voteDelegationCertificate');
    }

    if (!certAdded) {
      return { 
        success: false, 
        error: 'Conway era governance (DRep delegation) requires Lucid Evolution or a compatible MeshJS version. Please use the primary Lucid Evolution method for DRep delegation.' 
      };
    }

    // Build transaction
    console.log('[DRep-Mesh] Building transaction...');
    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Sign with MeshWallet
    // Note: MeshWallet.signTx should include stake key witness when certificates are present
    console.log('[DRep-Mesh] Signing transaction...');
    const signed = await wallet.signTx(unsignedTx, false);
    
    console.log('[DRep-Mesh] Submitting transaction...');
    const txHash = await wallet.submitTx(signed);
    
    console.log('[DRep-Mesh] Success! Hash:', txHash);
    return { success: true, txHash };

  } catch (error: any) {
    console.error('[DRep-Mesh] Error:', error);
    
    // Check for missing witness error
    const errorStr = JSON.stringify(error);
    if (errorStr.includes('MissingVKeyWitnesses')) {
      return {
        success: false,
        error: 'Vote delegation requires stake key signing. Please ensure you are using the Lucid Evolution method which properly handles stake key witnesses.',
        _debug: error
      };
    }
    
    return { 
      success: false, 
      error: error?.message || 'DRep delegation failed',
      _debug: error 
    };
  }
}