/**
 * nav-poster.ts - post a fresh ML-DSA-87-signed NAV for (demo bond, fUSD) as the deployment's NAV attestor (S2).
 *
 * Runs every hour in GitHub Actions (.github/workflows/nav-poster.yml) with the dedicated ATTESTOR key from the
 * repository secrets, so anyone's trade on the shared deployment can settle without the builder's machine.
 * Also runs by hand:  pnpm nav-poster   (needs PRIVATE_KEY_ATTESTOR + QORE_PQC_RECOVERY_CODE_ATTESTOR in .env)
 *
 * Env: NAV_PRICE (fUSD per bond, default 10), NAV_MIN_LEFT (skip while the current NAV stays fresh this many more
 * seconds, default 3600), NAV_FORCE=1 (post anyway), DEPLOYMENTS_DIR (default deployments = the shared stack).
 * Deliberately needs no forge build: inline ABI, so CI only runs pnpm install.
 */
import { randomBytes } from "node:crypto";
import { formatUnits, parseAbi, parseUnits, type Hex } from "viem";
import { pqcSign } from "@qorechain/sdk";
import { messagePqSignBytes } from "@qorechain/qoresign";
import { NATIVE_CHAIN_ID, pub, toHex } from "./lib/chain.js";
import { loadAccount } from "./lib/accounts.js";
import { readDeployment, send } from "./lib/evm.js";
import { logTx } from "./lib/demo-log.js";
import { FUSD } from "./lib/tokens.js";
import { ensureWindow } from "./lib/windows.js";

const abi = parseAbi([
  "function navAttestor() view returns (address)",
  "function maxNavAge() view returns (uint64)",
  "function latestNav(address asset, address cash) view returns (uint256 price, uint64 timestamp)",
  "function navData(address asset, address cash, uint256 price, uint64 timestamp, uint256 nonce) pure returns (string)",
  "function postNav(address asset, address cash, uint256 price, uint64 timestamp, uint256 nonce, bytes sig)",
  "error InvalidNav()",
  "error NavNonceUsed()",
  "error BadPqcSignature()",
  "error KeyNotRegistered(address)",
  "error KeyNotProven(address)",
  "error PrecompileInactive()",
]);

const d = readDeployment<{ countersign: Hex; bond: Hex; label: string }>("countersign");
const CS = d.countersign;
const a = loadAccount("ATTESTOR");
const onchainAttestor = await pub.readContract({ address: CS, abi, functionName: "navAttestor" });
if (onchainAttestor.toLowerCase() !== a.evm.toLowerCase()) {
  throw new Error(`this ATTESTOR key (${a.evm}) is not the NAV attestor of ${CS} (${onchainAttestor})`);
}

const maxAge = await pub.readContract({ address: CS, abi, functionName: "maxNavAge" });
const [lastPrice, lastTs] = await pub.readContract({ address: CS, abi, functionName: "latestNav", args: [d.bond, FUSD] });
const now = (await pub.getBlock()).timestamp;
const left = lastTs === 0n ? -1n : lastTs + maxAge - now;
const minLeft = BigInt(process.env.NAV_MIN_LEFT ?? "3600");
console.log(`${d.label} ${CS}: NAV ${formatUnits(lastPrice, 6)} fUSD/bond, fresh for ${left}s more (maxNavAge ${maxAge}s)`);
if (left > minLeft && !process.env.NAV_FORCE) {
  console.log(`still fresh for more than ${minLeft}s: nothing to do`);
  process.exit(0);
}

// One long window (max blocks ≈ 6.8 h, a dozen posts) scoped to Countersign only, reused across runs.
await ensureWindow(a, { targets: [CS], txs: 1, openTxs: 12, blocks: 17_280 }, "NAV poster");
const price = parseUnits(process.env.NAV_PRICE ?? "10", 6);
const ts = (await pub.getBlock()).timestamp;
const nonce = BigInt(`0x${randomBytes(8).toString("hex")}`);
const data = await pub.readContract({ address: CS, abi, functionName: "navData", args: [d.bond, FUSD, price, ts, nonce] });
const sig = toHex(pqcSign(a.acc.pqc.secretKey, messagePqSignBytes(NATIVE_CHAIN_ID, data)));
console.log(`signing "${data}"`);
const r = await send(a, { address: CS, abi, functionName: "postNav", args: [d.bond, FUSD, price, ts, nonce, sig] });
logTx(`NAV poster: postNav ${formatUnits(price, 6)} fUSD/bond (ATTESTOR)`, r.hash, `${r.receipt.status}, gasUsed ${r.receipt.gasUsed}`);
if (r.receipt.status !== "success") process.exitCode = 1;
