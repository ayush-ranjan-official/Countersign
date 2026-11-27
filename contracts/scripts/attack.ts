/**
 * attack.ts - the Q-Day drill on qorechain-diana (M7, CLAUDE.md §6 A1–A10).
 *
 * The attacker holds the CLASSICAL secp256k1 keys of the seller and buyer, but not their ML-DSA-87 keys.
 * Each attack is simulated against the real node (eth_call runs the real pqcVerify / pqcKeyStatus precompiles)
 * and must print BLOCKED: <ErrorName>. Real transactions:
 *   - A1 is also BROADCAST by the ATTACKER account: the chain mines it and the contract reverts it.
 *   - after the deadline the ATTACKER triggers reclaim for real: the funds still go back to their owners.
 *
 *   pnpm attack            (takes ~15 min: it waits for the NAV to go stale and for the demo trades to expire)
 */
import { randomBytes } from "node:crypto";
import { erc20Abi, formatUnits, keccak256, toBytes, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { generatePqcKeypair, pqcSign } from "@qorechain/sdk";
import { messagePqSignBytes } from "@qorechain/qoresign";
import { pub, toHex } from "./lib/chain.js";
import { loadAccount, type DemoAccount } from "./lib/accounts.js";
import { FEES, send, simulate, walletFor, type Call } from "./lib/evm.js";
import { logTx, logNote } from "./lib/demo-log.js";
import { FUSD, FUSD_DENOM } from "./lib/tokens.js";
import { ensureWindow } from "./lib/windows.js";
import { convertFusd } from "./lib/convert.js";
import { bankBalances, sendNative } from "./lib/native.js";
import { allErrors, bondAbi, csAbi, dep, pqSignData, readView, tradeIdLocal, type Terms } from "./lib/countersign.js";

const d = dep();
const CS = d.countersign;
const seller = loadAccount("SELLER");
const buyer = loadAccount("BUYER");
const issuer = loadAccount("ISSUER");
const attacker = loadAccount("ATTACKER");
const PRICE = 10_000_000n; // 10 fUSD per bond

let failures = 0;
const results: string[] = [];
async function expectBlocked(code: string, title: string, who: DemoAccount, call: Call, expected: string) {
  const r = await simulate(who, call, allErrors);
  const got = r.ok ? "NOT BLOCKED" : r.reason;
  const pass = !r.ok && got.startsWith(expected);
  if (!pass) failures++;
  const line = `${pass ? "BLOCKED" : "FAIL   "}: ${code} ${title} -> ${got}${pass ? "" : ` (expected ${expected})`}`;
  console.log(line);
  results.push(line);
  logNote(`attack ${code}: ${title} (simulated with eth_call, sender ${who.role})`, pass ? `BLOCKED: ${got}` : `FAIL: ${got}`);
}
const sleep = (s: number) => new Promise((res) => setTimeout(res, s * 1000));
async function waitUntil(ts: bigint, why: string) {
  for (;;) {
    const now = (await pub.getBlock()).timestamp;
    if (now > ts) return;
    console.log(`  waiting ${ts - now + 1n}s ${why}`);
    await sleep(Math.min(60, Number(ts - now) + 3));
  }
}
const step = async (label: string, who: DemoAccount, call: Call) => {
  const r = await send(who, call, allErrors);
  logTx(`attack setup: ${label} (${who.role})`, r.hash, `${r.receipt.status}, gasUsed ${r.receipt.gasUsed}`);
  return r;
};

async function openTrade(assetAmount: bigint, cashAmount: bigint, ttl: bigint, lock: boolean): Promise<{ t: Terms; id: Hex }> {
  const now = (await pub.getBlock()).timestamp;
  const t: Terms = {
    seller: seller.evm, buyer: buyer.evm, asset: d.bond, assetAmount, cash: FUSD, cashAmount,
    deadline: now + ttl, ticketHash: keccak256(toBytes(`attack-demo ${now}`)), salt: BigInt(`0x${randomBytes(32).toString("hex")}`),
  };
  const id = tradeIdLocal(t, CS);
  if (lock) {
    const data = await readView<string>(CS, "affirmData", [id]);
    await step(`affirm ${id.slice(0, 10)}`, seller, { address: CS, abi: csAbi, functionName: "affirm", args: [t, seller.evm, pqSignData(seller, data)] });
    await step(`affirm ${id.slice(0, 10)}`, buyer, { address: CS, abi: csAbi, functionName: "affirm", args: [t, buyer.evm, pqSignData(buyer, data)] });
    await step(`bond.approve ${assetAmount}`, seller, { address: d.bond, abi: bondAbi, functionName: "approve", args: [CS, assetAmount] });
    await step(`lockAsset ${id.slice(0, 10)}`, seller, { address: CS, abi: csAbi, functionName: "lockAsset", args: [id] });
    await step(`fUSD.approve ${formatUnits(cashAmount, 6)}`, buyer, { address: FUSD, abi: erc20Abi, functionName: "approve", args: [CS, cashAmount] });
    await step(`lockCash ${id.slice(0, 10)}`, buyer, { address: CS, abi: csAbi, functionName: "lockCash", args: [id] });
  }
  return { t, id };
}

console.log(`Countersign ${CS} (${d.label}); attacker holds the SELLER's and BUYER's classical keys only\n`);

// ---------------------------------------------------------------- setup: windows and cash
const targets = [CS, d.bond, FUSD];
await ensureWindow(seller, { targets, txs: 6, blocks: 1200 }, "attack demo");
await ensureWindow(buyer, { targets, txs: 6, blocks: 1200 }, "attack demo");
await ensureWindow(issuer, { targets: [CS], txs: 2, blocks: 1200 }, "attack demo NAV");
await ensureWindow(attacker, { targets: [CS], txs: 3, blocks: 1200 }, "attack demo");

const LARGE = BigInt(d.largeTradeThreshold); // exactly the four-eyes threshold
const need = LARGE + 10n * PRICE;
let erc20 = (await pub.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [buyer.evm] })) as bigint;
if (erc20 < need) {
  let bank = BigInt((await bankBalances(buyer.cosmos))[FUSD_DENOM] ?? "0");
  if (bank < need - erc20) {
    const top = need - erc20 - bank;
    const r = await sendNative(issuer, [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: { fromAddress: issuer.cosmos, toAddress: buyer.cosmos, amount: [{ denom: FUSD_DENOM, amount: top.toString() }] } }]);
    logTx(`attack setup: ISSUER sends ${formatUnits(top, 6)} bank fUSD to BUYER`, r.hash, `ok, gasUsed ${r.gasUsed}`);
    bank += top;
    await sleep(4);
  }
  const r = await convertFusd(buyer, need - erc20);
  logTx(`attack setup: MsgConvertCoin ${formatUnits(need - erc20, 6)} fUSD (BUYER)`, r.hash, `ok, gasUsed ${r.gasUsed}`);
  await sleep(4);
  erc20 = need;
}

