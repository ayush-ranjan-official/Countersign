/**
 * Shared chain helpers for the Countersign scripts (QoreChain testnet only).
 *
 * Endpoints come from the SDK's testnet preset, so nothing here is hard-coded
 * beyond what CLAUDE.md §2 lists and the preset confirms.
 */
import { createPublicClient, defineChain, http, encodeFunctionData, decodeAbiParameters, parseAbi, type Hex } from "viem";
import { getNetwork } from "@qorechain/sdk";

const net = getNetwork("testnet");

export const NATIVE_CHAIN_ID = net.chainId; // "qorechain-diana"
export const REST = process.env.QORE_REST_URL?.trim() || net.endpoints.rest;
export const RPC = process.env.QORE_RPC_URL?.trim() || net.endpoints.rpc;
export const EVM_RPC = process.env.QORE_EVM_URL?.trim() || "https://evm-testnet.qore.host";
export const EXPLORER = "https://explore.qore.network";

export const diana = defineChain({
  id: 9800,
  name: "QoreChain Testnet",
  nativeCurrency: { name: "QOR", symbol: "QOR", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
});

export const pub = createPublicClient({ chain: diana, transport: http(EVM_RPC) });

/** Lowercase on purpose: a mixed-case address fails the checksum check in Solidity. */
export const PQC_VERIFY = "0x0000000000000000000000000000000000000a01" as const;
export const PQC_KEY_STATUS = "0x0000000000000000000000000000000000000a02" as const;

const pqcAbi = parseAbi([
  "function pqcVerify(bytes pubkey, bytes signature, bytes message) view returns (bool)",
  "function pqcKeyStatus(address account) view returns (bool registered, uint8 algorithmId, bytes pubkey, bool possessionProven)",
]);

export const toHex = (b: Uint8Array): Hex => `0x${Buffer.from(b).toString("hex")}`;
export const fromHex = (h: string): Uint8Array => Uint8Array.from(Buffer.from(h.replace(/^0x/, ""), "hex"));

/**
 * eth_call to pqcVerify, checking the raw return length first (an inactive
 * precompile returns success with empty data, exactly what the contract must
 * fail closed on).
 */
export async function callPqcVerify(pubkey: Uint8Array, signature: Uint8Array, message: Uint8Array) {
  const data = encodeFunctionData({ abi: pqcAbi, functionName: "pqcVerify", args: [toHex(pubkey), toHex(signature), toHex(message)] });
  const res = await pub.call({ to: PQC_VERIFY, data });
  const raw = res.data ?? "0x";
  const len = (raw.length - 2) / 2;
  if (len !== 32) return { active: false as const, len, valid: false };
  const [valid] = decodeAbiParameters([{ type: "bool" }], raw);
  return { active: true as const, len, valid };
}

/** eth_call to pqcKeyStatus with the same fail-closed length check (>= 160 bytes). */
export async function callPqcKeyStatus(account: Hex) {
  const data = encodeFunctionData({ abi: pqcAbi, functionName: "pqcKeyStatus", args: [account] });
  const res = await pub.call({ to: PQC_KEY_STATUS, data });
  const raw = res.data ?? "0x";
  const len = (raw.length - 2) / 2;
  if (len < 160) return { active: false as const, len };
  const [registered, algorithmId, pubkey, possessionProven] = decodeAbiParameters(
    [{ type: "bool" }, { type: "uint8" }, { type: "bytes" }, { type: "bool" }],
    raw,
  );
  return { active: true as const, len, registered, algorithmId, pubkey: fromHex(pubkey), possessionProven };
}

export const txLink = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrLink = (addr: string) => `${EXPLORER}/address/${addr}`;
