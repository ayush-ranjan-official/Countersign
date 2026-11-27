/**
 * EVM-lane helpers: ABIs from forge artifacts, simulate-then-send, decoded
 * custom errors. Every write is simulated against the real node first
 * (eth_call runs the QoreChain precompiles; a window is not needed to simulate).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  BaseError,
  ContractFunctionRevertedError,
  createWalletClient,
  decodeErrorResult,
  http,
  type Abi,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { EVM_RPC, diana, pub } from "./chain.js";
import type { DemoAccount } from "./accounts.js";

const OUT = resolve(import.meta.dirname, "../../out");

export function artifactAbi(file: string, name: string): Abi {
  const p = resolve(OUT, file, `${name}.json`);
  if (!existsSync(p)) throw new Error(`missing artifact ${p}: run forge build`);
  return (JSON.parse(readFileSync(p, "utf8")) as { abi: Abi }).abi;
}

export function readDeployment<T = Record<string, Hex>>(name: string): T {
  const p = resolve(import.meta.dirname, "../../deployments", `${name}-9800.json`);
  if (!existsSync(p)) throw new Error(`missing ${p}: deploy first`);
  return JSON.parse(readFileSync(p, "utf8")) as T;
}

/** Every custom error from the given ABIs, for decoding reverts that bubble up from nested calls. */
export function errorsOf(...abis: Abi[]): Abi {
  const seen = new Set<string>();
  return abis.flat().filter((x) => x.type === "error" && !seen.has(JSON.stringify(x)) && seen.add(JSON.stringify(x))) as Abi;
}

export function why(e: unknown, errorAbi?: Abi): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      if (r.data?.errorName) return `${r.data.errorName}(${(r.data.args ?? []).map(String).join(", ")})`;
      const raw = (r as unknown as { raw?: Hex }).raw;
      if (raw && errorAbi) {
        try {
          const d = decodeErrorResult({ abi: errorAbi, data: raw });
          return `${d.errorName}(${(d.args ?? []).map(String).join(", ")})`;
        } catch {
          /* fall through */
        }
      }
      return r.reason ?? r.shortMessage;
    }
    return e.shortMessage + (e.details ? ` | ${e.details}` : "");
  }
  return String(e);
}

/**
 * Explicit EIP-1559 fees: base fee was 100 gwei and eth_gasPrice 112.5 gwei on 27 Nov 2026. A cap of 200 gwei
 * keeps every tx under the 250 gwei/gas the windows are sized for (window.ts), so gas x maxFee stays in maxValue.
 */
export const FEES = { maxFeePerGas: 200_000_000_000n, maxPriorityFeePerGas: 12_500_000_000n } as const;

export const walletFor = (a: DemoAccount) =>
  createWalletClient({ account: privateKeyToAccount(a.acc.privateKey as Hex), chain: diana, transport: http(EVM_RPC) });

export interface Call {
  address: Hex;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
  gas?: bigint;
}

/** Simulate on the real node; returns the decoded refusal instead of throwing. */
export async function simulate(a: DemoAccount, c: Call, errorAbi?: Abi): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    await pub.simulateContract({ account: a.evm, address: c.address, abi: c.abi, functionName: c.functionName, args: c.args ?? [] } as never);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: why(e, errorAbi) };
  }
}

/** Simulate, then send and wait for the receipt. Throws (without sending) if the simulation fails. */
export async function send(a: DemoAccount, c: Call, errorAbi?: Abi) {
  const sim = await simulate(a, c, errorAbi);
  if (!sim.ok) throw new Error(`simulation refused, not sending: ${sim.reason}`);
  const wallet = walletFor(a);
  // The fee market charges at least min_gas_multiplier (0.5) x gas limit, so a loose limit both overpays and
  // hides the real gas figure in the receipt. Use the node's estimate (it runs the precompiles) + 25%.
  const est = await pub.estimateContractGas({ account: a.evm, address: c.address, abi: c.abi, functionName: c.functionName, args: c.args ?? [] } as never);
  const hash = await wallet.writeContract({
    address: c.address,
    abi: c.abi,
    functionName: c.functionName,
    args: c.args ?? [],
    gas: c.gas ?? (est * 125n) / 100n + 20_000n,
    ...FEES,
  } as never);
  const receipt = await pub.waitForTransactionReceipt({ hash });
  return { hash, receipt };
}
