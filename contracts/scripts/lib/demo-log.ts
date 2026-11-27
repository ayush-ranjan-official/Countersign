/**
 * Appends real tx hashes to docs/DEMO.md (Transactions table, last section).
 * Only called with hashes returned by the chain.
 */
import { appendFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { txLink } from "./chain.js";

const DEMO = resolve(import.meta.dirname, "../../../docs/DEMO.md");

export function logTx(step: string, hash: string, result: string) {
  const line = `| ${new Date().toISOString().replace(/\.\d+Z$/, "Z")} | ${step} | [\`${hash.slice(0, 10)}…\`](${txLink(hash)}) \`${hash}\` | ${result} |\n`;
  if (existsSync(DEMO)) appendFileSync(DEMO, line);
  console.log(`  tx ${hash}\n  ${txLink(hash)}`);
}
