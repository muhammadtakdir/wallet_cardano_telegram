import { MeshTxBuilder } from '@meshsdk/core';
import type { MeshWallet } from '@meshsdk/core';
import { createBlockfrostProvider } from './wallet';
import { getStakingInfo } from './wallet';
import type { CardanoNetwork } from './types';

export const delegateToPoolMesh = async (
  wallet: MeshWallet,
  poolId: string,
  network: CardanoNetwork
): Promise<{ success: boolean; txHash?: string; error?: string }> => {
  try {
    const provider = createBlockfrostProvider();

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

    // Check staking info to see if stake key is registered
    const stakingInfo = await getStakingInfo(rewardAddress);

    const txBuilder = new MeshTxBuilder({
      fetcher: provider,
      submitter: provider,
      verbose: false,
    });

    // If not registered, add registration certificate
    if (!stakingInfo || !stakingInfo.active) {
      txBuilder.registerStakeCertificate(rewardAddress);
    }

    // Add delegation certificate
    txBuilder.delegateStakeCertificate(rewardAddress, poolId);

    // Prepare tx
    const unsignedTx = await txBuilder
      .changeAddress(changeAddress)
      .selectUtxosFrom(utxos)
      .complete();

    // Sign & submit
    const signed = await wallet.signTx(unsignedTx);
    const txHash = await wallet.submitTx(signed);

    return { success: true, txHash };
  } catch (error) {
    console.error('Error delegating via MeshTxBuilder:', error);
    const message = error instanceof Error ? error.message : String(error);
    return { success: false, error: message || 'Delegation failed' };
  }
};
