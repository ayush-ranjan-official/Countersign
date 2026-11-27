/**
 * Spike S-3: the CMTAT bond + hybrid-holder guard + rule work on testnet.
 *   1. ISSUER mints to SELLER (a registered, possession-proven hybrid holder)
 *   2. SELLER approves the SpikeEscrow for an exact amount
 *   3. escrow.lock (transferFrom into the escrow) is REFUSED before the exemption (simulated)
 *   4. ISSUER (guard owner) calls guard.setExempt(escrow, true, ...)
 *   5. escrow.lock now SUCCEEDS; allowance back to 0
 *   6. escrow.unlock returns the bonds to SELLER; ISSUER un-exempts the spike escrow
 *
 * Needs: deployments/bond-9800.json + spike-escrow-9800.json, ISSUER deploy window (any target),
 * SELLER window with allowedTargets = [escrow, bond, fUSD].
 *   pnpm spike:s3
 */
import type { Hex } from "viem";
import { loadAccount } from "./lib/accounts.js";
import { artifactAbi, errorsOf, readDeployment, send, simulate } from "./lib/evm.js";
import { pub } from "./lib/chain.js";
import { logTx } from "./lib/demo-log.js";

const AMOUNT = 10n;
const bondAbi = artifactAbi("CMTATStandalone.sol", "CMTATStandalone");
const guardAbi = artifactAbi("QoreChainHybridHolderGuard.sol", "QoreChainHybridHolderGuard");
const ruleAbi = artifactAbi("QoreChainHybridHolderRule.sol", "QoreChainHybridHolderRule");
const escrowAbi = artifactAbi("SpikeEscrow.sol", "SpikeEscrow");
const errs = errorsOf(bondAbi, guardAbi, ruleAbi, escrowAbi);

const { bond, guard } = readDeployment<{ bond: Hex; guard: Hex }>("bond");
const { spikeEscrow: escrow } = readDeployment<{ spikeEscrow: Hex }>("spike-escrow");
const issuer = loadAccount("ISSUER");
const seller = loadAccount("SELLER");
const bal = (who: Hex) => pub.readContract({ address: bond, abi: bondAbi, functionName: "balanceOf", args: [who] }) as Promise<bigint>;
const exempt = () => pub.readContract({ address: guard, abi: guardAbi, functionName: "exempt", args: [escrow] }) as Promise<boolean>;

let pass = true;
const check = (name: string, ok: boolean, detail = "") => {
  pass &&= ok;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`);
};

console.log(`bond ${bond}\nguard ${guard}\nescrow ${escrow}\nseller ${seller.evm}`);

// 1. mint
if ((await bal(seller.evm)) === 0n) {
  const r = await send(issuer, { address: bond, abi: bondAbi, functionName: "mint", args: [seller.evm, 1000n] }, errs);
  logTx("S-3 bond.mint(SELLER, 1000)", r.hash, r.receipt.status);
}
check("mint to hybrid holder", (await bal(seller.evm)) >= 1000n, `SELLER holds ${await bal(seller.evm)}`);

// mint to a fresh, unregistered address must be refused (simulation only)
const nokey = "0x000000000000000000000000000000000000dEaD" as Hex;
const m = await simulate(issuer, { address: bond, abi: bondAbi, functionName: "mint", args: [nokey, 1n] }, errs);
check("mint to an address without an ML-DSA key is refused", !m.ok, m.ok ? "" : m.reason);

// 2. approve exact
let r = await send(seller, { address: bond, abi: bondAbi, functionName: "approve", args: [escrow, AMOUNT] }, errs);
logTx(`S-3 bond.approve(escrow, ${AMOUNT}) by SELLER`, r.hash, r.receipt.status);

// 3. lock before exemption: refused
if (await exempt()) console.log("note: escrow already exempt from an earlier run; skipping the before-exemption check");
else {
  const s = await simulate(seller, { address: escrow, abi: escrowAbi, functionName: "lock", args: [bond, AMOUNT] }, errs);
  check("transferFrom into the escrow is refused BEFORE exemption", !s.ok, s.ok ? "" : s.reason);
  // 4. exempt
  r = await send(issuer, { address: guard, abi: guardAbi, functionName: "setExempt", args: [escrow, true, "Countersign DvP escrow (spike S-3)"] }, errs);
  logTx("S-3 guard.setExempt(spikeEscrow, true)", r.hash, r.receipt.status);
}
check("escrow is exempt", await exempt());

// 5. lock after exemption: succeeds
const before = await bal(escrow);
r = await send(seller, { address: escrow, abi: escrowAbi, functionName: "lock", args: [bond, AMOUNT] }, errs);
logTx(`S-3 escrow.lock(bond, ${AMOUNT}) by SELLER after exemption`, r.hash, r.receipt.status);
check("transferFrom into the escrow works AFTER exemption", r.receipt.status === "success" && (await bal(escrow)) - before === AMOUNT, `gasUsed ${r.receipt.gasUsed}`);
const allowance = (await pub.readContract({ address: bond, abi: bondAbi, functionName: "allowance", args: [seller.evm, escrow] })) as bigint;
check("exact approve + exact pull leaves allowance 0", allowance === 0n, `allowance ${allowance}`);

// 6. clean up: return the bonds, un-exempt the spike escrow
r = await send(seller, { address: escrow, abi: escrowAbi, functionName: "unlock", args: [bond, AMOUNT] }, errs);
logTx(`S-3 escrow.unlock(bond, ${AMOUNT}) to SELLER`, r.hash, r.receipt.status);
r = await send(issuer, { address: guard, abi: guardAbi, functionName: "setExempt", args: [escrow, false, "spike S-3 finished"] }, errs);
logTx("S-3 guard.setExempt(spikeEscrow, false)", r.hash, r.receipt.status);

console.log(pass ? "S-3 PASS" : "S-3 FAIL");
process.exitCode = pass ? 0 : 1;
