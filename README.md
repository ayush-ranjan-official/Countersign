# Countersign

**Post-quantum delivery-versus-payment (DvP) settlement for tokenized securities on QoreChain testnet.**

A tokenized bond and test dollars (fUSD) swap in one transaction, or not at all. Each party approves the trade with an **ML-DSA-87** signature that the contract checks on chain through QoreChain's `pqcVerify` / `pqcKeyStatus` precompiles. Someone who has stolen (or, after Q-Day, broken) a party's classical secp256k1 key still cannot forge a trade.

> QoreChain's own Asset Kit README lists *"Delivery versus payment with bilateral affirmation"* as **not provided by this kit on EVM**. Countersign is an EVM reference implementation of that missing settlement piece. It is designed so it could move to the proposed `x/settlement` module if that ships.

QoreChain Developer Fest, "Build Before Q-Day" (#BuildBeforeQDay), category **Post-Quantum dApp**.

> **Status: work in progress.** Contracts, tests, scripts and the web app are being built now. Every address and transaction hash will be listed in [docs/DEMO.md](docs/DEMO.md) as soon as it exists on chain.

## Honesty notes
- **Testnet only** (`qorechain-diana`, EVM chain id 9800). The PQC precompiles are not active on mainnet. There the contract fails closed (`PrecompileInactive`).
- The QCAI audit is an **AI audit, not a human audit**.

## Repository layout
```
contracts/   Foundry project: Countersign.sol, tests, deploy scripts, tsx operational scripts
app/         Vite + React + wagmi web app (QoreX wallet)
docs/        THREAT_MODEL, AUDIT, DEMO, ARCHITECTURE, audit reports
```

## Credits
Countersign builds on the following open-source work. See [NOTICE](NOTICE) for the licences.

| Component | Use |
|---|---|
| [QoreChain Asset Kit v0.1.0](https://github.com/qorechain/qorechain-asset-kit) | CMTAT bond token plus `QoreChainHybridHolderRule` / `QoreChainHybridHolderGuard` (security leg) |
| [CMTAT v3.2.0](https://github.com/CMTA/CMTAT) (MPL-2.0, unmodified submodule) | Swiss tokenized-security standard behind the bond |
| [OpenZeppelin Contracts](https://github.com/OpenZeppelin/openzeppelin-contracts) | `ReentrancyGuard`, `SafeERC20` |
| [forge-std](https://github.com/foundry-rs/forge-std) | Foundry tests and scripts |
| [Build Before Q-Day, workshop 2 (QDayVault)](https://github.com/qorechain/build-before-qday) | Reference pattern for fail-closed PQC checks, `vm.etch` mocks, window scripts, two-stage audit |
| [create-qorechain-dapp](https://www.npmjs.com/package/create-qorechain-dapp) | `foundry` and `viem-wagmi` templates used to scaffold `contracts/` and `app/` |
| QoreChain packages: `@qorechain/sdk`, `@qorechain/evm`, `@qorechain/qoresign`, `@qorechain/qoreseal`, `@qorechain/qorex-types`, `@qorechain/qorex-rainbowkit` | Accounts, windows, ML-DSA signing, QoreSeal, QoreX wallet |
| [QoreChain MCP](https://github.com/qorechain/qorechain-mcp) | Read-only chain tools and agent skills used while building (see [AI_USAGE.md](AI_USAGE.md)) |

## Licence
[Apache-2.0](LICENSE).
