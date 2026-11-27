/**
 * The five throwaway demo accounts, loaded from contracts/.env (gitignored):
 *   PRIVATE_KEY_<ROLE>            0x + 64 hex, the secp256k1 key
 *   QORE_PQC_RECOVERY_CODE_<ROLE> QRC1-..., the secret the ML-DSA-87 key is derived from
 * Secrets are never printed. Only addresses leave this module in logs.
 */
import { isValidRecoveryCode, unifiedAccountFromSeed, type UnifiedAccount } from "@qorechain/sdk";
import type { Hex } from "viem";
import { fromHex } from "./chain.js";

export const ROLES = ["ISSUER", "SELLER", "BUYER", "OFFICER", "ATTACKER"] as const;
export type Role = (typeof ROLES)[number];

export interface DemoAccount {
  role: Role;
  acc: UnifiedAccount;
  evm: Hex;
  cosmos: string;
}

export function loadAccount(role: Role): DemoAccount {
  const key = process.env[`PRIVATE_KEY_${role}`]?.trim();
  const code = process.env[`QORE_PQC_RECOVERY_CODE_${role}`]?.trim();
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error(`PRIVATE_KEY_${role} missing in .env (run: pnpm keygen)`);
  if (!code || !isValidRecoveryCode(code)) throw new Error(`QORE_PQC_RECOVERY_CODE_${role} missing or invalid in .env`);
  const acc = unifiedAccountFromSeed(fromHex(key), { recoveryCode: code });
  return { role, acc, evm: acc.evm as Hex, cosmos: acc.cosmos };
}

export const loadAll = () => ROLES.map(loadAccount);

export function roleArg(v: string | undefined, fallback: Role): Role {
  const r = (v ?? fallback).toUpperCase();
  if (!(ROLES as readonly string[]).includes(r)) throw new Error(`role must be one of ${ROLES.join(", ")}`);
  return r as Role;
}
