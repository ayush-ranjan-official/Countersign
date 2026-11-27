import { useState } from "react";
import { BaseError, ContractFunctionRevertedError, type Abi, type Address, type Hex } from "viem";
import { classifyEvmWindowRejection } from "@qorechain/evm";
import { usePublicClient, useWalletClient } from "wagmi";

export interface Call {
  address: Address;
  abi: Abi;
  functionName: string;
  args?: readonly unknown[];
}

/** A readable reason for a refused simulation or transaction: custom errors by name, QoreX and window refusals. */
export function explain(e: unknown): string {
  if (e instanceof BaseError) {
    const r = e.walk((x) => x instanceof ContractFunctionRevertedError);
    if (r instanceof ContractFunctionRevertedError) {
      const name = r.data?.errorName;
      if (name) return `${name}${r.data?.args?.length ? `(${r.data.args.map(String).join(", ")})` : ""}`;
      return r.reason ?? r.shortMessage;
    }
    const w = classifyEvmWindowRejection(e);
    if (w) return `EVM window: ${w}`;
    const msg = `${e.shortMessage} ${e.details ?? ""}`;
    if (/4100|coin 118|cannot send on QoreChain's EVM lane/i.test(msg)) return "This QoreX account is coin 118 and cannot send EVM transactions: switch to an Ethereum (coin 60) account";
    if (/4001|rejected|denied/i.test(msg)) return "Rejected in QoreX";
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

export type TxState = { phase: "idle" } | { phase: "simulating" | "signing" | "mining"; label: string } | { phase: "done"; label: string; hash: Hex } | { phase: "error"; label: string; reason: string };

/** Simulate on the real node first (eth_call runs the PQC precompiles), then send through QoreX and wait. */
export function useTx() {
  const pub = usePublicClient();
  const { data: wallet } = useWalletClient();
  const [state, setState] = useState<TxState>({ phase: "idle" });

  async function run(label: string, call: Call): Promise<Hex | undefined> {
    if (!pub || !wallet) {
      setState({ phase: "error", label, reason: "Connect QoreX first" });
      return;
    }
    try {
      setState({ phase: "simulating", label });
      const sim = await pub.simulateContract({ ...call, args: call.args ?? [], account: wallet.account.address } as never);
      setState({ phase: "signing", label });
      const hash = await wallet.writeContract((sim as unknown as { request: never }).request);
      setState({ phase: "mining", label });
      const rc = await pub.waitForTransactionReceipt({ hash });
      if (rc.status !== "success") throw new Error(`reverted on chain (tx ${hash})`);
      setState({ phase: "done", label, hash });
      return hash;
    } catch (e) {
      setState({ phase: "error", label, reason: explain(e) });
    }
  }
  return { state, run, setState };
}

/** Dry-run a call (no wallet needed) and return the blocking reason, or null if it would pass. */
export async function preflight(pub: ReturnType<typeof usePublicClient>, account: Address | undefined, call: Call): Promise<string | null> {
  if (!pub) return "no RPC";
  try {
    await pub.simulateContract({ ...call, args: call.args ?? [], account } as never);
    return null;
  } catch (e) {
    return explain(e);
  }
}
