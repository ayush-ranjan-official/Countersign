/**
 * accounts.ts - status of the five demo accounts: addresses, balances,
 * ML-DSA-87 key status (from the pqcKeyStatus precompile) and EVM window.
 *
 *   pnpm accounts
 */
import { evmWindowStatus } from "@qorechain/evm";
import { erc20Abi, formatUnits } from "viem";
import { REST, callPqcKeyStatus, pub } from "./lib/chain.js";
import { loadAccount, localRoles } from "./lib/accounts.js";
import { bankBalances } from "./lib/native.js";
import { FUSD, FUSD_DENOM } from "./lib/tokens.js";

for (const a of localRoles().map(loadAccount)) {
  const [bank, st, win, fusd] = await Promise.all([
    bankBalances(a.cosmos),
    callPqcKeyStatus(a.evm),
    evmWindowStatus({ rest: REST, address: a.cosmos }),
    pub.readContract({ address: FUSD, abi: erc20Abi, functionName: "balanceOf", args: [a.evm] }),
  ]);
  const key = !st.active
    ? `precompile inactive (${st.len} bytes)`
    : st.registered
      ? `registered alg=${st.algorithmId} proven=${st.possessionProven} key=${st.pubkey.length}B`
      : "NOT registered";
  const w = !win.found ? "none" : `${win.live ? "live" : "not usable"} (${win.remainingBlocks} blocks, ${win.remainingTxs} txs, ${win.remainingValue} uqor left)`;
  console.log(`${a.role}`);
  console.log(`  ${a.evm}  ${a.cosmos}`);
  console.log(`  QOR ${formatUnits(BigInt(bank.uqor ?? "0"), 6)}   fUSD bank ${formatUnits(BigInt(bank[FUSD_DENOM] ?? "0"), 6)}   fUSD erc20 ${formatUnits(fusd, 6)}`);
  console.log(`  PQC key: ${key}`);
  console.log(`  window:  ${w}`);
}
