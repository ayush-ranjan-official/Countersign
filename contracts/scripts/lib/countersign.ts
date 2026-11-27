/**
 * Countersign helpers shared by trade.ts and attack.ts: deployment, ABI, Terms, and ML-DSA-87 signing of the
 * exact strings the contract verifies (QoreSign message-signing-v1, the same bytes QoreX signArbitrary signs).
 */
import { encodeAbiParameters, keccak256, toBytes, type Abi, type Hex } from "viem";
import { pqcSign } from "@qorechain/sdk";
import { messagePqSignBytes } from "@qorechain/qoresign";
import { NATIVE_CHAIN_ID, pub, toHex } from "./chain.js";
import type { DemoAccount } from "./accounts.js";
import { artifactAbi, errorsOf, readDeployment } from "./evm.js";

export interface Deployment {
  label: string;
  countersign: Hex;
  faucet: Hex;
  bond: Hex;
  guard: Hex;
  officer: Hex;
  attestor: Hex;
  largeTradeThreshold: number;
  maxNavAge: number;
  maxDeviationBps: number;
}

export const dep = () => readDeployment<Deployment>("countersign");

export const csAbi: Abi = artifactAbi("Countersign.sol", "Countersign");
export const bondAbi: Abi = artifactAbi("CMTATStandalone.sol", "CMTATStandalone");
export const faucetAbi: Abi = artifactAbi("DemoBondFaucet.sol", "DemoBondFaucet");
/** Every custom error a Countersign call can bubble up (its own, the bond's, the guard rule's). */
export const allErrors: Abi = errorsOf(
  csAbi,
  bondAbi,
  faucetAbi,
  artifactAbi("QoreChainHybridHolderRule.sol", "QoreChainHybridHolderRule"),
  artifactAbi("QoreChainHybridHolderGuard.sol", "QoreChainHybridHolderGuard"),
);

export interface Terms {
  seller: Hex;
  buyer: Hex;
  asset: Hex;
  assetAmount: bigint;
  cash: Hex;
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

/** tradeId computed off chain, the same way as Countersign.tradeIdOf (checked against the contract view). */
export function tradeIdLocal(t: Terms, countersign: Hex, chainId = 9800n): Hex {
  return keccak256(
    encodeAbiParameters(
      [
        { type: "bytes32" },
        { type: "uint256" },
        { type: "address" },
        {
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
        },
      ],
      [TERMS_TYPEHASH, chainId, countersign, t],
    ),
  );
}

export const affirmDataLocal = (id: Hex) => `countersign:v1:affirm:${id.toLowerCase()}`;
export const approveDataLocal = (id: Hex) => `countersign:v1:approve:${id.toLowerCase()}`;

/** ML-DSA-87 signature over messagePqSignBytes("qorechain-diana", data): what QoreX signArbitrary produces too. */
export function pqSignData(a: DemoAccount, data: string): Hex {
  return toHex(pqcSign(a.acc.pqc.secretKey, messagePqSignBytes(NATIVE_CHAIN_ID, data)));
}

export async function readView<T>(cs: Hex, functionName: string, args: readonly unknown[] = []): Promise<T> {
  return (await pub.readContract({ address: cs, abi: csAbi, functionName, args } as never)) as T;
}

export const STATUS = ["None", "Open", "Settled", "Reclaimed"] as const;
