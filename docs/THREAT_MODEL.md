# Countersign threat model

Countersign settles a tokenized bond against test dollars (fUSD) on QoreChain testnet. Delivery and payment happen in one transaction, or not at all. Every approval is an ML-DSA-87 (FIPS 204) signature that the contract verifies on chain.

This document covers three things:
- what Countersign protects, and against whom
- how each attack is stopped, with the test that proves it and the on-chain run that shows it
- what is **not** protected

Code: [`contracts/src/Countersign.sol`](../contracts/src/Countersign.sol). Tests: [`contracts/test/`](../contracts/test). On-chain evidence: [`docs/DEMO.md`](DEMO.md).

> **Testnet only.** The `pqcVerify` / `pqcKeyStatus` precompiles are active on `qorechain-diana` only. On mainnet they return empty data, and Countersign then refuses every affirmation (`PrecompileInactive`). It never accepts one silently. An AI audit is not a human audit.

---

## 1. Assets

| Asset | Where it lives | Why it matters |
|---|---|---|
| Security leg | CMTAT bond (Asset Kit `QoreChainHybridHolderRule` + guard), held in escrow between lock and settle | A long-lived instrument (5–30 years). A forged transfer instruction is a permanent loss. |
| Cash leg | fUSD ERC-20, held in escrow between lock and settle | The payment; must move only against delivery |
| Trade instructions | Party affirmations, the officer's four-eyes approval, the attestor's NAV | Binding settlement instructions. Whoever can forge them can trade someone else's assets. |
| Trade terms | Bound into `tradeId` | Changing a price, amount, party or deadline must make every existing signature useless |
| Ticket confidentiality (S3) | QoreSeal envelope; `ticketHash` on chain | Commercial details before settlement |

## 2. Actors and trust

| Actor | Trusted for | Not trusted for |
|---|---|---|
| Seller, buyer | Their own affirmation and their own lock | Anything about the other side's leg |
| Relayer / anyone | Nothing: they may submit signed affirmations, approvals and NAVs, and call `settle` / `reclaim` | Signatures authorise; the sender never does |
| Compliance officer | Four-eyes approval of trades with `cashAmount >= largeTradeThreshold` | Moving funds (it has no such power) |
| NAV attestor | Signed reference prices | Moving funds; it can only make `settle` refuse |
| Issuer (bond admin, guard owner) | Running the security: CMTAT admin and agent powers, guard exemptions | See residual risks R1–R2: the issuer can freeze its own security, including inside escrow |
| Countersign contract | Holding escrow and applying the rules | There is no owner, no admin, no upgrade path and no setter |
| QoreChain | Precompile correctness, key registry, EVM windows | (platform assumption) |

## 3. The attacker: the Q-Day drill

The attacker **holds the classical secp256k1 keys of the seller and the buyer**. They were stolen today, or derived from public keys after a cryptographically relevant quantum computer exists. The attacker does **not** hold their ML-DSA-87 keys.

With a classical key, the attacker can:
- sign EVM transactions as the victim, but only inside an EVM window that is already open (see §5)
- produce secp256k1 signatures and ADR-36 messages
- call any public function and front-run or relay anything they see in the mempool

The attacker cannot:
- produce an ML-DSA-87 signature that verifies under the victim's **registered** key
- open an EVM window for the victim: opening a window is a hybrid native-lane transaction that needs the ML-DSA-87 key

## 4. Security properties

| # | Property | How |
|---|---|---|
| P1 | No trade without both parties' post-quantum consent | `affirm` checks `pqcKeyStatus` (registered, algorithm 1, **possession proven**, 2,592-byte key), then `pqcVerify` over the exact QoreSign message-signing-v1 bytes. The key is read on every call, so rotation is picked up. |
| P2 | Signatures are bound to one trade, one contract and one chain | `tradeId = keccak256(TERMS_TYPEHASH, block.chainid, address(this), terms)`; the signed bytes carry the `qorechain-msg-v1\|qorechain-diana\|` domain and a message type (`affirm` / `approve` / `nav`) |
| P3 | Delivery versus payment: both legs move in one transaction, or neither | `settle` sets state first, then two `safeTransfer`s; any failure reverts both. Guarded by `nonReentrant`. |
| P4 | Escrow returns only to the original depositors | `reclaim*` pays `terms.seller` / `terms.buyer` only, after the deadline; no function takes a recipient |
| P5 | Large trades need a second approver; prices must be fresh and in band | `OfficerApprovalRequired`; `NavStale` (`maxNavAge`); `PriceOutOfBand` (`maxDeviationBps`); NAV nonces single-use and timestamps strictly increasing |
| P6 | Fail closed | Empty precompile data → `PrecompileInactive`; wrong lengths → `BadSignatureLength` / `UnsupportedKey`; the received amount is checked on every lock |

