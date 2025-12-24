import {
  Address,
  BaseAddress,
  Bip32PrivateKey,
  Bip32PublicKey,
  TransactionBuilder,
  TransactionBuilderConfigBuilder,
  TransactionUnspentOutputs,
  TransactionOutput,
  TransactionHash,
  TransactionWitnessSet,
  Transaction,
  LinearFee,
  BigNum,
  StakeRegistration,
  StakeDelegation,
  Ed25519KeyHash,
  RewardAddress,
  TransactionInput,
  TransactionBody,
  TransactionOutputs,
  TransactionInputs,
  TransactionMetadatum,
  TransactionUnspentOutput,
  TransactionOutputAmountBuilder,
  TransactionBuilderConfig,
  Credential,
  Certificates,
  Certificate,
  Vkeywitnesses,
  Vkeywitness,
  make_vkey_witness,
  Value,
  MultiAsset,
  Assets,
  AssetName,
  ScriptHash
} from '@emurgo/cardano-serialization-lib-browser';

import * as bip39 from 'bip39';
import axios from 'axios';
import { getCurrentNetwork } from './types';

// Helper: parse asset unit (policy.assetname or concatenated hex)
export function parseAssetUnit(unit: string): { policyIdHex: string; assetNameHex: string } {
  if (unit.includes('.')) {
    const parts = unit.split('.');
    const policyIdHex = parts[0];
    const assetNameHex = parts[1];
    if (!policyIdHex || !assetNameHex) throw new Error('Invalid asset unit');
    return { policyIdHex, assetNameHex };
  }
  // concatenated hex: policy (56 hex chars) + asset name
  if (unit.length > 56) {
    const policyIdHex = unit.slice(0, 56);
    const assetNameHex = unit.slice(56);
    if (!policyIdHex || !assetNameHex) throw new Error('Invalid asset unit');
    return { policyIdHex, assetNameHex };
  }
  throw new Error('Unsupported asset unit format');
}

// Helper: parse pool key hash supporting bech32 pool ids or hex
export function parsePoolKeyHash(poolId: string): any {
  if (poolId.startsWith('pool1')) {
    return Ed25519KeyHash.from_bech32(poolId);
  }
  if (/^[0-9a-fA-F]{56}$/.test(poolId)) {
    return Ed25519KeyHash.from_hex(poolId);
  }
  throw new Error('Invalid poolId format: must be bech32 or 56-char hex');
}

