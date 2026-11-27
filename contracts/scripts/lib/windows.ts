/**
 * EVM authorisation windows for the demo accounts (M4). Every party action runs inside a window scoped with
 * allowedTargets = [Countersign, bond, fUSD]; deploys use a separate, unscoped, small window.
 */
import { openEvmWindowMsg } from "@qorechain/sdk";
import { evmWindowCost, evmWindowStatus } from "@qorechain/evm";
import { REST } from "./chain.js";
import type { DemoAccount } from "./accounts.js";
import { sendNative } from "./native.js";
import { logTx } from "./demo-log.js";

const norm = (xs: readonly string[]) => xs.map((x) => x.toLowerCase()).sort().join(",");

export interface WindowSpec {
  /** Recipients the window admits; empty = unscoped (deploys only). */
  targets: readonly string[];
  txs: number;
  blocks?: number;
  /** Per-tx gas cap used to size maxValue (value is 0 for every Countersign tx). */
  gas?: bigint;
}

/** Open a window, simulate first, wait for the EVM nonce to settle. Returns the opening tx hash. */
export async function openWindow(a: DemoAccount, spec: WindowSpec, label = ""): Promise<string> {
  const blocks = BigInt(spec.blocks ?? 600);
  const maxTxs = BigInt(spec.txs);
  const gas = spec.gas ?? 1_500_000n;
  const maxValue = evmWindowCost({ gas, maxFeePerGas: 250_000_000_000n }) * maxTxs;
  const msg = openEvmWindowMsg({
    sender: a.cosmos,
    blocks,
    maxTxs,
    maxValue,
    ...(spec.targets.length ? { allowedTargets: [...spec.targets] } : {}),
  });
  const r = await sendNative(a, [msg], { simGas: 600_000n });
  logTx(
    `open EVM window (${a.role}${label ? `, ${label}` : ""}: ${spec.targets.length ? `allowedTargets=${spec.targets.length}` : "deploy"}, ${maxTxs} txs)`,
    r.hash,
    `ok, ${blocks} blocks / ${maxTxs} txs / maxValue ${maxValue} uqor`,
  );
  await new Promise((res) => setTimeout(res, 12_000)); // opening advanced the EVM nonce
  return r.hash;
}

/** Reuse a live window with exactly these targets and enough txs left, else open a new one. */
export async function ensureWindow(a: DemoAccount, spec: WindowSpec, label = ""): Promise<void> {
  const w = await evmWindowStatus({ rest: REST, address: a.cosmos });
  const sameScope = norm(w.allowedTargets ?? []) === norm(spec.targets);
  if (w.found && w.live && sameScope && w.remainingTxs >= BigInt(spec.txs) && w.remainingBlocks > 60n) {
    console.log(`  ${a.role} window reused: ${w.remainingTxs} txs, ${w.remainingBlocks} blocks left`);
    return;
  }
  await openWindow(a, spec, label);
}
