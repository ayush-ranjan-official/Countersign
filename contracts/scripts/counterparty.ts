/**
 * counterparty.ts - let a script account play the OTHER side of a trade opened in the web app, so one person can
 * test the self-serve flow end to end. It only ever acts for a script account that is a party to the trade.
 *
 *   pnpm counterparty 0x<tradeId>          the trade must be opened on chain (first affirmation done)
 *   pnpm counterparty 0x<tradeId> --nav    also post a fresh NAV as the attestor (preview deploy: ISSUER)
 *
 * Steps (each simulated first): affirm (ML-DSA-87), exact approve + lock its own leg, optional fresh NAV.
 * Settling is left to the web app user (anyone may settle).
 */
import { randomBytes } from "node:crypto";
import { erc20Abi, formatUnits, type Hex } from "viem";
import { pub } from "./lib/chain.js";
import { localAccountFor, localRoles, loadAccount, type DemoAccount } from "./lib/accounts.js";
import { send } from "./lib/evm.js";
import { logTx } from "./lib/demo-log.js";
import { FUSD } from "./lib/tokens.js";
import { ensureWindow } from "./lib/windows.js";
import { allErrors, bondAbi, csAbi, dep, pqSignData, readView, type Terms } from "./lib/countersign.js";

const id = process.argv[2] as Hex;
if (!/^0x[0-9a-fA-F]{64}$/.test(id ?? "")) throw new Error("usage: pnpm counterparty 0x<tradeId> [--nav]");
const d = dep();
const CS = d.countersign;

const tr = await readView<{ terms: Terms; status: number; sellerAffirmed: boolean; buyerAffirmed: boolean; assetLocked: boolean; cashLocked: boolean }>(CS, "getTrade", [id]);
if (tr.status !== 1) throw new Error(`trade status is ${tr.status} (1 = Open): open it in the app first`);
const t = tr.terms;
const accounts = localRoles().map(loadAccount);
const me = accounts.find((a) => a.evm.toLowerCase() === t.seller.toLowerCase() || a.evm.toLowerCase() === t.buyer.toLowerCase());
if (!me) throw new Error("no script account is a party to this trade (use SELLER or BUYER as the counterparty in the app)");
const isSeller = me.evm.toLowerCase() === t.seller.toLowerCase();
console.log(`trade ${id}: ${t.assetAmount} bonds for ${formatUnits(t.cashAmount, 6)} fUSD; script account ${me.role} is the ${isSeller ? "seller" : "buyer"}`);

const step = async (label: string, who: DemoAccount, call: Parameters<typeof send>[1]) => {
  const r = await send(who, call, allErrors);
  logTx(`counterparty ${label} (${who.role}), trade ${id.slice(0, 10)}`, r.hash, `${r.receipt.status}, gasUsed ${r.receipt.gasUsed}`);
};

await ensureWindow(me, { targets: [CS, d.bond, FUSD], txs: 3 }, "counterparty");
const data = await readView<string>(CS, "affirmData", [id]);
if (!(isSeller ? tr.sellerAffirmed : tr.buyerAffirmed)) {
  await step("affirm", me, { address: CS, abi: csAbi, functionName: "affirm", args: [t, me.evm, pqSignData(me, data)] });
}
const fresh = await readView<{ sellerAffirmed: boolean; buyerAffirmed: boolean; assetLocked: boolean; cashLocked: boolean }>(CS, "getTrade", [id]);
if (fresh.sellerAffirmed && fresh.buyerAffirmed && !(isSeller ? fresh.assetLocked : fresh.cashLocked)) {
  const token = isSeller ? t.asset : FUSD;
  const amount = isSeller ? t.assetAmount : t.cashAmount;
  await step(`approve exactly ${amount}`, me, { address: token, abi: isSeller ? bondAbi : erc20Abi, functionName: "approve", args: [CS, amount] });
  await step(isSeller ? "lockAsset" : "lockCash", me, { address: CS, abi: csAbi, functionName: isSeller ? "lockAsset" : "lockCash", args: [id] });
} else if (!(fresh.sellerAffirmed && fresh.buyerAffirmed)) {
  console.log("  waiting for the other side's affirmation before locking: run this again after you affirm in the app");
}

if (process.argv.includes("--nav")) {
  const attestor = localAccountFor(d.attestor);
  if (!attestor) throw new Error("this deployment's NAV attestor is not on this machine (shared deployment: the hourly GitHub Actions NAV poster posts it; run the workflow to post now)");
  await ensureWindow(attestor, { targets: [CS], txs: 1 }, "NAV");
  const price = t.cashAmount / t.assetAmount;
  const ts = (await pub.getBlock()).timestamp;
  const nonce = BigInt(`0x${randomBytes(8).toString("hex")}`);
  const navData = await readView<string>(CS, "navData", [d.bond, FUSD, price, ts, nonce]);
  await step(`postNav ${formatUnits(price, 6)} fUSD/bond`, attestor, { address: CS, abi: csAbi, functionName: "postNav", args: [d.bond, FUSD, price, ts, nonce, pqSignData(attestor, navData)] });
}
console.log("done: settle it in the app (anyone may settle once both legs are locked and the NAV is fresh)");
