/**
 * Spike S-1: the testnet pqcVerify precompile accepts
 *   pqcSign(sk, messagePqSignBytes("qorechain-diana", data))
 * for the exact affirmation string Countersign will use.
 *
 *   pnpm spike:s1 --offline        fresh random ML-DSA-87 keypair, no funds needed
 *   pnpm spike:s1 [ROLE]           the role's REGISTERED key, read back from pqcKeyStatus
 *
 * Read-only: only eth_call, nothing is broadcast.
 */
import { randomBytes } from "node:crypto";
import { generatePqcKeypair, pqcSign } from "@qorechain/sdk";
import { messagePqSignBytes } from "@qorechain/qoresign";
import { NATIVE_CHAIN_ID, callPqcKeyStatus, callPqcVerify, toHex } from "./lib/chain.js";
import { loadAccount, roleArg } from "./lib/accounts.js";

const offline = process.argv.includes("--offline");
const tradeId = toHex(randomBytes(32)); // stands in for a real tradeId: lowercase 0x + 64 hex
const data = `countersign:v1:affirm:${tradeId}`;
const signBytes = messagePqSignBytes(NATIVE_CHAIN_ID, data);

let pubkey: Uint8Array;
let secretKey: Uint8Array;
if (offline) {
  const kp = generatePqcKeypair();
  pubkey = kp.publicKey;
  secretKey = kp.secretKey;
  console.log("mode      offline (fresh random ML-DSA-87 keypair)");
} else {
  const role = roleArg(process.argv[2], "ISSUER");
  const a = loadAccount(role);
  const st = await callPqcKeyStatus(a.evm);
  if (!st.active) throw new Error(`pqcKeyStatus returned ${st.len} bytes: precompile inactive`);
  console.log(`mode      registered key of ${role} ${a.evm}`);
  console.log(`keyStatus registered=${st.registered} algorithmId=${st.algorithmId} possessionProven=${st.possessionProven} pubkey=${st.pubkey.length} bytes`);
  if (!st.registered) throw new Error(`${role} has no registered key: run pnpm register ${role}`);
  if (toHex(st.pubkey) !== toHex(a.acc.pqc.publicKey)) throw new Error("on-chain key differs from the key derived from .env");
  pubkey = st.pubkey;
  secretKey = a.acc.pqc.secretKey;
}

const sig = pqcSign(secretKey, signBytes);
console.log(`chain id  ${NATIVE_CHAIN_ID}`);
console.log(`data      ${data}`);
console.log(`signBytes ${signBytes.length} bytes, prefix "${Buffer.from(signBytes.subarray(0, 33)).toString("utf8")}..."`);
console.log(`pubkey    ${pubkey.length} bytes, signature ${sig.length} bytes`);

const cases: [string, Uint8Array, Uint8Array, boolean][] = [];
cases.push(["valid signature", sig, signBytes, true]);
const flipped = Uint8Array.from(sig);
flipped[100] ^= 0x01;
cases.push(["signature with one flipped bit", flipped, signBytes, false]);
cases.push(["same sig, other tradeId", sig, messagePqSignBytes(NATIVE_CHAIN_ID, `countersign:v1:affirm:${toHex(randomBytes(32))}`), false]);
cases.push(["same sig, other chain id", sig, messagePqSignBytes("qorechain-vladi", data), false]);
cases.push(["same sig, raw data without domain prefix", sig, new TextEncoder().encode(data), false]);
cases.push(["signature from another key", pqcSign(generatePqcKeypair().secretKey, signBytes), signBytes, false]);

let ok = true;
for (const [name, s, m, want] of cases) {
  const r = await callPqcVerify(pubkey, s, m);
  const pass = r.active && r.valid === want;
  ok &&= pass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name.padEnd(42)} -> ${r.active ? r.valid : `inactive (${r.len} bytes)`} (want ${want})`);
}
console.log(ok ? "S-1 PASS" : "S-1 FAIL");
process.exitCode = ok ? 0 : 1;
