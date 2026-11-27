/**
 * convert-fusd.ts - Spike S-4: turn bank fUSD (what the faucet pays) into
 * ERC-20 fUSD with /cosmos.evm.erc20.v1.MsgConvertCoin, hybrid-signed.
 *
 *   pnpm convert-fusd [ROLE=BUYER] [amount=1] [--dry-run]
 *
 * The SDK registry has no codec for this message, so a minimal protobuf
 * encoder is defined here (cosmos/evm erc20 v1: coin=1, receiver=2, sender=3).
 * The chain's simulation is the check: a wrong encoding fails there, before
 * anything is broadcast.
 */
import type { GeneratedType } from "@cosmjs/proto-signing";
import { erc20Abi, formatUnits } from "viem";
import { pub } from "./lib/chain.js";
import { loadAccount, roleArg } from "./lib/accounts.js";
import { bankBalances, sendNative } from "./lib/native.js";
import { logTx } from "./lib/demo-log.js";
import { FUSD, FUSD_DENOM } from "./lib/tokens.js";

const TYPE_URL = "/cosmos.evm.erc20.v1.MsgConvertCoin";

// --- minimal protobuf writer (length-delimited string / message fields only) ---
const enc = new TextEncoder();
function varint(n: number): number[] {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}
function field(no: number, bytes: Uint8Array): number[] {
  return [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];
}
interface ConvertCoin {
  coin: { denom: string; amount: string };
  receiver: string;
  sender: string;
}
const MsgConvertCoin = {
  fromPartial: (v: ConvertCoin) => v,
  encode(v: ConvertCoin) {
    const coin = Uint8Array.from([...field(1, enc.encode(v.coin.denom)), ...field(2, enc.encode(v.coin.amount))]);
    const bytes = Uint8Array.from([...field(1, coin), ...field(2, enc.encode(v.receiver)), ...field(3, enc.encode(v.sender))]);
    return { finish: () => bytes };
  },
  decode: () => {
    throw new Error("decode not needed");
  },
} as unknown as GeneratedType;

const pos = process.argv.slice(2).filter((x) => !x.startsWith("--"));
const role = roleArg(pos[0], "BUYER");
const amount = BigInt(Math.round(Number(pos[1] ?? "1") * 1e6));
const dryRun = process.argv.includes("--dry-run");

const a = loadAccount(role);
const erc20Before = await pub.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [a.evm] });
const bankBefore = BigInt((await bankBalances(a.cosmos))[FUSD_DENOM] ?? "0");
console.log(`${role} ${a.cosmos} / ${a.evm}`);
console.log(`  before: bank ${formatUnits(bankBefore, 6)} fUSD, erc20 ${formatUnits(erc20Before, 6)} fUSD`);
if (bankBefore < amount) throw new Error(`not enough bank fUSD (${bankBefore} < ${amount})`);

const msg = { typeUrl: TYPE_URL, value: { coin: { denom: FUSD_DENOM, amount: amount.toString() }, receiver: a.evm, sender: a.cosmos } };
const r = await sendNative(a, [msg], { simGas: 800_000n, extraTypes: [[TYPE_URL, MsgConvertCoin]], dryRun });
if (r.simulated) process.exit(0);

await new Promise((res) => setTimeout(res, 3000));
const erc20After = await pub.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [a.evm] });
const bankAfter = BigInt((await bankBalances(a.cosmos))[FUSD_DENOM] ?? "0");
console.log(`  after:  bank ${formatUnits(bankAfter, 6)} fUSD, erc20 ${formatUnits(erc20After, 6)} fUSD`);
const ok = erc20After - erc20Before === amount;
logTx(`MsgConvertCoin ${formatUnits(amount, 6)} fUSD bank -> ERC-20 (${role})`, r.hash, ok ? `ok, balanceOf +${formatUnits(amount, 6)}` : "balanceOf did not increase by the amount");
console.log(ok ? "S-4 PASS" : "S-4 FAIL");
process.exitCode = ok ? 0 : 1;
