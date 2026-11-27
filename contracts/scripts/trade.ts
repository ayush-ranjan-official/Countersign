/**
 * trade.ts - one full Countersign DvP trade on qorechain-diana with the demo accounts (M7).
 *
 *   pnpm trade                 10 bonds for 100 fUSD (under the four-eyes threshold)
 *   pnpm trade --large         30 bonds for 300 fUSD (>= threshold: the OFFICER's ML-DSA approval is required)
 *   options: --amount N --price P (fUSD per bond) --ttl SECONDS
 *
 * Every EVM action runs in a window scoped to [Countersign, bond, fUSD] (M4). Every write is simulated on the real
 * node first (the precompiles run in eth_call). Tx hashes go to docs/DEMO.md.
 */
import { randomBytes } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { erc20Abi, formatUnits, keccak256, toBytes, type Hex } from "viem";
import { pub } from "./lib/chain.js";
import { loadAccount } from "./lib/accounts.js";
import { send } from "./lib/evm.js";
import { logTx } from "./lib/demo-log.js";
import { FUSD } from "./lib/tokens.js";
import { ensureWindow } from "./lib/windows.js";
import { convertFusd } from "./lib/convert.js";
import { bankBalances } from "./lib/native.js";
import { FUSD_DENOM } from "./lib/tokens.js";
import {
  STATUS,
  affirmDataLocal,
  allErrors,
  approveDataLocal,
  bondAbi,
  csAbi,
  dep,
  pqSignData,
  readView,
  tradeIdLocal,
  type Terms,
} from "./lib/countersign.js";

const argv = process.argv.slice(2);
const opt = (name: string, dflt: string) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1]! : dflt;
};
const large = argv.includes("--large");
const assetAmount = BigInt(opt("amount", large ? "30" : "10"));
const pricePerBond = BigInt(Math.round(Number(opt("price", "10")) * 1e6)); // fUSD base units per bond
const ttl = BigInt(opt("ttl", "3600"));
const cashAmount = assetAmount * pricePerBond;

const d = dep();
const CS = d.countersign;
const seller = loadAccount("SELLER");
const buyer = loadAccount("BUYER");
const officer = loadAccount("OFFICER");
const attestor = loadAccount("ISSUER");
if (d.officer.toLowerCase() !== officer.evm.toLowerCase()) throw new Error("deployment officer is not the OFFICER account");
if (d.attestor.toLowerCase() !== attestor.evm.toLowerCase()) throw new Error("deployment attestor is not the ISSUER account");

const step = async (label: string, who: typeof seller, call: Parameters<typeof send>[1]) => {
  const r = await send(who, call, allErrors);
  logTx(`trade ${label} (${who.role})`, r.hash, `${r.receipt.status}, gasUsed ${r.receipt.gasUsed}`);
  if (r.receipt.status !== "success") throw new Error(`${label} reverted on chain`);
  return r;
};
const bal = (token: Hex, who: Hex) => pub.readContract({ address: token, abi: erc20Abi, functionName: "balanceOf", args: [who] });

console.log(`Countersign ${CS} (${d.label})`);
console.log(`trade: ${assetAmount} bonds for ${formatUnits(cashAmount, 6)} fUSD; four-eyes threshold ${formatUnits(BigInt(d.largeTradeThreshold), 6)} fUSD`);

// ---- 1. scoped windows (M4)
const targets = [CS, d.bond, FUSD];
await ensureWindow(seller, { targets, txs: 5 }, "trade");
await ensureWindow(buyer, { targets, txs: 5 }, "trade");
await ensureWindow(attestor, { targets: [CS], txs: 2 }, "NAV");

// ---- 2. funds: bonds on SELLER, ERC-20 fUSD on BUYER (convert from bank fUSD if short)
const sellerBonds = (await bal(d.bond, seller.evm)) as bigint;
if (sellerBonds < assetAmount) throw new Error(`SELLER holds ${sellerBonds} bonds, needs ${assetAmount}`);
const buyerCash = (await bal(FUSD, buyer.evm)) as bigint;
if (buyerCash < cashAmount) {
  const need = cashAmount - buyerCash;
  const bank = BigInt((await bankBalances(buyer.cosmos))[FUSD_DENOM] ?? "0");
  if (bank < need) throw new Error(`BUYER needs ${formatUnits(need, 6)} more fUSD and has ${formatUnits(bank, 6)} in bank form`);
  console.log(`  BUYER converts ${formatUnits(need, 6)} bank fUSD -> ERC-20`);
  const r = await convertFusd(buyer, need);
  logTx(`MsgConvertCoin ${formatUnits(need, 6)} fUSD for the trade (BUYER)`, r.hash, `ok, gasUsed ${r.gasUsed}`);
  await new Promise((res) => setTimeout(res, 4000));
}

