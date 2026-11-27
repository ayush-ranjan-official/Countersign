/**
 * Fest test tokens on qorechain-diana (CLAUDE.md §7, checked on 27 Nov 2026
 * against GET /cosmos/evm/erc20/v1/token_pairs/<addr>: enabled, OWNER_EXTERNAL).
 * The bank denom is case-sensitive and uses the EIP-55 spelling.
 */
export const FUSD = "0x97143B771D34ddb9130b807b135Ae675A5a963CA" as const; // 6 decimals
export const FUSD_DENOM = `erc20:${FUSD}` as const;