## 5. What the EVM authorisation window adds, and what it doesn't

A QoreChain EVM transaction is admitted only if the sender has a registered ML-DSA key and a live window. Countersign uses windows two ways:
- **Every party action is scoped:** `allowedTargets = [Countersign, bond, fUSD]`, a few txs, a few hundred blocks, bounded value. Deploys use a separate, small window. In the web app, QoreX opens a per-transaction window limited to the contracts it calls.
- **Spike S-5 showed, on chain, that a tx to any other address is refused at admission:** "the window does not list 0x… as an allowed recipient". The refusal consumes no nonce. Hashes are in [DEMO.md](DEMO.md).

**Honest limit:** a window caps time, transaction count, total value and recipients, **not token amounts**. While a victim's scoped window is open, a stolen classical key can send transactions *to those targets*, for example `bond.transfer(...)` of bonds still sitting in the victim's wallet. Countersign protects what is *in a trade*:
- escrowed legs move only through the post-quantum-approved rules (P1–P4)
- approvals are exact and pulled in full, so none is left over (A10)

It cannot protect tokens a victim keeps in a wallet during an open window. Short windows and the scoped QoreX per-transaction window keep that exposure small. See R6.

## 6. Attacks and their mitigations

`attack.ts` runs every row against the **real** testnet precompiles. It simulates each attack with `eth_call` and prints `BLOCKED: <error>`. It also broadcasts A1 for real, and runs an attacker-triggered reclaim after the deadline. Results and hashes: [DEMO.md](DEMO.md).

| # | Attack (classical key only) | Result | Foundry tests | On chain (`attack.ts`) |
|---|---|---|---|---|
| A1 | Forged affirmation signed with a random ML-DSA key | `BadPqcSignature` | `test_A1_forgedAffirmationWithRandomKey` | simulated **and broadcast**: the tx is mined and reverts |
| A2 | Classical-only (65-byte secp256k1) or empty PQ signature | `BadSignatureLength` | `test_A2_classicalOnlyOrEmptySignature` | simulated with a real signature from the stolen classical key |
| A3 | Replay a real affirmation on another trade, contract or chain | `BadPqcSignature` | `test_A3_replayOnAnotherTrade`, `test_A3_replayOnAnotherContract`, `test_A3_replayOnAnotherChain` | simulated with the seller's real ML-DSA signatures |
| A4 | Reclaim early, or reach the other side's leg | `DeadlineNotPassed`, `NotParty`; after the deadline funds go to the depositors only | `test_A4_reclaimBeforeDeadlineReverts_afterPaysOriginalDepositorsOnly`, `test_A4_classicalKeyCannotLockForTheOtherSide` | simulated; then the **attacker** triggers reclaim for real and the owners are paid |
| A5 | Change the terms (price, recipient) and reuse a signature | `BadPqcSignature`; the changed `tradeId` is `NotAffirmed` | `test_A5_changedTermsMeanADifferentTrade`, `testFuzz_anyChangedFieldChangesTradeId` | simulated |
| A6 | Large trade without the officer, or a forged officer approval | `OfficerApprovalRequired`, `BadPqcSignature` | `test_fourEyes_largeTradeNeedsOfficer`, `test_officerApproval_forgedOrReplayedIsRejected` | simulated on a locked trade at the threshold |
| A7 | Stale or off-band price; replayed or rolled-back NAV | `NavStale`, `PriceOutOfBand`, `NavNonceUsed`, `InvalidNav` | `test_nav_staleIsRejected`, `test_nav_offBandPriceIsRejected`, `test_nav_replayAndRollbackAreRejected`, `test_nav_forgedAndWrongCashAreRejected`, `testFuzz_settlementIsAllOrNothing` | simulated after waiting past `maxNavAge`, then against a fresh but distant NAV |
| A8 | Counterparty with no key, or a key without proof of possession | `KeyNotRegistered`, `KeyNotProven` | `test_A8_keyWithoutProofOfPossession`, `test_keyNotRegistered_wrongAlgorithm_wrongLength` | `KeyNotRegistered` simulated with a fresh account. The chain only registers keys **with** a proof, so the unproven case is covered by the Foundry test. |
| A9 | Precompile inactive (mainnet behaviour: success with empty data) | `PrecompileInactive` | `test_A9_inactiveKeyStatusPrecompileFailsClosed`, `test_A9_inactiveVerifyPrecompileFailsClosed` | read-only `eth_call` to `0x…0a02` on mainnet returns empty data |
| A10 | Leftover approvals after the window closes | Allowance is 0 after the exact pull | `test_A10_exactApproveAndPullLeaveZeroAllowance` | allowances read on chain after the locks |