// ---- 3. terms + plaintext ticket (sealed later with QoreSeal; only its hash goes on chain)
const latest = await pub.getBlock();
const salt = BigInt(`0x${randomBytes(32).toString("hex")}`);
const ticket = {
  type: "countersign-trade-ticket",
  version: 1,
  instrument: { id: "DEMO-CSB-2031", name: "Countersign Demo Bond 2031", token: d.bond, decimals: 0, note: "testnet demo, not a real security" },
  quantity: assetAmount.toString(),
  price: { perUnit: formatUnits(pricePerBond, 6), currency: "fUSD", token: FUSD },
  consideration: formatUnits(cashAmount, 6),
  seller: seller.evm,
  buyer: buyer.evm,
  settlement: { method: "DvP on Countersign", venue: CS, chain: "qorechain-diana", deadlineUnix: (latest.timestamp + ttl).toString() },
  salt: salt.toString(),
};
const ticketJson = JSON.stringify(ticket);
const terms: Terms = {
  seller: seller.evm,
  buyer: buyer.evm,
  asset: d.bond,
  assetAmount,
  cash: FUSD,
  cashAmount,
  deadline: latest.timestamp + ttl,
  ticketHash: keccak256(toBytes(ticketJson)),
  salt,
};

// ---- 4. tradeId and the exact signed strings, cross-checked against the contract views
const id = await readView<Hex>(CS, "tradeIdOf", [terms]);
if (id !== tradeIdLocal(terms, CS)) throw new Error("tradeId mismatch between contract and script");
const affirmData = await readView<string>(CS, "affirmData", [id]);
if (affirmData !== affirmDataLocal(id)) throw new Error("affirmData mismatch");
mkdirSync("tickets", { recursive: true });
writeFileSync(`tickets/${id}.json`, ticketJson);
console.log(`tradeId   ${id}`);
console.log(`signs     "${affirmData}"`);

// ---- 5. ML-DSA-87 affirmations (each party submits its own; any relayer could)
await step(`affirm by SELLER, trade ${id.slice(0, 10)}`, seller, {
  address: CS, abi: csAbi, functionName: "affirm", args: [terms, seller.evm, pqSignData(seller, affirmData)],
});
await step(`affirm by BUYER, trade ${id.slice(0, 10)}`, buyer, {
  address: CS, abi: csAbi, functionName: "affirm", args: [terms, buyer.evm, pqSignData(buyer, affirmData)],
});

// ---- 6. exact approve + lock, both legs
await step(`bond.approve(Countersign, ${assetAmount}) exact`, seller, { address: d.bond, abi: bondAbi, functionName: "approve", args: [CS, assetAmount] });
await step(`lockAsset ${id.slice(0, 10)}`, seller, { address: CS, abi: csAbi, functionName: "lockAsset", args: [id] });
await step(`fUSD.approve(Countersign, ${formatUnits(cashAmount, 6)}) exact`, buyer, { address: FUSD, abi: erc20Abi, functionName: "approve", args: [CS, cashAmount] });
await step(`lockCash ${id.slice(0, 10)}`, buyer, { address: CS, abi: csAbi, functionName: "lockCash", args: [id] });
for (const [name, token, owner] of [["bond", d.bond, seller.evm], ["fUSD", FUSD, buyer.evm]] as const) {
  const left = await pub.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, CS] });
  console.log(`  ${name} allowance left after the exact pull: ${left}`); // A10: must be 0
}

// ---- 7. four-eyes (S1)
if (await readView<boolean>(CS, "requiresOfficer", [cashAmount])) {
  const approveData = await readView<string>(CS, "approveData", [id]);
  if (approveData !== approveDataLocal(id)) throw new Error("approveData mismatch");
  console.log(`  large trade: OFFICER signs "${approveData}", BUYER relays it`);
  await step(`approveLarge ${id.slice(0, 10)} (OFFICER's ML-DSA signature)`, buyer, {
    address: CS, abi: csAbi, functionName: "approveLarge", args: [id, pqSignData(officer, approveData)],
  });
}

// ---- 8. fresh NAV signed by the attestor (S2)
const navTs = (await pub.getBlock()).timestamp;
const nonce = BigInt(`0x${randomBytes(8).toString("hex")}`);
const navData = await readView<string>(CS, "navData", [d.bond, FUSD, pricePerBond, navTs, nonce]);
console.log(`  attestor signs "${navData}"`);
await step(`postNav ${formatUnits(pricePerBond, 6)} fUSD/bond`, attestor, {
  address: CS, abi: csAbi, functionName: "postNav", args: [d.bond, FUSD, pricePerBond, navTs, nonce, pqSignData(attestor, navData)],
});

// ---- 9. settle: both legs in one tx
const before = { buyerBonds: (await bal(d.bond, buyer.evm)) as bigint, sellerCash: (await bal(FUSD, seller.evm)) as bigint };
const r = await step(`SETTLE ${id.slice(0, 10)} (DvP: ${assetAmount} bonds <-> ${formatUnits(cashAmount, 6)} fUSD)`, seller, {
  address: CS, abi: csAbi, functionName: "settle", args: [id],
});
const after = { buyerBonds: (await bal(d.bond, buyer.evm)) as bigint, sellerCash: (await bal(FUSD, seller.evm)) as bigint };
const tr = await readView<{ status: number }>(CS, "getTrade", [id]);
console.log(`\nSETTLED in one tx ${r.hash}`);
console.log(`  buyer  +${after.buyerBonds - before.buyerBonds} bonds`);
console.log(`  seller +${formatUnits(after.sellerCash - before.sellerCash, 6)} fUSD`);
console.log(`  trade status: ${STATUS[tr.status]}`);
