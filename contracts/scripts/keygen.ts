/**
 * keygen.ts - create the five THROWAWAY testnet demo accounts.
 *
 * For each role without a key in contracts/.env, appends
 *   PRIVATE_KEY_<ROLE>=0x...            (CSPRNG secp256k1 key)
 *   QORE_PQC_RECOVERY_CODE_<ROLE>=QRC1-... (generatePqcRecoveryCode)
 * Existing roles are never overwritten (a new recovery code = a different
 * ML-DSA-87 key, which would orphan a registered account).
 *
 * Prints addresses only. Secrets go to .env (gitignored) and nowhere else.
 */
import { randomBytes } from "node:crypto";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import { generatePqcRecoveryCode, unifiedAccountFromSeed } from "@qorechain/sdk";
import { ROLES } from "./lib/accounts.js";

const ENV = ".env";
const current = existsSync(ENV) ? readFileSync(ENV, "utf8") : "";
const has = (k: string) => new RegExp(`^${k}=\\S+`, "m").test(current);

let added = "";
for (const role of ROLES) {
  if (has(`PRIVATE_KEY_${role}`)) {
    const key = current.match(new RegExp(`^PRIVATE_KEY_${role}=(\\S+)`, "m"))![1]!;
    const code = current.match(new RegExp(`^QORE_PQC_RECOVERY_CODE_${role}=(\\S+)`, "m"))?.[1];
    if (!code) throw new Error(`${role} has a key but no recovery code in .env: fix by hand, do not regenerate`);
    const a = unifiedAccountFromSeed(Uint8Array.from(Buffer.from(key.slice(2), "hex")), { recoveryCode: code });
    console.log(`${role.padEnd(8)} ${a.evm}  ${a.cosmos}  (existing)`);
    continue;
  }
  for (;;) {
    const seed = randomBytes(32);
    const code = generatePqcRecoveryCode();
    try {
      const a = unifiedAccountFromSeed(seed, { recoveryCode: code });
      added += `PRIVATE_KEY_${role}=0x${seed.toString("hex")}\nQORE_PQC_RECOVERY_CODE_${role}=${code}\n`;
      console.log(`${role.padEnd(8)} ${a.evm}  ${a.cosmos}  (new)`);
      break;
    } catch {
      // not a valid secp256k1 scalar (astronomically rare): draw again
    }
  }
}
if (added) {
  appendFileSync(ENV, `\n# --- Countersign throwaway TESTNET demo accounts (keygen.ts, ${new Date().toISOString()}) ---\n${added}`);
  console.log(`secrets appended to contracts/${ENV} (gitignored). Back it up somewhere private; never commit it.`);
}
