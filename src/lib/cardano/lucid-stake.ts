

import { getBlockfrostApiKey, getBlockfrostUrl, type CardanoNetwork } from './types';
import { validateMnemonic, normalizeMnemonic } from './mnemonic';
import { Lucid, Blockfrost } from 'lucid-cardano';


/**
 * Lucid-based staking fallback for in-app wallet
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
    // Validate mnemonic
    if (!validateMnemonic(mnemonic)) {
      return { success: false, error: 'Invalid mnemonic for Lucid staking' };
    }

    // Blockfrost setup
    const blockfrostKey = getBlockfrostApiKey(network);
    const blockfrostUrl = getBlockfrostUrl(network);
    if (!blockfrostKey) {
      return { success: false, error: 'Blockfrost API key not set for network: ' + network };
    }

    // Init Lucid
    const lucid = await Lucid.new(
      new Blockfrost(blockfrostUrl, blockfrostKey),
      network === 'mainnet' ? 'Mainnet' : network === 'preprod' ? 'Preprod' : 'Preview'
    );

    // Restore wallet from mnemonic
    const normalized = normalizeMnemonic(mnemonic);
    // Lucid expects a seed (Uint8Array) for selectWalletFromSeed
    const { mnemonicToSeedSync } = await import('bip39');
    const seedBuffer = mnemonicToSeedSync(normalized); // Buffer
    lucid.selectWalletFromSeed(seedBuffer.toString('hex'));
    const paymentAddress = await lucid.wallet.address();
    const rewardAddress = await lucid.wallet.rewardAddress();
    if (!rewardAddress) {
      return { success: false, error: 'Could not derive reward address from mnemonic' };
    }
    if (typeof window !== 'undefined') {
      console.debug('[lucid-fallback] paymentAddress:', paymentAddress);
      console.debug('[lucid-fallback] rewardAddress:', rewardAddress);
      console.debug('[lucid-fallback] seed (hex):', seedBuffer.toString('hex'));
    }

    // Build, sign and submit delegation using Lucid high-level API
    try {
      const tx = (await lucid
        .newTx()
        .delegateTo(rewardAddress, poolId)
        .complete()) as any;

      // Try Lucid's sign API for this version
      const signed = await tx.sign().complete();

      const txHash = await signed.submit();

      return { success: true, txHash };
    } catch (err) {
      const msg = typeof err === 'object' && err && 'message' in err ? (err as any).message : String(err);
      return { success: false, error: 'Lucid failed to build/sign/submit delegation: ' + msg, _debug: err };
    }
  } catch (error: any) {
    // Top-level catch
    return { success: false, error: '[lucid-fallback] ' + (error?.message || String(error)), _debug: error };
  }
}

async function initLucidFromMnemonic(mnemonic: string, network: CardanoNetwork) {
  if (!validateMnemonic(mnemonic)) throw new Error('Invalid mnemonic for Lucid');
  const blockfrostKey = getBlockfrostApiKey(network);
  const blockfrostUrl = getBlockfrostUrl(network);
  if (!blockfrostKey) throw new Error('Blockfrost API key not set for network: ' + network);

  const lucid = await Lucid.new(
    new Blockfrost(blockfrostUrl, blockfrostKey),
    network === 'mainnet' ? 'Mainnet' : network === 'preprod' ? 'Preprod' : 'Preview'
  );
  const normalized = normalizeMnemonic(mnemonic);
  const { mnemonicToSeedSync } = await import('bip39');
  const seedBuffer = mnemonicToSeedSync(normalized);
  lucid.selectWalletFromSeed(seedBuffer.toString('hex'));
  return lucid;
}

export async function registerStakeLucid(
  mnemonic: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet.rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    const tx = (await lucid.newTx().registerStake(rewardAddress).complete()) as any;
    const signed = await tx.sign().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err) {
    const msg = typeof err === 'object' && err && 'message' in err ? (err as any).message : String(err);
    return { success: false, error: 'Lucid registerStake failed: ' + msg, _debug: err };
  }
}

export async function withdrawRewardsLucid(
  mnemonic: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet.rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    const delegation = await lucid.wallet.getDelegation();
    const rewards = delegation?.rewards as any;
    const rewardsStr = rewards != null ? String(rewards) : '';
    if (!rewards || rewardsStr === '0') return { success: false, error: 'No rewards available to withdraw' };

    const tx = (await lucid.newTx().withdraw(rewardAddress, rewards).complete()) as any;
    const signed = await tx.sign().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err) {
    const msg = typeof err === 'object' && err && 'message' in err ? (err as any).message : String(err);
    return { success: false, error: 'Lucid withdraw failed: ' + msg, _debug: err };
  }
}

export async function deregisterStakeLucid(
  mnemonic: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string; _debug?: any }> {
  try {
    const lucid = await initLucidFromMnemonic(mnemonic, network);
    const rewardAddress = await lucid.wallet.rewardAddress();
    if (!rewardAddress) return { success: false, error: 'Could not derive reward address' };

    const tx = (await lucid.newTx().deregisterStake(rewardAddress).complete()) as any;
    const signed = await tx.sign().complete();
    const txHash = await signed.submit();
    return { success: true, txHash };
  } catch (err) {
    const msg = typeof err === 'object' && err && 'message' in err ? (err as any).message : String(err);
    return { success: false, error: 'Lucid deregisterStake failed: ' + msg, _debug: err };
  }
}



