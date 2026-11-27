/**
 * register.ts - register each demo account's ML-DSA-87 key WITH proof of
 * possession (MsgRegisterPQCKeyV2). It is the one tx the chain accepts signed
 * classically. Costs a small one-time fee, so the account needs QOR first.
 *
 *   pnpm register ISSUER            one role
 *   pnpm register all               every role that is funded and not registered
 */
import { buildRegisterPqcKeyMsg, signProofOfPossession } from "@qorechain/sdk";
import { NATIVE_CHAIN_ID, callPqcKeyStatus, toHex } from "./lib/chain.js";
import { ROLES, loadAccount, roleArg, type Role } from "./lib/accounts.js";
import { bankBalances, sendNative } from "./lib/native.js";
import { logTx } from "./lib/demo-log.js";

const arg = process.argv[2] ?? "ISSUER";
const roles: Role[] = arg.toLowerCase() === "all" ? [...ROLES] : [roleArg(arg, "ISSUER")];
const dryRun = process.argv.includes("--dry-run");

for (const role of roles) {
  const a = loadAccount(role);
  console.log(`${role} ${a.evm} ${a.cosmos}`);
  const st = await callPqcKeyStatus(a.evm);
  if (!st.active) throw new Error("pqcKeyStatus precompile inactive");
  if (st.registered) {
    const mine = toHex(st.pubkey) === toHex(a.acc.pqc.publicKey);
    console.log(`  already registered (proven=${st.possessionProven}, ${mine ? "this key" : "NOT this key"}): skip`);
    continue;
  }
  const bank = await bankBalances(a.cosmos);
  if (BigInt(bank.uqor ?? "0") === 0n) {
    console.log("  no QOR yet: fund it first (pnpm fund)");
    continue;
  }
  const proofOfPossession = signProofOfPossession({ chainId: NATIVE_CHAIN_ID, account: a.cosmos, keypair: a.acc.pqc });
  const msg = buildRegisterPqcKeyMsg(a.cosmos, { pqcKeypair: a.acc.pqc, proofOfPossession });
  const r = await sendNative(a, [msg], { mode: "classical", simGas: 1_000_000n, dryRun });
  if (r.simulated) continue;
  logTx(`register ML-DSA-87 key (${role})`, r.hash, `ok, gasUsed ${r.gasUsed}`);
  // Read it back through the precompile the contract uses.
  for (let i = 0; i < 10; i++) {
    const after = await callPqcKeyStatus(a.evm);
    if (after.active && after.registered) {
      console.log(`  pqcKeyStatus: registered=${after.registered} alg=${after.algorithmId} proven=${after.possessionProven} key=${after.pubkey.length}B`);
      break;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
}
