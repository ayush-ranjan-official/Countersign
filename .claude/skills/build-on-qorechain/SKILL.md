---
name: build-on-qorechain
description: Build dApps, backends and scripts on QoreChain. Use when the user wants to read QoreChain data, send QOR, deploy or call EVM contracts, or needs chain ids, endpoints, denominations, fees or the hybrid ML-DSA-87 signature rules.
---

# Build on QoreChain

## Facts to get right

| | Mainnet | Testnet |
|---|---|---|
| Native chain id | `qorechain-vladi` | `qorechain-diana` |
| EVM chain id | 9801 | 9800 |
| REST | `https://api.qore.host` | `https://api-testnet.qore.host` |
| RPC | `https://rpc.qore.host` | `https://rpc-testnet.qore.host` |
| EVM JSON-RPC | `https://evm.qore.host` | `https://evm-testnet.qore.host` |

- Explorer: `https://explore.qore.network` (switch network in the page). Docs: `https://docs.qorechain.io`.
- Addresses: bech32 prefix `qor` (validators `qorvaloper`); every account also has a `0x` form of the same 20 bytes. Coin type 118.
- Token: QOR. Native lane base unit `uqor`, 1 QOR = 10^6 uqor. On the EVM lane QOR has 18 decimals.
- Fees on the native lane: fee = gas limit x gas price; minimum gas price 0.1 uqor.
- Testnet QOR: the faucet on the QoreChain dashboard (`https://dashboard.qorechain.io/faucet`, sign-in required). There is no mainnet faucet.

## Signatures

- Native-lane transactions need a **hybrid signature**: secp256k1 plus ML-DSA-87 (FIPS 204), carried as one `/qorechain.pqc.v1.PQCHybridSignature` extension option in the transaction body. The network requires it by default.
- An account must register its ML-DSA-87 key once (`MsgRegisterPQCKeyV2`, signed classically) before it can send hybrid transactions.
- EVM-lane transactions are plain Ethereum transactions. They are accepted only when the sender has a registered ML-DSA-87 key and an EVM authorization window opened from the native lane.
- Amino JSON signing cannot carry the ML-DSA-87 layer: use SIGN_MODE_DIRECT.
- The EVM precompiles `0x0000000000000000000000000000000000000A01` (ML-DSA-87 verify) and `...0A02` (key status) are active on testnet only. On mainnet a call to them returns empty data without reverting, so always check the length of returned data.

## Working with the QoreChain MCP server

If the `qorechain` MCP server is connected, prefer its tools over hand-written HTTP calls:

1. `get_chain_info` first, to learn the network state (sign-bytes version, minimum gas price, active precompiles).
2. Reads: `get_address_info`, `get_transaction`, `get_block`, `get_validators`, `get_staking_tiers`, `search`, `read_contract` (eth_call only).
3. Before any transfer: `prepare_transfer` (unsigned), then `estimate_fee` or `simulate_tx`. Show the readable summary and warnings to the user. The user signs in their own wallet. Never ask for a recovery phrase or private key; the tools refuse them.
4. After the user broadcasts: `get_transaction`, then `get_pq_status` with the hash to confirm the hybrid layer verified.

Pass `"network": "mainnet"` explicitly for mainnet; the default is testnet. Start on testnet.

## Building

- TypeScript dApps: `@qorechain/sdk` (query clients, messages, staking tiers, protocol features). Signing for wallets and backends: `@qorechain/qoresign` (see the sign-and-send-with-qoresign skill). Wallet connection: the QoreX packages (see the integrate-qorex skill).
- EVM contracts: any Ethereum toolchain with the EVM chain ids above. Deployers need a registered ML-DSA-87 key and an open EVM window on the native lane.
- Simulate before signing. A refused simulation is a reason not to sign.

## Do not

- Do not invent chain ids, endpoints, token prices or an SVM chain id (QoreChain's SVM lane is not open yet).
- Do not describe the signature as anything beyond "hybrid secp256k1 + ML-DSA-87 (FIPS 204) signature".
- Do not handle a user's recovery phrase or private key.
