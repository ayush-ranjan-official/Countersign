import { erc20Abi, type Abi, type Address } from "viem";
import shared from "../generated/contracts.json";

// VITE_DEPLOYMENT=local switches to your own stack (src/generated/contracts.local.json, gitignored; see docs/DEVELOPING.md)
const local = import.meta.glob("../generated/contracts.local.json", { eager: true, import: "default" });
const wantLocal = import.meta.env.VITE_DEPLOYMENT === "local";
const localFile = Object.values(local)[0] as typeof shared | undefined;
if (wantLocal && !localFile) throw new Error("VITE_DEPLOYMENT=local but src/generated/contracts.local.json is missing: run DEPLOYMENTS_DIR=deployments/local pnpm sync-contracts");
const generated: typeof shared = wantLocal && localFile ? localFile : shared;

export const CHAIN_ID = 9800;
export const NATIVE_CHAIN_ID = "qorechain-diana";
export const EXPLORER = "https://explore.qore.network";

const d = generated.deployment;
export const DEPLOYMENT = {
  label: d.label,
  countersign: d.countersign as Address,
  faucet: d.faucet as Address,
  bond: d.bond as Address,
  guard: d.guard as Address,
  officer: d.officer as Address,
  attestor: d.attestor as Address,
  largeTradeThreshold: BigInt(d.largeTradeThreshold),
  maxNavAge: BigInt(d.maxNavAge),
  maxDeviationBps: BigInt(d.maxDeviationBps),
  faucetAmount: BigInt(d.faucetAmount),
  deployBlock: BigInt(d.deployBlock),
};
export const FUSD = generated.fusd as Address;
export const FUSD_DENOM = `erc20:${generated.fusd}`;
export const BOND_DECIMALS = 0;
export const FUSD_DECIMALS = 6;

const extra = generated.abi.extraErrors as Abi;
/** Countersign + the bond's and guard rule's errors, so nested reverts decode by name. */
export const csAbi = [...(generated.abi.countersign as Abi), ...extra] as Abi;
export const faucetAbi = [...(generated.abi.faucet as Abi), ...extra] as Abi;
export const tokenAbi = [...erc20Abi, ...extra] as Abi;

/**
 * REST (LCD) API of the testnet. It sends no CORS headers, so the browser reaches it through a proxy:
 * the Vite dev/preview server forwards /lcd-testnet (vite.config.ts). A static host without a proxy
 * simply loses the REST-only extras (bank fUSD balance); everything else uses the EVM RPC.
 */
export const REST = (import.meta.env.VITE_REST_URL as string | undefined) ?? "/lcd-testnet";

export const txUrl = (hash: string) => `${EXPLORER}/tx/${hash}`;
export const addrUrl = (a: string) => `${EXPLORER}/address/${a}`;
