---
name: integrate-qorex
description: Add the QoreX wallet to a dApp. Use when connecting QoreX through EIP-1193/EIP-6963, wagmi or RainbowKit, Interchain Kit or cosmos-kit, the Solana Wallet Standard, or QoreChain's native provider window.qorex.native, and when sending QoreChain transactions through QoreX.
---

# Integrate QoreX

QoreX is QoreChain's official wallet. Packages and guides: `https://github.com/qorechain/qorex-integrations` (npm: `@qorechain/qorex-types`, `@qorechain/qorex-rainbowkit`, `@qorechain/qorex-interchain-kit`, `@qorechain/qorex-cosmos-kit`, `@qorechain/qorex-wallet-mock`, `@qorechain/qorex-synpress`).

## Detect and connect

- EVM: QoreX announces itself through EIP-6963 with rdns `network.qore.qorex`. It never writes `window.ethereum`. Use `discoverQorexEip1193()` from `@qorechain/qorex-types`, or the RainbowKit wallet from `@qorechain/qorex-rainbowkit`.
- QoreChain native lane: `window.qorex.native` (Keplr-style, no `window.keplr` alias). `enable(chainId)`, `getKey(chainId)`; `pubKey` and `address` come as `number[]`.
- Cosmos kits: `@qorechain/qorex-interchain-kit` (preferred) or `@qorechain/qorex-cosmos-kit`.
- Solana: Wallet Standard on `solana:mainnet`. QoreChain's own SVM lane is not open yet and has no Wallet Standard chain id.
- Check `capabilities` before calling a method instead of guessing from versions.

## Sending on QoreChain

QoreChain requires a hybrid secp256k1 + ML-DSA-87 (FIPS 204) signature by default and only the wallet holds the ML-DSA-87 key, so a page cannot build a valid SignDoc. Send messages and let QoreX build, sign and broadcast:

```ts
import { qorexSignAndBroadcast } from "@qorechain/qorex-interchain-kit";

const { txHash, code, shield } = await qorexSignAndBroadcast({
  chainId: "qorechain-diana",
  messages: [{ typeUrl: "/cosmos.bank.v1beta1.MsgSend", value: MsgSend.encode(msg).finish() }],
  memo: "",
});
```

- Without a package: `window.qorex.native.signAndBroadcast(request)`, after checking `capabilities.includes("signAndBroadcast")`.
- 1 to 32 messages, memo up to 256 bytes, gas limit clamped to 100,000 to 5,000,000 (400,000 when omitted). QoreX sets and shows the fee.
- Messages that manage the account's ML-DSA-87 key are wallet-only and refused.
- `shield === "shielded"` once QoreX confirmed the committed transaction carries the hybrid layer. You can double-check with the MCP tool `get_pq_status`.
- Amino signing is refused by design. `signArbitrary` is not supported yet.
- Chain ids: `qorechain-vladi` (mainnet) and `qorechain-diana` (testnet) only; EVM 9801 and 9800.

## With the QoreChain MCP server

`prepare_transfer` returns the MsgSend in `readable`; pass that message to `signAndBroadcast`. Afterwards call `get_transaction` and `get_pq_status` with the hash.

## Testing

Use `@qorechain/qorex-wallet-mock` (jsdom and Playwright) or `@qorechain/qorex-synpress`; the mock signs for real on testnet with QoreSign. Its rdns differs from the real wallet so it is never mistaken for QoreX.

## Errors

QoreX errors are plain `Error` objects whose message starts with `QoreX`; some carry a numeric `code` (4902 for an unknown chain today, 4200 planned for unsupported methods). Check `code` first, then the message, using `isQorexUnsupportedMethodError` and `isQorexUnrecognizedChainError`.
