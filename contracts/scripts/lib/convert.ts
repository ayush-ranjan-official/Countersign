/**
 * /cosmos.evm.erc20.v1.MsgConvertCoin: bank fUSD (what the faucet pays) -> ERC-20 fUSD.
 * The SDK registry has no codec for it, so a minimal protobuf encoder lives here
 * (cosmos/evm erc20 v1: coin = 1, receiver = 2, sender = 3). Verified end to end on 27 Nov (spike S-4).
 */
import type { GeneratedType } from "@cosmjs/proto-signing";
import type { DemoAccount } from "./accounts.js";
import { sendNative } from "./native.js";
import { FUSD_DENOM } from "./tokens.js";

export const CONVERT_COIN_TYPE_URL = "/cosmos.evm.erc20.v1.MsgConvertCoin";

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
const field = (no: number, bytes: Uint8Array) => [...varint((no << 3) | 2), ...varint(bytes.length), ...bytes];

interface ConvertCoin {
  coin: { denom: string; amount: string };
  receiver: string;
  sender: string;
}

export const MsgConvertCoin = {
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

/** Convert `amount` base units of bank fUSD to ERC-20 fUSD on the account's own 0x address. */
export function convertFusd(a: DemoAccount, amount: bigint, dryRun = false) {
  const msg = { typeUrl: CONVERT_COIN_TYPE_URL, value: { coin: { denom: FUSD_DENOM, amount: amount.toString() }, receiver: a.evm, sender: a.cosmos } };
  return sendNative(a, [msg], { simGas: 800_000n, extraTypes: [[CONVERT_COIN_TYPE_URL, MsgConvertCoin]], dryRun });
}
