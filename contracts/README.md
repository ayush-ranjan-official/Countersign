# Countersign contracts

A Foundry project for the QoreChain EVM, scaffolded with `create-qorechain-dapp` (foundry template). It holds:

| Path | What |
|---|---|
| `src/Countersign.sol` | Post-quantum DvP escrow: ML-DSA-87 affirmations verified with the `pqcVerify` precompile, atomic settle, reclaim after the deadline, four-eyes, NAV band |
| `src/DemoBondFaucet.sol` | Testnet demo only: any hybrid holder claims demo bonds, so anyone can be a seller |
| `src/interfaces/IQorePQC.sol` | The `pqcVerify` (`0x…0a01`) / `pqcKeyStatus` (`0x…0a02`) precompiles |
| `script/DeployBond.s.sol` | Asset Kit CMTAT bond + hybrid-holder guard + rule (broadcast version of the kit's `DeployCmtat.s.sol`) |
| `test/` | Unit, fuzz and invariant tests; precompiles mocked with `vm.etch` |
| `audit/` | `*_v0_draft.sol`: the exact sources submitted to the Stage 1 QCAI audit |
| `scripts/` | tsx operational scripts: accounts, funding, PQC registration, scoped windows, fUSD conversion, spikes |
| `deployments/` | Addresses written by real broadcasts only (never by dry runs) |

## Build and test

```sh
pnpm install
forge build
forge test
pnpm typecheck
```

## Operational scripts (testnet only)

The five demo accounts are throwaway testnet keys created by `pnpm keygen` into `.env` (gitignored).

```sh
pnpm accounts                        # addresses, balances, ML-DSA key status, windows
pnpm register all                    # MsgRegisterPQCKeyV2 with proof of possession
pnpm fund                            # ISSUER -> demo accounts (bank MsgSend)
pnpm window open ISSUER --deploy     # deploy window (no allowedTargets)
pnpm window open BUYER --targets 0xCountersign,0xBond,0xfUSD   # scoped window
pnpm convert-fusd BUYER 100          # MsgConvertCoin: bank fUSD -> ERC-20 fUSD
```

Every script simulates before it broadcasts and appends real tx hashes to `../docs/DEMO.md`.
