/**
 * window.ts - EVM authorisation windows for the demo accounts.
 * (Adapted from the create-qorechain-dapp foundry template's window helper.)
 *
 *   pnpm window status [ROLE|all]
 *   pnpm window open ROLE --deploy [--txs N]          no allowedTargets (contract creation allowed)
 *   pnpm window open ROLE --targets 0xA,0xB,0xC       scoped: only these recipients, no creation
 *   options: --blocks N (default 600) --txs N (default 5) --gas N (per-tx gas cap used to size maxValue)
 *            --dry-run (simulate only)
 *
 * Opening is a hybrid native tx and advances the EVM nonce: open, wait ~10 s,
 * then read the nonce and sign EVM txs.
 */
import { openEvmWindowMsg } from "@qorechain/sdk";
import { evmWindowCost, evmWindowStatus } from "@qorechain/evm";
import { REST } from "./lib/chain.js";
import { localRoles, loadAccount, roleArg, type Role } from "./lib/accounts.js";
import { sendNative } from "./lib/native.js";
import { logTx } from "./lib/demo-log.js";

const argv = process.argv.slice(2);
const flag = (name: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};

async function status(roles: Role[]) {
  for (const role of roles) {
    const a = loadAccount(role);
    const w = await evmWindowStatus({ rest: REST, address: a.cosmos });
    const s = !w.found
      ? "none"
      : `${w.live ? "live" : "not usable"}; ${w.remainingBlocks} blocks, ${w.remainingTxs} txs, ${w.remainingValue} uqor left` +
        (w.allowedTargets?.length ? `; targets ${w.allowedTargets.join(", ")}` : "; no target restriction");
    console.log(`${role.padEnd(8)} ${a.cosmos}  window: ${s}`);
  }
}

async function open(role: Role) {
  const a = loadAccount(role);
  const deploy = argv.includes("--deploy");
  const targets = (flag("targets") ?? "").split(",").map((t) => t.trim()).filter(Boolean);
  if (deploy === targets.length > 0) throw new Error("pass exactly one of --deploy or --targets 0x..,0x..");
  if (targets.some((t) => !/^0x[0-9a-fA-F]{40}$/.test(t))) throw new Error("--targets must be 0x 20-byte addresses");
  const blocks = BigInt(flag("blocks") ?? "600");
  const maxTxs = BigInt(flag("txs") ?? "5");
  const gas = BigInt(flag("gas") ?? (deploy ? "15000000" : "1500000"));
  // value is 0 for every Countersign tx, so maxValue = maxTxs x (gas cap x 250 gwei fee cap), in uqor.
  const perTx = evmWindowCost({ gas, maxFeePerGas: 250_000_000_000n });
  const maxValue = perTx * maxTxs;
  const msg = openEvmWindowMsg({ sender: a.cosmos, blocks, maxTxs, maxValue, ...(targets.length ? { allowedTargets: targets } : {}) });
  console.log(`${role} opens window: ${blocks} blocks, ${maxTxs} txs, maxValue ${maxValue} uqor, ${targets.length ? `allowedTargets [${targets.join(", ")}]` : "no target restriction (deploy)"}`);
  const r = await sendNative(a, [msg], { simGas: 600_000n, dryRun: argv.includes("--dry-run") });
  if (r.simulated) return;
  logTx(`open EVM window (${role}, ${targets.length ? `allowedTargets=${targets.length}` : "deploy"})`, r.hash, `ok, ${blocks} blocks / ${maxTxs} txs`);
  console.log("  the EVM nonce advanced: wait ~10 s before sending EVM txs");
}

const [cmd = "status", who] = argv;
if (cmd === "status") await status(!who || who.toLowerCase() === "all" ? localRoles() : [roleArg(who, "ISSUER")]);
else if (cmd === "open") await open(roleArg(who, "ISSUER"));
else {
  console.error("Use: status [ROLE|all] | open ROLE (--deploy | --targets 0x..,0x..)");
  process.exitCode = 1;
}
