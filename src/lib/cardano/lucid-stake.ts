import { getBlockfrostApiKey, getBlockfrostUrl, type CardanoNetwork } from './types';
import { validateMnemonic, normalizeMnemonic } from './mnemonic';

/**
 * Lucid Evolution-based staking fallback for in-app wallet
 * @param mnemonic - BIP39 mnemonic phrase
 * @param poolId - Stake pool ID
 * @param network - Cardano network
 * @returns { success, txHash, error, _debug }
 */
export async function delegateToPoolLucid(
  mnemonic: string,
  poolId: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {

  try {
    const normalized = normalizeMnemonic(mnemonic);
    
    // 1. Basic validation
    if (!normalized) {
      return { success: false, error: 'Mnemonic is empty' };
    }

    // 2. Blockfrost setup
    const blockfrostKey = getBlockfrostApiKey(network);
    const blockfrostUrl = getBlockfrostUrl(network);
    if (!blockfrostKey) {
      return { success: false, error: 'Blockfrost API key not set for network: ' + network };
    }

    // 3. Init Lucid Evolution (Dynamic Import to fix WASM issues)
    const { Lucid, Blockfrost } = await import('@lucid-evolution/lucid');
    const lucid = await Lucid(
      new Blockfrost(blockfrostUrl, blockfrostKey),
      network === 'mainnet' ? 'Mainnet' : network === 'preprod' ? 'Preprod' : 'Preview'
    );

    // 4. Restore wallet from mnemonic using Lucid Evolution's selectWallet.fromSeed
    try {
      lucid.selectWallet.fromSeed(normalized);
    } catch (mnemonicErr: any) {
      console.error('[lucid-stake] selectWallet.fromSeed failed:', mnemonicErr);
      return { 
        success: false, 
        error: 'Invalid mnemonic: ' + (mnemonicErr?.message || String(mnemonicErr)),
        _debug: { mnemonicLength: normalized.split(' ').length }
      };
    }

    const rewardAddress = await lucid.wallet().rewardAddress();
    if (!rewardAddress) {
      return { success: false, error: 'Could not derive reward address from mnemonic' };
    }

    // 5. Check if stake key is registered
    let isRegistered = false;
    try {
      const resp = await fetch(`${blockfrostUrl}/accounts/${rewardAddress}`, {
        headers: { project_id: blockfrostKey },
      });
      if (resp.ok) {
        const data = await resp.json();
        isRegistered = data.active;
      }
    } catch (e) {
      // Ignore error, assume not registered if check fails
      console.warn('[lucid-stake] Failed to check registration status', e);
    }

    // 6. Build, sign and submit delegation
    try {
      let txBuilder = lucid.newTx();
      
      // Register stake key if not active
      if (!isRegistered) {
        txBuilder = txBuilder.register.Stake(rewardAddress);
      }
      
      // Lucid Evolution uses delegate.ToPool for pool delegation
      txBuilder = txBuilder.delegate.ToPool(rewardAddress, poolId);
      
      const txComplete = await txBuilder.complete();
      const signed = await txComplete.sign.withWallet().complete();
      const txHash = await signed.submit();
      return { success: true, txHash };
    } catch (err: any) {
      const msg = err?.message || String(err);
      return { success: false, error: 'Lucid delegation failed: ' + msg, _debug: err };
    }
  } catch (error: any) {
    const msg = error?.message || String(error);
    console.error('[lucid-stake] Unexpected error:', error);
    return { success: false, error: '[lucid-stake] ' + msg, _debug: { message: msg, stack: error?.stack } };
  }
}

async function initLucidFromMnemonic(mnemonic: string, network: CardanoNetwork) {
  const normalized = normalizeMnemonic(mnemonic);
  const blockfrostKey = getBlockfrostApiKey(network);
  const blockfrostUrl = getBlockfrostUrl(network);
  if (!blockfrostKey) throw new Error('Blockfrost API key not set for network: ' + network);

  const { Lucid, Blockfrost } = await import('@lucid-evolution/lucid');
  const lucid = await Lucid(
    new Blockfrost(blockfrostUrl, blockfrostKey),
    network === 'mainnet' ? 'Mainnet' : network === 'preprod' ? 'Preprod' : 'Preview'
  );
  
  lucid.selectWallet.fromSeed(normalized);
  return lucid;
}

export async function registerStakeLucid(
  mnemonic: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet().rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    const tx = await lucid.newTx().register.Stake(rewardAddress).complete();
    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { success: false, error: 'Lucid registerStake failed: ' + msg, _debug: err };
  }
}

export async function withdrawRewardsLucid(
  mnemonic: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet().rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    const delegation = await lucid.wallet().getDelegation();
    const rewards = delegation?.rewards || BigInt(0);
    if (rewards === BigInt(0)) return { success: false, error: 'No rewards available to withdraw' };

    const tx = await lucid.newTx().withdraw(rewardAddress, rewards).complete();
    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { success: false, error: 'Lucid withdraw failed: ' + msg, _debug: err };
  }
}

export async function deregisterStakeLucid(
  mnemonic: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet().rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    const tx = await lucid.newTx().deregister.Stake(rewardAddress).complete();
    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { success: false, error: 'Lucid deregisterStake failed: ' + msg, _debug: err };
  }
}

export async function delegateToDRepLucid(
  mnemonic: string,
  drepId: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet().rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    // Lucid Evolution has native DRep delegation support via delegate.VoteToDRep
    const { drepIDToCredential } = await import('@lucid-evolution/lucid');
    
    let txBuilder = lucid.newTx();
    
    // Handle special DRep cases or convert DRep ID to credential
    if (drepId === 'abstain' || drepId.toLowerCase().includes('abstain')) {
      txBuilder = txBuilder.delegate.VoteToDRep(rewardAddress, { __typename: 'AlwaysAbstain' });
    } else if (drepId === 'no-confidence' || drepId.toLowerCase().includes('no-confidence')) {
      txBuilder = txBuilder.delegate.VoteToDRep(rewardAddress, { __typename: 'AlwaysNoConfidence' });
    } else {
      const drepCredential = drepIDToCredential(drepId);
      txBuilder = txBuilder.delegate.VoteToDRep(rewardAddress, drepCredential);
    }

    const tx = await txBuilder.complete();
    const signed = await tx.sign.withWallet().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err: any) {
    const msg = err?.message || String(err);
    return { success: false, error: 'DRep delegation failed: ' + msg, _debug: err };
  }
}