// X: a LARGE trade, both legs locked (for A6 and A4). Y: a small trade, both legs locked (for A7).
const X = await openTrade(LARGE / PRICE, LARGE, 900n, true);
const Y = await openTrade(10n, 10n * PRICE, 900n, true);
// Z: never-affirmed terms (for A1, A2, A3).
const Z = await openTrade(5n, 5n * PRICE, 3600n, false);
const zData = await readView<string>(CS, "affirmData", [Z.id]);
console.log(`\ndemo trades: X ${X.id.slice(0, 10)} (large, locked)  Y ${Y.id.slice(0, 10)} (small, locked)  Z ${Z.id.slice(0, 10)} (unaffirmed)\n`);

// ---------------------------------------------------------------- A1 forged ML-DSA affirmation
const forged = toHex(pqcSign(generatePqcKeypair().secretKey, messagePqSignBytes("qorechain-diana", zData)));
await expectBlocked("A1", "forged affirmation signed with a random ML-DSA-87 key", seller,
  { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, forged] }, "BadPqcSignature");

// ---------------------------------------------------------------- A2 classical-only / empty signature
const ecdsa = await privateKeyToAccount(seller.acc.privateKey as Hex).signMessage({ message: zData }); // the stolen key
await expectBlocked("A2", "classical-only signature (65-byte secp256k1, made with the stolen key)", seller,
  { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, ecdsa] }, "BadSignatureLength");
await expectBlocked("A2", "empty PQ signature", seller,
  { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, "0x"] }, "BadSignatureLength");

// ---------------------------------------------------------------- A3 replay on another trade / contract / chain
const xData = await readView<string>(CS, "affirmData", [X.id]);
await expectBlocked("A3", "replay the seller's REAL affirmation of trade X on trade Z", attacker,
  { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, pqSignData(seller, xData)] }, "BadPqcSignature");
const otherContractId = tradeIdLocal(Z.t, "0x8C0E48335e853F733563cFe3825D7028fe5eE012"); // the same terms on another contract
await expectBlocked("A3", "replay a real seller signature made for another contract", attacker,
  { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, pqSignData(seller, `countersign:v1:affirm:${otherContractId}`)] }, "BadPqcSignature");