export async function delegateToPoolCSL({
  mnemonic,
  poolId,
  blockfrostKey,
  network,
}: {
  mnemonic: string;
  poolId: string;
  blockfrostKey: string;
  network: 'mainnet' | 'preprod' | 'preview';
}): Promise<{ success: boolean; txHash?: string; error?: string }> {
  try {
    // Use the provided network parameter
    const currentNetwork = network;
    // 1. Derive root key from mnemonic
    const entropy = bip39.mnemonicToEntropy(mnemonic);
    const rootKey = Bip32PrivateKey.from_bip39_entropy(
      Buffer.from(entropy, 'hex'),
      Buffer.from('')
    );
    // 2. Derive payment and stake keys (CIP1852)
    const accountKey = rootKey.derive(1852 | 0x80000000).derive(1815 | 0x80000000).derive(0 | 0x80000000);
    const paymentKey = accountKey.derive(0).derive(0);
    const stakeKey = accountKey.derive(2).derive(0);
    const paymentPubKey = paymentKey.to_public();
    const stakePubKey = stakeKey.to_public();
    // 3. Build addresses
    const networkId = currentNetwork === 'mainnet' ? 1 : 0;
    const baseAddr = BaseAddress.new(
      networkId,
      Credential.from_keyhash(paymentPubKey.to_raw_key().hash()),
      Credential.from_keyhash(stakePubKey.to_raw_key().hash())
    );
    const paymentAddr = baseAddr.to_address().to_bech32();
    const rewardAddr = RewardAddress.new(
      networkId,
      Credential.from_keyhash(stakePubKey.to_raw_key().hash())
    ).to_address().to_bech32();
    // 4. Fetch UTxOs
    const utxoResp = await axios.get(
      `${currentNetwork === 'mainnet' ? 'https://cardano-mainnet.blockfrost.io/api/v0' : currentNetwork === 'preprod' ? 'https://cardano-preprod.blockfrost.io/api/v0' : 'https://cardano-preview.blockfrost.io/api/v0'}/addresses/${paymentAddr}/utxos`,
      { headers: { project_id: blockfrostKey } }
    );
    const utxos = utxoResp.data;
    if (!utxos || utxos.length === 0) return { success: false, error: 'No UTxOs available for staking' };
    // 5. Build tx manually
    const utxo = utxos[0];
    const input = TransactionInput.new(
      TransactionHash.from_bytes(Buffer.from(utxo.tx_hash, 'hex')),
      utxo.output_index
    );
    
    // Create certificates
    const stakeKeyHash = stakePubKey.to_raw_key().hash();
    // Decode pool ID: support both bech32 and hex format
    let poolKeyHash: any;
    try {
      poolKeyHash = parsePoolKeyHash(poolId);
    } catch (e) {
      return { success: false, error: 'Invalid poolId: ' + (e instanceof Error ? e.message : String(e)) };
    }
    const certificates = Certificates.new();
    certificates.add(Certificate.new_stake_registration(
      StakeRegistration.new(Credential.from_keyhash(stakeKeyHash))
    ));
    certificates.add(Certificate.new_stake_delegation(
      StakeDelegation.new(Credential.from_keyhash(stakeKeyHash), poolKeyHash)
    ));
    
    // Calculate output amount (input minus fee minus deposits)
    const totalLovelace = utxo.amount.find((a: any) => a.unit === 'lovelace')?.quantity || '0';
    const fee = BigNum.from_str('300000'); // higher fee estimate for certificates
    const keyDeposit = BigNum.from_str('2000000'); // key deposit
    const outputLovelace = BigNum.from_str(totalLovelace).checked_sub(fee).checked_sub(keyDeposit);
    
    // Build output value by cloning input value and adjusting ADA amount
    const inputValue = Value.new(BigNum.from_str(totalLovelace));
    
    // Add all assets from input to the value (robust parsing)
    const inputMultiAsset = MultiAsset.new();
    for (const amount of utxo.amount) {
      if (amount.unit === 'lovelace') continue;

      let policyIdHex: string;
      let assetNameHex: string;
      try {
        const parsed = parseAssetUnit(amount.unit);
        policyIdHex = parsed.policyIdHex;
        assetNameHex = parsed.assetNameHex;
      } catch (e) {
        return { success: false, error: 'Invalid asset unit: ' + (e instanceof Error ? e.message : String(e)) };
      }

      try {
        const policyId = ScriptHash.from_bytes(Buffer.from(policyIdHex, 'hex'));
        const assetName = AssetName.new(Buffer.from(assetNameHex, 'hex'));
        const quantity = BigNum.from_str(amount.quantity);

        let assets = inputMultiAsset.get(policyId);
        if (!assets) {
          assets = Assets.new();
          inputMultiAsset.insert(policyId, assets);
        }
        assets.insert(assetName, quantity);
      } catch (error) {
        console.error('Error processing input asset:', amount, error);
        return { success: false, error: 'Error processing input asset: ' + (error instanceof Error ? error.message : String(error)) };
      }
    }

    if (inputMultiAsset.len() > 0) {
      inputValue.set_multiasset(inputMultiAsset);
    }

    // Create output value (input minus fees/deposits, but keep all assets)
    const outputValue = Value.new(outputLovelace);
    if (inputMultiAsset.len() > 0) {
      outputValue.set_multiasset(inputMultiAsset);
    }
    
    const txOutputs = TransactionOutputs.new();
    txOutputs.add(
      TransactionOutput.new(
        Address.from_bech32(paymentAddr),
        outputValue
      )
    );
    
    // Build tx body
    const txInputs = TransactionInputs.new();
    txInputs.add(input);
    const txBody = TransactionBody.new(
      txInputs,
      txOutputs,
      fee
    );
    txBody.set_certs(certificates);
    
    // Create transaction hash using Blake2b-256 of transaction body
    const txBodyBytes = txBody.to_bytes();
    // Use blake2b 256
    const blake = await import('blakejs');
    const digest = blake.blake2b(txBodyBytes, undefined, 32);
    const txHash = TransactionHash.from_bytes(digest as Uint8Array);
    
    // Create witnesses
    const witnessSet = TransactionWitnessSet.new();
    const vkeyWitnesses = Vkeywitnesses.new();
    const paymentWitness = make_vkey_witness(txHash, paymentKey.to_raw_key());
    const stakeWitness = make_vkey_witness(txHash, stakeKey.to_raw_key());
    vkeyWitnesses.add(paymentWitness);
    vkeyWitnesses.add(stakeWitness);
    witnessSet.set_vkeys(vkeyWitnesses);
    
    const finalTx = Transaction.new(txBody, witnessSet);
    
    // 7. Submit tx
    const txCbor = Buffer.from(finalTx.to_bytes()).toString('hex');
    const submitResp = await axios.post(
      `${currentNetwork === 'mainnet' ? 'https://cardano-mainnet.blockfrost.io/api/v0' : currentNetwork === 'preprod' ? 'https://cardano-preprod.blockfrost.io/api/v0' : 'https://cardano-preview.blockfrost.io/api/v0'}/tx/submit`,
      Buffer.from(txCbor, 'hex'),
      { headers: { 'Content-Type': 'application/cbor', project_id: blockfrostKey } }
    );
    return { success: true, txHash: submitResp.data };
  } catch (error) {
    // Enhanced error handling to get Blockfrost response details
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;
      const data = error.response?.data;
      const message = data?.message || data?.error || error.message;
      return { success: false, error: `Blockfrost API Error (${status}): ${message}` };
    }
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}
