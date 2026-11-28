/**
 * QoreX native provider (window.qorex.native): message signing and native-lane transactions.
 * The EVM side goes through wagmi + @qorechain/qorex-rainbowkit (src/wagmi.ts).
 *
 * signArbitrary is called DIRECTLY (extension >= 0.4.0, app >= 1.2.1): the 0.1.0 connector packages still
 * refuse it. Its ML-DSA-87 half covers "qorechain-msg-v1|qorechain-diana|" + data, exactly the bytes
 * Countersign passes to the pqcVerify precompile (verified on testnet in spike S-2).
 */
import { toEvmAddress } from "@qorechain/evm";
import { getQorexEip1193Provider } from "@qorechain/qorex-rainbowkit";
import { bytesToHex, ripemd160, sha256, type Address, type Hex } from "viem";
import { FUSD_DENOM, NATIVE_CHAIN_ID } from "./config";

interface QorexKey {
  algo: string;
  pubKey: number[];
  bech32Address: string;
}
interface QorexMessageSignature {
  signatureType: string;
  pq?: { algorithmId: number; signature: string };
}
interface QorexNative {
  capabilities?: string[];
  enable(chainId: string): Promise<void>;
  getKey(chainId: string): Promise<QorexKey>;
  signArbitrary(chainId: string, signer: string, data: string): Promise<QorexMessageSignature>;
  signAndBroadcast(req: { chainId: string; messages: { typeUrl: string; value: Uint8Array }[]; memo?: string; gasLimit?: number }): Promise<{
    txHash: string;
    code: number;
    shield: string;
  }>;
}

export function qorexNative(): QorexNative | undefined {
  return (window as unknown as { qorex?: { native?: QorexNative } }).qorex?.native;
}

export const can = (cap: "signArbitrary" | "signAndBroadcast") => {
  const n = qorexNative();
  if (!n) return false;
  return n.capabilities?.includes(cap) === true || typeof (n as unknown as Record<string, unknown>)[cap] === "function";
};

export interface QorexAccount {
  qor1: string;
  evm: Address;
  /** true for an Ethereum-style (coin 60) account: the only kind that can send on QoreChain's EVM lane. */
  coin60: boolean;
}

/**
 * The active QoreX account on the native lane. getKey's `algo` is always "secp256k1", so the account kind is
 * derived instead: a coin-118 account's address is RIPEMD160(SHA256(pubKey)); a coin-60 account's is not.
 */
async function readNativeAccount(n: QorexNative): Promise<QorexAccount> {
  const key = await n.getKey(NATIVE_CHAIN_ID);
  const evm = toEvmAddress(key.bech32Address) as Address;
  const hash160 = ripemd160(sha256(Uint8Array.from(key.pubKey)));
  return { qor1: key.bech32Address, evm, coin60: evm.toLowerCase() !== hash160.toLowerCase() };
}

/** Check the wallet's current approval silently before reading its native account. */
export async function qorexAccount(address: Address): Promise<QorexAccount | null> {
  const native = qorexNative();
  const evm = getQorexEip1193Provider();
  if (!native || !evm) return null;
  const accounts = await evm.request({ method: "eth_accounts" });
  const activeAddress: unknown = Array.isArray(accounts) ? accounts[0] : undefined;
  if (typeof activeAddress !== "string" || activeAddress.toLowerCase() !== address.toLowerCase()) return null;
  const account = await readNativeAccount(native);
  return account.evm.toLowerCase() === address.toLowerCase() ? account : null;
}

/** Native-only accounts connect from an explicit user action. */
export async function connectNativeQorex(): Promise<QorexAccount> {
  const native = qorexNative();
  if (!native) throw new Error("QoreX not found: install the QoreX extension and enable testnet");
  await native.enable(NATIVE_CHAIN_ID);
  return readNativeAccount(native);
}

const b64ToHex = (b64: string): Hex => bytesToHex(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)));

/** Ask QoreX to sign `data`; returns the 4,627-byte ML-DSA-87 signature as hex, ready for the contract. */
export async function signData(signerQor1: string, data: string): Promise<Hex> {
  const n = qorexNative();
  if (!n || !can("signArbitrary")) throw new Error("This QoreX build has no signArbitrary (needs extension 0.4.0+ / app 1.2.1+)");
  const sig = await n.signArbitrary(NATIVE_CHAIN_ID, signerQor1, data);
  if (!sig.pq?.signature) throw new Error("QoreX returned no ML-DSA-87 part (classical-only signature)");
  return b64ToHex(sig.pq.signature);
}

// ---- MsgConvertCoin (bank fUSD -> ERC-20), protobuf: coin = 1 {denom = 1, amount = 2}, receiver = 2, sender = 3
const enc = new TextEncoder();
const varint = (n: number) => {
  const out: number[] = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
};
const field = (no: number, b: Uint8Array) => [...varint((no << 3) | 2), ...varint(b.length), ...b];

/** Convert bank fUSD to ERC-20 fUSD through QoreX (native lane, hybrid-signed by the wallet). */
export async function convertFusd(account: QorexAccount, amount: bigint) {
  const n = qorexNative();
  if (!n || !can("signAndBroadcast")) throw new Error("This QoreX build has no signAndBroadcast");
  const coin = Uint8Array.from([...field(1, enc.encode(FUSD_DENOM)), ...field(2, enc.encode(amount.toString()))]);
  const value = Uint8Array.from([...field(1, coin), ...field(2, enc.encode(account.evm)), ...field(3, enc.encode(account.qor1))]);
  const r = await n.signAndBroadcast({ chainId: NATIVE_CHAIN_ID, messages: [{ typeUrl: "/cosmos.evm.erc20.v1.MsgConvertCoin", value }], gasLimit: 600_000 });
  if (r.code !== 0) throw new Error(`refused on chain (code ${r.code}), tx ${r.txHash}`);
  return r;
}