const mainnetSig = toHex(pqcSign(seller.acc.pqc.secretKey, messagePqSignBytes("qorechain-vladi", zData)));
await expectBlocked("A3", "replay a real seller signature made for another chain (qorechain-vladi)", attacker,
  { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, mainnetSig] }, "BadPqcSignature");

// ---------------------------------------------------------------- A4 classical key: early reclaim / take the other leg
await expectBlocked("A4", "seller's classical key calls reclaim before the deadline", seller,
  { address: CS, abi: csAbi, functionName: "reclaim", args: [X.id] }, "DeadlineNotPassed");
await expectBlocked("A4", "seller's classical key tries to lock (and so control) the buyer's cash leg", seller,
  { address: CS, abi: csAbi, functionName: "lockCash", args: [X.id] }, "NotParty");

// ---------------------------------------------------------------- A5 changed terms
const cheaper: Terms = { ...X.t, cashAmount: 1n };
await expectBlocked("A5", "change the price to 1 base unit and reuse the seller's real affirmation", attacker,
  { address: CS, abi: csAbi, functionName: "affirm", args: [cheaper, seller.evm, pqSignData(seller, xData)] }, "BadPqcSignature");
const redirected: Terms = { ...X.t, buyer: attacker.evm };
await expectBlocked("A5", "redirect the bonds to the attacker and reuse the seller's real affirmation", attacker,
  { address: CS, abi: csAbi, functionName: "affirm", args: [redirected, seller.evm, pqSignData(seller, xData)] }, "BadPqcSignature");
await expectBlocked("A5", "lock under the changed terms' tradeId", seller,
  { address: CS, abi: csAbi, functionName: "lockAsset", args: [tradeIdLocal(cheaper, CS)] }, "NotAffirmed");

// ---------------------------------------------------------------- A6 large trade without the officer
await expectBlocked("A6", `settle a ${formatUnits(LARGE, 6)} fUSD trade without the officer's ML-DSA approval`, attacker,
  { address: CS, abi: csAbi, functionName: "settle", args: [X.id] }, "OfficerApprovalRequired");
const forgedOfficer = toHex(pqcSign(generatePqcKeypair().secretKey, messagePqSignBytes("qorechain-diana", await readView<string>(CS, "approveData", [X.id]))));
await expectBlocked("A6", "forge the officer's approval", attacker,
  { address: CS, abi: csAbi, functionName: "approveLarge", args: [X.id, forgedOfficer] }, "BadPqcSignature");

// ---------------------------------------------------------------- A8 party without a (proven) key
const fresh = privateKeyToAccount(`0x${randomBytes(32).toString("hex")}`).address;
await expectBlocked("A8", "a counterparty whose account has no registered ML-DSA key", attacker,
  { address: CS, abi: csAbi, functionName: "affirm", args: [{ ...Z.t, buyer: fresh }, fresh, forged] }, "KeyNotRegistered");

// ---------------------------------------------------------------- A9 fail closed when the precompile is inactive
const mainnet = await fetch("https://evm.qore.host", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_call", params: [{ to: "0x0000000000000000000000000000000000000a02", data: `0x850dfe51${seller.evm.slice(2).padStart(64, "0")}` }, "latest"] }),
}).then((r) => r.json() as Promise<{ result?: string }>);
const emptyOnMainnet = mainnet.result === "0x";
const a9 = `${emptyOnMainnet ? "BLOCKED" : "FAIL   "}: A9 pqcKeyStatus on mainnet (read-only eth_call) returns ${JSON.stringify(mainnet.result)} -> Countersign reverts PrecompileInactive there (Foundry: test_A9_*)`;
if (!emptyOnMainnet) failures++;
console.log(a9);
results.push(a9);
logNote("attack A9: inactive precompile (read-only eth_call to 0x…0a02 on MAINNET, evm.qore.host)", `${JSON.stringify(mainnet.result)}; fail-closed path covered by test_A9_* in Foundry`);

// ---------------------------------------------------------------- A10 no leftover approvals
for (const [name, token, owner] of [["bond", d.bond, seller.evm], ["fUSD", FUSD, buyer.evm]] as const) {
  const left = (await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, CS] })) as bigint;
  const line = `${left === 0n ? "BLOCKED" : "FAIL   "}: A10 leftover ${name} approval to Countersign after the exact pulls = ${left}`;
  if (left !== 0n) failures++;
  console.log(line);
  results.push(line);
}