Other tested failure modes:
- reentrancy through a malicious token in `settle` and `reclaim` (`test_reentrancy_*`)
- fee-on-transfer tokens (`test_feeOnTransferTokenIsRefused`)
- double settle, double lock, double affirm, lock before both affirmations, lock by a non-party, invalid terms, deadlines
- key rotation (`test_keyRotationIsPickedUp`)

Invariants (128 runs × 64 calls, 0 reverts with fail-on-revert):
- escrow balances equal the locked legs
- no settlement moves one leg only
- refunds go only to depositors
- closed trades hold nothing

## 7. Residual risks (not solved, stated plainly)

| # | Risk | Effect | Mitigation / note |
|---|---|---|---|
| R1 | **CMTAT issuer and agent powers:** `pause`, freeze, `forcedTransfer`, burn; the rule is bypassed by agent forced transfers | The issuer can freeze or move its own security, **also while it sits in Countersign's escrow** | By design of a regulated security. Per-leg reclaim (`reclaimCash`) means a frozen bond cannot trap the buyer's cash (`test_perLegReclaim_pausedBondDoesNotTrapCash`) |
| R2 | **Guard owner can un-exempt Countersign** | `settle` and the asset refund then fail the hybrid-holder check (Countersign is the sender) until it is exempted again; cash refunds still work | The issuer is trusted for the security leg; the exemption is an event (`ExemptionSet`) anyone can watch |
| R3 | **Attestor and officer are trusted roles.** Their keys are immutable addresses in the constructor | A compromised or absent attestor or officer can block settlement, or (attestor) move the price band | Both sign with ML-DSA-87, so a classical-key theft does not help an attacker. The price band only limits deviation from the *attested* price. The NAV source is off chain. |
| R4 | **Liveness and deadline griefing** | A counterparty can affirm and never lock; anyone can open trades naming a victim as counterparty (it costs the creator their own PQ signature and gas) | Funds lock only after **both** affirm; unlocked trades simply expire; locked legs come back after the deadline (anyone may trigger it). The app shows only trades the user is part of, with their status. |
| R5 | **Testnet-only precompiles** | On mainnet Countersign refuses everything | Fail-closed by design (A9); move to mainnet only once QoreChain activates the precompiles there |
| R6 | **A stolen classical key during an open window** | Tokens *outside* a trade (in the wallet) can be sent to an allowed target, e.g. a bond transfer | See §5: short, scoped windows; exact approvals; keep assets in trades or in accounts without an open window |
| R7 | **A stolen ML-DSA key** | That party is fully compromised (the post-quantum layer is the authority) | Key rotation on chain is picked up automatically (the key is read on every call); rotating also closes the account's EVM window |
| R8 | **QoreSeal limits (S3)** | Only the ticket payload is confidential; amounts and addresses become public at settlement; envelopes are not signed | `ticketHash` sits inside the affirmed terms, so recipients can check what they decrypted |
| R9 | **Demo bond faucet** | Anyone with a PQ key can claim demo bonds (once per 24 h per account; Sybil-able) | Testnet demo token only, clearly labelled; the guard still refuses classical-only accounts |
| R10 | **Token assumptions** | Rebasing tokens, or tokens with hooks beyond ERC-20, are not supported | Fee-on-transfer is refused at lock; reentrancy is guarded; the deployment uses the CMTAT bond and fUSD |
| R11 | **AI audit only** | QCAI findings can be incomplete or wrong | Two-stage QCAI audit plus tests, invariants and a mutation check; not a substitute for a human audit before mainnet |

## 8. Out of scope

Front-end compromise beyond what QoreX displays: QoreX shows the exact string being signed, and the app shows the decoded terms first. Also out of scope: QoreChain consensus or precompile bugs, and the economic soundness of the demo bond.
