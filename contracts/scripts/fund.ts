/**
 * fund.ts - ISSUER sends QOR (and bank fUSD to the BUYER) to the other demo
 * accounts in one hybrid-signed tx (bank MsgSend x N). ISSUER must be
 * registered first.
 *
 *   pnpm fund [--dry-run]
 * Amounts (whole units) can be overridden with FUND_QOR_<ROLE> / FUND_FUSD_<ROLE>.
 */
import type { EncodeObject } from "@cosmjs/proto-signing";
import { loadAccount, type Role } from "./lib/accounts.js";
import { bankBalances, sendNative } from "./lib/native.js";
import { logTx } from "./lib/demo-log.js";
import { FUSD_DENOM } from "./lib/tokens.js";

const dryRun = process.argv.includes("--dry-run");
const plan: Record<Exclude<Role, "ISSUER">, { qor: number; fusd: number }> = {
  SELLER: { qor: 8, fusd: 0 },
  BUYER: { qor: 8, fusd: 500 },
  OFFICER: { qor: 2, fusd: 0 },
  ATTACKER: { qor: 2, fusd: 0 },
  ATTESTOR: { qor: 4, fusd: 0 }, // signs and posts NAVs (own-stack mode, or the team's GitHub Actions poster)
};
const units = (n: number) => BigInt(Math.round(n * 1e6)).toString();

const issuer = loadAccount("ISSUER");
const bank = await bankBalances(issuer.cosmos);
console.log(`ISSUER ${issuer.cosmos}: ${bank.uqor ?? 0} uqor, ${bank[FUSD_DENOM] ?? 0} fUSD (bank, base units)`);

const msgs: EncodeObject[] = [];
for (const [role, def] of Object.entries(plan) as [Exclude<Role, "ISSUER">, { qor: number; fusd: number }][]) {
  if (process.env.FUND_ONLY && !process.env.FUND_ONLY.split(",").includes(role)) continue;
  const qor = Number(process.env[`FUND_QOR_${role}`] ?? def.qor);
  const fusd = Number(process.env[`FUND_FUSD_${role}`] ?? def.fusd);
  const to = loadAccount(role);
  const amount = [{ denom: "uqor", amount: units(qor) }];
  if (fusd > 0) amount.push({ denom: FUSD_DENOM, amount: units(fusd) });
  // sdk.Coins must be sorted by denom ("erc20:..." < "uqor"), or the bank module answers "invalid coins".
  amount.sort((x, y) => (x.denom < y.denom ? -1 : x.denom > y.denom ? 1 : 0));
  console.log(`  -> ${role.padEnd(8)} ${to.cosmos}: ${qor} QOR${fusd ? ` + ${fusd} fUSD` : ""}`);
  msgs.push({ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: { fromAddress: issuer.cosmos, toAddress: to.cosmos, amount } });
}
const r = await sendNative(issuer, msgs, { simGas: 1_500_000n, dryRun });
if (!r.simulated) logTx("fund demo accounts from ISSUER (bank MsgSend x4)", r.hash, `ok, gasUsed ${r.gasUsed}`);