// ---------------------------------------------------------------- one REAL refused transaction (A1 on chain)
console.log("\nbroadcasting A1 for real from the ATTACKER account (simulated above: it reverts) ...");
const hash = await walletFor(attacker).writeContract({ address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, forged], gas: 900_000n, ...FEES } as never);
const rc = await pub.waitForTransactionReceipt({ hash });
const replay = await simulate(attacker, { address: CS, abi: csAbi, functionName: "affirm", args: [Z.t, seller.evm, forged] }, allErrors);
const onchain = rc.status === "reverted" && !replay.ok;
if (!onchain) failures++;
console.log(`${onchain ? "BLOCKED" : "FAIL   "}: A1 on chain, tx ${hash} status=${rc.status} reason=${replay.ok ? "-" : replay.reason}`);
logTx("attack A1 BROADCAST: forged ML-DSA affirmation by the ATTACKER (expected to revert)", hash, `${rc.status} (${replay.ok ? "?" : replay.reason}), gasUsed ${rc.gasUsed}`);

// ---------------------------------------------------------------- A7 stale and off-band NAV (trade Y)
const [, lastTs] = (await readView<readonly [bigint, bigint]>(CS, "latestNav", [d.bond, FUSD]));
await waitUntil(lastTs + BigInt(d.maxNavAge), `for the last NAV to pass maxNavAge (${d.maxNavAge}s)`);
await expectBlocked("A7", "settle with a stale NAV", attacker, { address: CS, abi: csAbi, functionName: "settle", args: [Y.id] }, "NavStale");
const offTs = (await pub.getBlock()).timestamp;
const offNonce = BigInt(`0x${randomBytes(8).toString("hex")}`);
const offPrice = PRICE * 2n; // the attestor's fresh NAV says 20 fUSD/bond; the trade is at 10
const offData = await readView<string>(CS, "navData", [d.bond, FUSD, offPrice, offTs, offNonce]);
await step(`postNav ${formatUnits(offPrice, 6)} fUSD/bond (fresh, but far from the trade price)`, issuer,
  { address: CS, abi: csAbi, functionName: "postNav", args: [d.bond, FUSD, offPrice, offTs, offNonce, pqSignData(issuer, offData)] });
await expectBlocked("A7", "settle at 10 fUSD/bond when the fresh NAV is 20 (band 2 %)", attacker,
  { address: CS, abi: csAbi, functionName: "settle", args: [Y.id] }, "PriceOutOfBand");

// ---------------------------------------------------------------- A4 after the deadline: anyone triggers reclaim, owners get paid
await waitUntil(X.t.deadline > Y.t.deadline ? X.t.deadline : Y.t.deadline, "for trades X and Y to pass their deadline");
for (const T of [X, Y]) {
  const sb = (await pub.readContract({ address: d.bond, abi: erc20Abi, functionName: "balanceOf", args: [seller.evm] })) as bigint;
  const bc = (await pub.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [buyer.evm] })) as bigint;
  const ab = (await pub.readContract({ address: d.bond, abi: erc20Abi, functionName: "balanceOf", args: [attacker.evm] })) as bigint;
  const r = await send(attacker, { address: CS, abi: csAbi, functionName: "reclaim", args: [T.id] }, allErrors);
  const sb2 = (await pub.readContract({ address: d.bond, abi: erc20Abi, functionName: "balanceOf", args: [seller.evm] })) as bigint;
  const bc2 = (await pub.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [buyer.evm] })) as bigint;
  const ab2 = (await pub.readContract({ address: d.bond, abi: erc20Abi, functionName: "balanceOf", args: [attacker.evm] })) as bigint;
  const ok = sb2 - sb === T.t.assetAmount && bc2 - bc === T.t.cashAmount && ab2 === ab;
  if (!ok) failures++;
  const line = `${ok ? "BLOCKED" : "FAIL   "}: A4 attacker triggers reclaim of ${T.id.slice(0, 10)} after the deadline -> seller +${sb2 - sb} bonds, buyer +${formatUnits(bc2 - bc, 6)} fUSD, attacker +${ab2 - ab}`;
  console.log(line);
  results.push(line);
  logTx(`attack A4 reclaim ${T.id.slice(0, 10)} triggered by the ATTACKER after the deadline`, r.hash, `${r.receipt.status}; seller +${sb2 - sb} bonds, buyer +${formatUnits(bc2 - bc, 6)} fUSD, attacker +0`);
}

console.log(`\n${results.length} checks, ${failures} failed`);
process.exitCode = failures ? 1 : 0;
