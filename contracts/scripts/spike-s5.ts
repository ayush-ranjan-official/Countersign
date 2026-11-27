/**
 * Spike S-5: a window with allowedTargets = [escrow, bond, fUSD] admits
 * approve + lock (+ unlock) and REFUSES a tx to any other target.
 *
 * Needs: BUYER window opened with
 *   pnpm window open BUYER --targets <escrow>,<bond>,<fUSD>
 * and ERC-20 fUSD on BUYER (S-4).
 *   pnpm spike:s5
 *
 * The refusal step deliberately broadcasts ONE tx to a fourth address (the guard
 * contract, a harmless view call). It simulates fine (eth_call needs no window),
 * so the only thing that can refuse it is the window's target list at admission.
 */
import { encodeFunctionData, erc20Abi, type Hex } from "viem";
import { evmWindowStatus } from "@qorechain/evm";
import { REST, pub } from "./lib/chain.js";
import { loadAccount } from "./lib/accounts.js";
import { FEES, artifactAbi, errorsOf, readDeployment, send, walletFor, why } from "./lib/evm.js";
import { logTx } from "./lib/demo-log.js";
import { FUSD } from "./lib/tokens.js";

const AMOUNT = 1_000_000n; // 1 fUSD
const guardAbi = artifactAbi("QoreChainHybridHolderGuard.sol", "QoreChainHybridHolderGuard");
const escrowAbi = artifactAbi("SpikeEscrow.sol", "SpikeEscrow");
const errs = errorsOf(guardAbi, escrowAbi);
const { bond, guard } = readDeployment<{ bond: Hex; guard: Hex }>("bond");
const { spikeEscrow: escrow } = readDeployment<{ spikeEscrow: Hex }>("spike-escrow");
const buyer = loadAccount("BUYER");

let pass = true;
const check = (name: string, ok: boolean, detail = "") => {
  pass &&= ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};

const w0 = await evmWindowStatus({ rest: REST, address: buyer.cosmos });
const want = [escrow, bond, FUSD].map((x) => x.toLowerCase()).sort();
const have = (w0.allowedTargets ?? []).map((x) => x.toLowerCase()).sort();
console.log(`BUYER window: live=${w0.live} usedTxs=${w0.usedTxs}/${w0.maxTxs} targets=[${have.join(", ")}]`);
if (!w0.live || JSON.stringify(want) !== JSON.stringify(have)) {
  throw new Error(`open the scoped window first: pnpm window open BUYER --targets ${escrow},${bond},${FUSD}`);
}

let r = await send(buyer, { address: FUSD, abi: erc20Abi, functionName: "approve", args: [escrow, AMOUNT] }, errs);
logTx("S-5 fUSD.approve(escrow, 1 fUSD) by BUYER in scoped window", r.hash, r.receipt.status);
check("scoped window admits approve on fUSD", r.receipt.status === "success");

r = await send(buyer, { address: escrow, abi: escrowAbi, functionName: "lock", args: [FUSD, AMOUNT] }, errs);
logTx("S-5 escrow.lock(fUSD, 1 fUSD) by BUYER in scoped window", r.hash, r.receipt.status);
check("scoped window admits lock on the escrow", r.receipt.status === "success");

r = await send(buyer, { address: escrow, abi: escrowAbi, functionName: "unlock", args: [FUSD, AMOUNT] }, errs);
logTx("S-5 escrow.unlock(fUSD, 1 fUSD) by BUYER in scoped window", r.hash, r.receipt.status);
check("scoped window admits unlock on the escrow", r.receipt.status === "success");

// A fourth target: simulate (passes), then broadcast (the window must refuse it).
const data = encodeFunctionData({ abi: guardAbi, functionName: "precompileActive" });
await pub.call({ account: buyer.evm, to: guard, data });
console.log("simulation of the off-list tx passes (eth_call needs no window); broadcasting it once to show the refusal");
const nonceBefore = await pub.getTransactionCount({ address: buyer.evm });
try {
  const hash = await walletFor(buyer).sendTransaction({ to: guard, data, gas: 100_000n, ...FEES });
  const rc = await pub.waitForTransactionReceipt({ hash });
  check("scoped window refuses a tx to a 4th target", false, `it was ADMITTED: ${hash} status ${rc.status}`);
} catch (e) {
  const reason = why(e);
  check("scoped window refuses a tx to a 4th target", true, reason);
}
const nonceAfter = await pub.getTransactionCount({ address: buyer.evm });
check("refused tx did not consume a nonce", nonceBefore === nonceAfter, `nonce ${nonceBefore} -> ${nonceAfter}`);

console.log(pass ? "S-5 PASS" : "S-5 FAIL");
process.exitCode = pass ? 0 : 1;
