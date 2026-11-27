/**
 * Native-lane (Cosmos) transactions for the demo accounts: simulate first,
 * then sign with the simulated gas and broadcast. A failed simulation is a
 * reason not to broadcast, never a warning.
 */
import { StargateClient } from "@cosmjs/stargate";
import { EthNativeSigner, qorechainRegistry } from "@qorechain/sdk";
import { simulateTx } from "@qorechain/qoresign/network";
import type { EncodeObject, GeneratedType } from "@cosmjs/proto-signing";
import { NATIVE_CHAIN_ID, REST, RPC } from "./chain.js";
import type { DemoAccount } from "./accounts.js";

/** account_number and sequence over REST. */
export async function accountSequence(address: string): Promise<{ accountNumber: bigint; sequence: bigint }> {
  const res = await fetch(`${REST}/cosmos/auth/v1beta1/accounts/${address}`);
  if (res.status === 404) throw new Error(`${address} does not exist on chain yet: send it some QOR first`);
  if (!res.ok) throw new Error(`account query failed: HTTP ${res.status}`);
  const body = (await res.json()) as { account?: Record<string, unknown> };
  const acc = (body.account?.base_account ?? body.account ?? {}) as Record<string, string>;
  return { accountNumber: BigInt(acc.account_number ?? "0"), sequence: BigInt(acc.sequence ?? "0") };
}

/** fee = gas x 0.125 uqor (minimum gas price is 0.1 uqor). */
const feeFor = (gas: bigint) => ({ amount: [{ denom: "uqor", amount: ((gas * 125n + 999n) / 1000n).toString() }], gas: gas.toString() });

export interface SendOptions {
  mode?: "hybrid" | "classical";
  /** Gas used only for the simulation pass. */
  simGas?: bigint;
  extraTypes?: ReadonlyArray<[string, GeneratedType]>;
  /** Simulate only, never broadcast. */
  dryRun?: boolean;
}

export async function sendNative(a: DemoAccount, messages: EncodeObject[], opts: SendOptions = {}) {
  const mode = opts.mode ?? "hybrid";
  const registry = qorechainRegistry(opts.extraTypes ?? []);
  const signer = new EthNativeSigner(a.acc, { signMode: mode, rest: REST, registry });
  const { accountNumber, sequence } = await accountSequence(a.cosmos);
  const signBytesVersion = mode === "hybrid" ? await signer.resolveSignBytesVersion(NATIVE_CHAIN_ID) : undefined;
  const base = { chainId: NATIVE_CHAIN_ID, accountNumber, sequence, messages, signBytesVersion };

  const simGas = opts.simGas ?? 2_000_000n;
  const draft = signer.sign({ ...base, fee: feeFor(simGas) });
  const sim = await simulateTx({ rest: REST, txBytes: draft.txRawBytes, exactSimulation: true });
  const gas = sim.suggestedGasLimit;
  console.log(`  simulate OK: gasUsed ${sim.gasUsed}, signing with gas ${gas}`);
  if (opts.dryRun) return { hash: "", gasUsed: sim.gasUsed, simulated: true as const };

  const tx = signer.sign({ ...base, fee: feeFor(gas) });
  const transport = await StargateClient.connect(RPC);
  try {
    const res = await transport.broadcastTx(tx.txRawBytes);
    if (res.code !== 0) throw new Error(`refused on chain: code ${res.code} ${res.rawLog ?? ""} (tx ${res.transactionHash})`);
    return { hash: res.transactionHash, gasUsed: res.gasUsed, height: res.height, simulated: false as const };
  } finally {
    transport.disconnect();
  }
}

export async function bankBalances(address: string): Promise<Record<string, string>> {
  const res = await fetch(`${REST}/cosmos/bank/v1beta1/balances/${address}?pagination.limit=100`);
  if (!res.ok) return {};
  const body = (await res.json()) as { balances?: { denom: string; amount: string }[] };
  return Object.fromEntries((body.balances ?? []).map((b) => [b.denom, b.amount]));
}
