import { encodeAbiParameters, keccak256, toBytes, type Address, type Hex } from "viem";
import { CHAIN_ID, DEPLOYMENT } from "./config";

export interface Terms {
  seller: Address;
  buyer: Address;
  asset: Address;
  assetAmount: bigint;
  cash: Address;
  cashAmount: bigint;
  deadline: bigint;
  ticketHash: Hex;
  salt: bigint;
}

export const TERMS_TYPEHASH = keccak256(
  toBytes(
    "Countersign.Terms(address seller,address buyer,address asset,uint256 assetAmount,address cash,uint256 cashAmount,uint64 deadline,bytes32 ticketHash,uint256 salt)",
  ),
);

const termsTuple = {
  type: "tuple",
  components: [
    { name: "seller", type: "address" },
    { name: "buyer", type: "address" },
    { name: "asset", type: "address" },
    { name: "assetAmount", type: "uint256" },
    { name: "cash", type: "address" },
    { name: "cashAmount", type: "uint256" },
    { name: "deadline", type: "uint64" },
    { name: "ticketHash", type: "bytes32" },
    { name: "salt", type: "uint256" },
  ],
} as const;

/** Same as Countersign.tradeIdOf; the UI cross-checks it against the contract view before anyone signs. */
export function tradeIdOf(t: Terms): Hex {
  return keccak256(
    encodeAbiParameters([{ type: "bytes32" }, { type: "uint256" }, { type: "address" }, termsTuple], [
      TERMS_TYPEHASH,
      BigInt(CHAIN_ID),
      DEPLOYMENT.countersign,
      t,
    ]),
  );
}

export const affirmData = (id: Hex) => `countersign:v1:affirm:${id.toLowerCase()}`;
export const approveData = (id: Hex) => `countersign:v1:approve:${id.toLowerCase()}`;

export function randomSalt(): bigint {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return BigInt(`0x${Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")}`);
}

/** The plaintext ticket: its keccak256 goes into the terms (ticketHash); QoreSeal can seal the JSON itself. */
export function makeTicket(t: Omit<Terms, "ticketHash">): { json: string; hash: Hex } {
  const json = JSON.stringify({
    type: "countersign-trade-ticket",
    version: 1,
    instrument: { id: "DEMO-CSB-2031", token: t.asset, note: "testnet demo bond, not a real security" },
    quantity: t.assetAmount.toString(),
    consideration: { amount: t.cashAmount.toString(), token: t.cash, decimals: 6 },
    seller: t.seller,
    buyer: t.buyer,
    settlement: { method: "DvP on Countersign", venue: DEPLOYMENT.countersign, chain: "qorechain-diana", deadlineUnix: t.deadline.toString() },
    salt: t.salt.toString(),
  });
  return { json, hash: keccak256(toBytes(json)) };
}

// ---- share links: the terms travel in the URL fragment (never sent to a server)
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));

export function encodeTerms(t: Terms): string {
  return b64url(JSON.stringify(t, (_, v) => (typeof v === "bigint" ? v.toString() : v)));
}

export function decodeTerms(s: string): Terms {
  const o = JSON.parse(unb64url(s)) as Record<string, string>;
  const addr = (k: string) => {
    if (!/^0x[0-9a-fA-F]{40}$/.test(o[k] ?? "")) throw new Error(`bad ${k} in link`);
    return o[k] as Address;
  };
  return {
    seller: addr("seller"),
    buyer: addr("buyer"),
    asset: addr("asset"),
    assetAmount: BigInt(o.assetAmount!),
    cash: addr("cash"),
    cashAmount: BigInt(o.cashAmount!),
    deadline: BigInt(o.deadline!),
    ticketHash: o.ticketHash as Hex,
    salt: BigInt(o.salt!),
  };
}

export const shareLink = (t: Terms) => `${location.origin}${location.pathname}#/t/${encodeTerms(t)}`;

// ---- signatures in links (relay): a coin-118 account can sign but not send, so anyone may submit its signature
export function sigToParam(sig: Hex): string {
  const bytes = sig.slice(2).match(/../g)!.map((h) => String.fromCharCode(parseInt(h, 16))).join("");
  return b64url(bytes);
}
export function paramToSig(p: string): Hex {
  const bin = unb64url(p);
  return `0x${Array.from(bin, (c) => c.charCodeAt(0).toString(16).padStart(2, "0")).join("")}` as Hex;
}
