# Countersign: two-stage QCAI audit

> The QCAI Contract Auditor (dashboard.qorechain.io → **AI Audit**) is an **AI audit, not a human audit**. Its findings can be incomplete or wrong. Countersign is testnet only; do not use it on mainnet without a human audit.

| | Stage 1 (draft) | Stage 2 (final) |
|---|---|---|
| Source | [`contracts/audit/Countersign_v0_draft.sol`](../contracts/audit/Countersign_v0_draft.sol), byte-identical to `src/Countersign.sol` at commit `be89506` (sha256 `6887fcd3…2c66`) | `contracts/src/Countersign.sol` after every Stage 1 finding is handled |
| Setting | **Ethereum (EVM/Solidity)**, the same setting for both stages | same |
| Date (UTC) | _pending_ | _pending_ |
| Score / risk | _pending_ | _pending_ |
| Report | `docs/audit/stage1-YYYY-MM-DD.pdf` (_pending_) | `docs/audit/stage2-YYYY-MM-DD.pdf` (_pending_) |

Zero findings is not required, and a lower Stage 2 score is not bad by itself. What matters is that every Stage 1 finding below is handled: fixed with a regression test, or explained.

## Stage 1 findings → fix → test

| # | Severity | Finding (as reported) | Handling | Regression test |
|---|---|---|---|---|
| _Stage 1 has not been run yet_ | | | | |

## Post-quantum design (why "quantum readiness: Not scored" is expected)

For Solidity, the auditor shows quantum readiness as "Not scored". That is expected: on the EVM the ML-DSA-87 check is done by the chain, through precompiles, not by Solidity code. This is where Countersign uses them.

| Call site | Precompile | What it protects | Fail-closed rule | Tests |
|---|---|---|---|---|
| `_requirePqSignature(account, message, sig)`, step 1 | `pqcKeyStatus` at `0x…0a02` (flat 2,500 gas) | The signer has a **registered** ML-DSA-87 key (algorithm 1, 2,592 bytes) **with proof of possession**. The key is read on every call and never stored, so on-chain key rotation is picked up. | `!ok \|\| ret.length < 160` → `PrecompileInactive`; then `KeyNotRegistered` / `KeyNotProven` / `UnsupportedKey` | `test_A8_keyWithoutProofOfPossession`, `test_keyNotRegistered_wrongAlgorithm_wrongLength`, `test_A9_inactiveKeyStatusPrecompileFailsClosed`, `test_keyRotationIsPickedUp` |
| `_requirePqSignature`, step 2 | `pqcVerify` at `0x…0a01` (25,000 + 8 gas per input byte) | The 4,627-byte ML-DSA-87 signature is valid for **exactly** `"qorechain-msg-v1\|qorechain-diana\|" + data` (QoreSign message-signing-v1, the bytes QoreX `signArbitrary` signs) | `sig.length != 4627` → `BadSignatureLength`; `!ok \|\| ret.length != 32` → `PrecompileInactive`; `false` → `BadPqcSignature` | `test_A1_*`, `test_A2_*`, `test_A3_*`, `test_A9_inactiveVerifyPrecompileFailsClosed`, `test_messageFormat_matchesQoreXSpikeVector` |
| `affirm(terms, party, sig)` | both, for the seller or buyer | Each party's consent to the exact terms: `data = "countersign:v1:affirm:" + tradeId`, and `tradeId` binds every term, the chain id and the contract | as above | `test_A5_changedTermsMeanADifferentTrade`, `testFuzz_anyChangedFieldChangesTradeId` |
| `approveLarge(tradeId, sig)` | both, for the officer | The four-eyes rule for `cashAmount >= largeTradeThreshold`: `data = "countersign:v1:approve:" + tradeId` | as above | `test_fourEyes_largeTradeNeedsOfficer`, `test_officerApproval_forgedOrReplayedIsRejected` |
| `postNav(asset, cash, price, ts, nonce, sig)` | both, for the attestor | A reference price bound to the asset **and** the cash token. Single-use nonce, strictly increasing timestamp. The message is human-readable so QoreX shows what is signed. | as above, plus `InvalidNav` / `NavNonceUsed` | `test_nav_*`, `testFuzz_settlementIsAllOrNothing` |

What a stolen classical key can and cannot do: see [THREAT_MODEL.md](THREAT_MODEL.md) §3–§6.

Evidence on the real precompiles (not mocks):
- **Spike S-1:** a fresh and a registered ML-DSA-87 key verify through `0x…0a01`; tampered variants return `false`.
- **Spike S-2:** a real QoreX `signArbitrary` signature verifies through `0x…0a01`.
- **Trades:** both testnet trades and the `attack.ts` drill ran against the live precompiles.
- Hashes: [DEMO.md](DEMO.md).

## Other assurance

- **Foundry:** 55 tests (unit, fuzz, invariant) with the precompiles mocked by `vm.etch` (pattern from the Build Before Q-Day workshop 2 QDayVault test).
- **Invariants:** 128 runs × 64 calls each, 0 reverts with `FOUNDRY_INVARIANT_FAIL_ON_REVERT=true`.
- **Mutation check:** 6 hand-made mutants of security-critical lines, all killed (see [AI_USAGE.md](../AI_USAGE.md), T6).
