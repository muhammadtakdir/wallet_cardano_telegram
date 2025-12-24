import { Blockfrost, Lucid } from 'lucid';

export async function delegateToPoolLucid({
  mnemonic,
  poolId,
  blockfrostKey,
  network = 'Mainnet',
}: {
  mnemonic: string;
  poolId: string;
  blockfrostKey: string;
  network?: 'Mainnet' | 'Preprod' | 'Preview';
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    const lucid = await Lucid.new(
      new Blockfrost(
        network === 'Mainnet'
          ? 'https://cardano-mainnet.blockfrost.io/api/v0'
          : network === 'Preprod'
          ? 'https://cardano-preprod.blockfrost.io/api/v0'
          : 'https://cardano-preview.blockfrost.io/api/v0',
        blockfrostKey
      ),
      network.toLowerCase() as any
    );
    lucid.selectWalletFromMnemonic(mnemonic);

    const rewardAddress = await lucid.wallet.rewardAddress();
    const paymentAddress = await lucid.wallet.address();

    // Check if already registered
    const account = await lucid.provider.getAccount(rewardAddress);
    const isRegistered = account.delegation !== null;

    let tx = lucid.newTx();
    if (!isRegistered) {
      tx = tx.registerStake(rewardAddress);
    }
    tx = tx.delegateTo(rewardAddress, poolId);
    tx = tx.complete();
    const signedTx = await (await tx).sign().complete();
    const txHash = await (await signedTx).submit();
    return { success: true, txHash };
  } catch (error) {
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
