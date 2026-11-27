/**
 * Spike S-2: a QoreX signArbitrary signature (pq.signature) verifies through
 * the on-chain pqcVerify precompile over the same bytes, against the key
 * QoreX registered (which must report possessionProven = true).
 *
 *   pnpm spike:s2 <result.json>     the JSON the app's /spike-s2.html page produced
 *
 * Read-only: eth_call and REST only.
 */
import { readFileSync } from "node:fs";
import { toEvmAddress } from "@qorechain/evm";
import { messagePqSignBytes } from "@qorechain/qoresign";
import { verifyMessageWithChain } from "@qorechain/qoresign/network";
import { REST, callPqcKeyStatus, callPqcVerify } from "./lib/chain.js";
import type { Hex } from "viem";

const file = process.argv[2];
if (!file) throw new Error("usage: pnpm spike:s2 <result.json>");
const r = JSON.parse(readFileSync(file, "utf8")) as {
  chainId: string;
  signer: string;
  data: string;
  signature: { signatureType?: string; pq?: { algorithmId: number; signature: string }; classical?: unknown };
};
if (r.chainId !== "qorechain-diana") throw new Error(`unexpected chainId ${r.chainId}`);
if (!r.signature?.pq?.signature) throw new Error("the signature has no pq part (classical only?)");

const evm = toEvmAddress(r.signer) as Hex;
const sig = Uint8Array.from(Buffer.from(r.signature.pq.signature, "base64"));
console.log(`signer    ${r.signer} (${evm})`);
console.log(`data      ${r.data}`);
console.log(`pq        algorithmId=${r.signature.pq.algorithmId}, signature ${sig.length} bytes`);

const st = await callPqcKeyStatus(evm);
if (!st.active) throw new Error(`pqcKeyStatus inactive (${st.len} bytes)`);
console.log(`keyStatus registered=${st.registered} algorithmId=${st.algorithmId} possessionProven=${st.possessionProven} pubkey=${st.pubkey.length} bytes`);

const onchain = st.registered ? await callPqcVerify(st.pubkey, sig, messagePqSignBytes(r.chainId, r.data)) : { active: false, valid: false, len: 0 };
console.log(`pqcVerify (on chain, 0x...0a01): ${onchain.active ? onchain.valid : "not called"}`);

let offchain = "skipped";
try {
  const v = await verifyMessageWithChain({ rest: REST, chainId: r.chainId, signer: r.signer, data: r.data, signature: r.signature as never });
  offchain = `ok (possessionProven=${v.possessionProven})`;
} catch (e) {
  offchain = `FAILED: ${e instanceof Error ? e.message : String(e)}`;
}
console.log(`verifyMessageWithChain (off chain, classical + pq): ${offchain}`);

const pass = st.registered && st.algorithmId === 1 && st.possessionProven && st.pubkey.length === 2592 && sig.length === 4627 && onchain.valid === true;
console.log(pass ? "S-2 PASS" : "S-2 FAIL");
process.exitCode = pass ? 0 : 1;
