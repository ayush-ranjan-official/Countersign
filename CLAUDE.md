# CLAUDE.md: Countersign

> Context file for Claude Code. Read all of it before writing code.
> The facts below were checked against the official docs and the QoreChain kit repos on **27 Nov 2026**.
> If something here disagrees with the live docs or the kit source code, trust the source, then fix this file.

---

## 0. Summary

- **What we build:** **Countersign**, post-quantum **delivery-versus-payment (DvP)** settlement for tokenized securities on the QoreChain testnet. A tokenized bond and test dollars (fUSD) swap in one transaction, or not at all. Each party approves the trade with an ML-DSA-87 (post-quantum) signature that the contract checks on chain.
- **Hackathon:** QoreChain Developer Fest, "Build Before Q-Day" (#BuildBeforeQDay).
- **Category:** **Post-Quantum dApp**. Prizes: 1st $1,500 / 2nd $750 / 3rd $500. Team size 1 to 3.
- **How we work:** one builder (the repo owner) builds the whole project end to end, in **a single Claude Code session**. There is no split into parts or roles. You (Claude Code) own every part: contracts, tests, scripts, app, docs. The builder does the human-only steps (§13).
- **Hard deadline: 2 Dec 2026, 23:59 UTC (= Thu 3 Dec, 05:29 IST).** The project locks automatically; there is no submit button. Aim to be finished on the evening of 2 Dec IST.
- **Project page:** https://build.qorechain.io/p/countersign. Members listed: @Adithya2310, @ayush-ranjan-official, @anynomousfriend. All listed members must stay fully registered (§3a).
- **Pitch:** "QoreChain's own Asset Kit says DvP settlement is missing on EVM. Countersign builds it: atomic bond-for-cash settlement in which every approval carries a post-quantum signature verified on chain, so a stolen or broken classical key cannot forge a trade."

---

## 1. Why this project (decided: do not revisit)

1. **It fills a gap the organisers wrote down themselves.** The Asset Kit README (github.com/qorechain/qorechain-asset-kit) lists **"Delivery versus payment with bilateral affirmation"** and **"NAV, reserves and audit attestations with staleness"** as *"Not provided by this kit on EVM"*. The native `x/settlement` and `x/attest` modules are proposals only, with no upgrade scheduled. We build both on the EVM lane on top of their kit. Present it as *"an EVM reference implementation of the Asset Kit's missing settlement piece, designed so it could move to `x/settlement` if that ships."*
2. **It fits how QoreChain sells itself.** They pitch to institutions ("quantum-safe infrastructure is a fiduciary requirement for long-term assets"), they are a Swiss association, and CMTAT is a Swiss token standard that their kit supports.
3. **The problem is real.** DvP is the standard way securities settle: the asset moves only if the payment moves. The ERC3643 Association has launched cross-chain DvP with Tokeny, LayerZero, Fasanara and ABN AMRO, and J.P. Morgan Kinexys has run one with Ondo and Chainlink. Tokenized real-world assets are about $38–39B on chain (rwa.xyz, Sep–Oct 2026). None of these use post-quantum signatures.
4. **The quantum angle.** A trade affirmation is a binding settlement instruction on an asset that may live 5 to 30 years. If a classical key is stolen, or broken in the future, an attacker could forge an affirmation. Countersign accepts only ML-DSA-87 affirmations, verified on chain against each party's registered key.
5. **Competition (as of 27 Nov):** 205 projects in total, 52 in Post-Quantum dApp. Ours is the only DvP project. The closest is **T-REX ID** (ERC-3643 identity plus bond issuance; no DvP, no cash leg, no NAV). Most Post-Quantum dApp entries are generic vaults and escrows. What sets us apart: a compliance-checked security leg, bilateral PQ affirmation, a four-eyes rule and a fresh-NAV check.
6. **We do not compete with QoreChain's own products.** Their issuer console handles issuance and admin; we handle settlement. **Do not build:** a wallet, explorer, name service, DEX, crypto-inventory scanner, issuer console or AI auditor.

---

## 2. Hackathon facts and links

| What | Link |
|---|---|
| Start / overview | https://build.qorechain.io/start |
| Prizes | https://build.qorechain.io/prizes |
| Rules | https://build.qorechain.io/rules |
| FAQ (builder) | https://build.qorechain.io/faq |
| Kits | https://build.qorechain.io/kits |
| Projects | https://build.qorechain.io/projects |
| Live feed | https://build.qorechain.io/feed |
| My space (team, check verification) | https://build.qorechain.io/me |
| Docs | https://docs.qorechain.io |
| SDK quickstart | https://docs.qorechain.io/sdk/quickstart/ |
| EVM development (windows, fest tokens) | https://docs.qorechain.io/developer-guide/evm-development |
| EVM precompiles | https://docs.qorechain.io/developer-guide/evm-precompiles |
| QoreX dApp integration | https://docs.qorechain.io/qorex/dapp-integration |
| Asset Kit docs | https://docs.qorechain.io/developer-tools/asset-kit |
| MCP server | https://docs.qorechain.io/developer-tools/mcp |
| Workshop 2 (PQ vault + audit: **our template**) | https://docs.qorechain.io/build-before-qday/workshop-2 |
| Workshop 3 (QoreSeal) | https://docs.qorechain.io/build-before-qday/workshop-3 |
| Faucet (sign-in) | https://dashboard.qorechain.io/faucet |
| AI audit (QCAI Contract Auditor) | https://dashboard.qorechain.io (AI Audit) |
| Explorer | https://explore.qore.network |
| Discord (ask #builders) | https://discord.gg/qorechain |

**Testnet network**

| | Value |
|---|---|
| Native chain id | `qorechain-diana` |
| EVM chain id | `9800` |
| REST | `https://api-testnet.qore.host` |
| RPC | `https://rpc-testnet.qore.host` |
| EVM JSON-RPC | `https://evm-testnet.qore.host` |
| Chain version | v3.2.8 |

**Key dates (UTC):** checks 3–5 Dec · jury scoring 6–15 Dec (finalists may get a change request with 48 h to answer) · winners 16 Dec · People's Choice vote (QoreX, mainnet) 6–15 Dec.

---

## 3. What we must have to be eligible and to score well

### 3a. Submission checks (failing any one = excluded)
- [ ] **Every** team member fully registered: 18+, GitHub, X and a QoreX testnet address connected.
- [ ] **Public GitHub repo**, licence detected by GitHub as MIT or Apache-2.0. **We use Apache-2.0** (a `LICENSE` file at the root). The repo must not be used by another project.
- [ ] **README** that credits every open-source library, kit and template we use (rule: kits "must be credited in the README"). No copied projects.
- [ ] **Demo video ≤ 3 minutes** showing the project working.
- [ ] **Testnet addresses:** at least one `qor1…` address the project uses, listed on the project page. List all demo accounts.
- [ ] **Category = Post-Quantum dApp.** Tick only the kits and network features that are really in the code. *Verified* status is automatic: kits are read from dependency files; features are read from transactions of the listed addresses. `create-qorechain-dapp` and the Solidity PQC verify/key-status features are checked by jurors by hand.
- [ ] **QoreChain Build GitHub App** installed on the repo, so commits show in the feed. Commits made during the fest count.
- [ ] Name, description and "How it's made" filled in. Cover image 16:9, ≥1200×675, JPG/PNG/WebP, ≤5 MB (optional; one is generated otherwise).

### 3b. Post-Quantum dApp category requirements (all four)
1. **Scoped EVM window** (limited blocks, transactions, value and **targets**).
2. **`pqcVerify`** used on chain for the sensitive actions.
3. **Two-stage QCAI audit.**
4. **Foundry or Hardhat tests** (we use Foundry).

**How the QCAI audit must be done:**
- Use dashboard.qorechain.io → **AI Audit**. Pick an **EVM/Solidity setting**, for example "Ethereum (EVM/Solidity)". The QoreChain/CosmWasm setting is for CosmWasm contracts and shows a mismatch on Solidity. Use **the same setting for both stages**.
- **Stage 1:** audit the draft contract. Keep that draft as `contracts/audit/Countersign_v0_draft.sol`.
- Handle every Stage 1 finding: fix it with a regression test, or document it as a false positive.
- **Stage 2:** run the audit again on the final contract. Zero findings is not required, and a lower Stage 2 score is not bad by itself.
- Solidity shows quantum readiness as "Not scored". That is expected; explain the PQ design in `docs/AUDIT.md` instead.
- Put both dated PDF reports in `docs/audit/`, the finding → fix → test table in `docs/AUDIT.md`, and link it from the README and from "How it's made". Jurors read the reports by hand; the score is not fed into judging.

### 3c. Extra prizes
- **Best AI-Native Build ($500, can be won on top of the category prize):** tick AI-native on the form and add **`AI_USAGE.md`** documenting the workflow, what the AI generated and what humans contributed. Other teams claim AI-native too, so ours must be the most concrete (see §13).
- **Top-Quality (7 × $250):** for projects that win no other prize, score ≥70/100 and pass every check.
- **Regional Asia-Pacific ($200):** for projects that win no other prize. Choose **India** on the form; winners may be asked for proof of residence.
- **People's Choice:** community vote in QoreX on mainnet, 6–15 Dec. Build in public on X with #BuildBeforeQDay.
- The rubric weights are not published. The jury breaks Q-Day Drill ties on the **threat model**, which shows they value one, so write a strong `docs/THREAT_MODEL.md`.

---

## 4. Product spec

### Actors
| Actor | Role |
|---|---|
| Issuer / admin | Deploys the bond token (Asset Kit CMTAT plus holder guard), mints to the seller, exempts Countersign in the guard. Also acts as NAV attestor in the demo. |
| Seller | Holds bond tokens. |
| Buyer | Holds fUSD. |
| Compliance officer | Second approver (four-eyes) for large trades. |
| Relayer / anyone | May submit signed affirmations and call `settle` / `reclaim`. The signatures authorise; the sender does not matter. |
| Attacker | Holds the **classical secp256k1 keys** of the seller and buyer, but not their ML-DSA-87 keys. |

### Flow
1. Seller and buyer agree on the **Terms** off chain (asset, amount, cash token, price, deadline, `ticketHash`, salt).
2. **Affirm:** each party signs the affirmation message with ML-DSA-87 (QoreX `signArbitrary`, or `pqcSign` in scripts). Anyone submits `affirm(terms, party, sig)`.
3. **Lock:** after both have affirmed, the seller calls `lockAsset(tradeId)` and the buyer calls `lockCash(tradeId)`. Each pulls the **exact** amount with `transferFrom` after an **exact** `approve`.
4. **Settle:** anyone calls `settle(tradeId)`. It requires both affirmations, both legs locked, `block.timestamp <= deadline`, the officer's approval if `cashAmount >= largeTradeThreshold`, and a fresh in-band NAV if a NAV attestor is configured. It moves the asset to the buyer and the cash to the seller **in the same transaction** and emits `Settled`.
5. **Reclaim:** after the deadline, if not settled, anyone calls `reclaim(tradeId)`. Each locked leg goes back **only to its original depositor**.

### Features by priority (never start a level until the one before works on testnet)
**MUST**
- **M1** `Countersign.sol` core: Terms, `tradeId`, affirm, lock, settle, reclaim.
- **M2** On-chain PQ checks: `pqcKeyStatus` (registered, `algorithmId == 1`, `possessionProven`, 2,592-byte key) plus `pqcVerify` over the exact bytes. Fail closed when a precompile returns empty data.
- **M3** Security leg = Asset Kit **CMTAT** token with `QoreChainHybridHolderRule` / `QoreChainHybridHolderGuard`; Countersign exempted in the guard. Cash leg = **fUSD** ERC-20.
- **M4** A **scoped EVM window** for every user action (`allowedTargets` = Countersign + asset + fUSD). Deploys use a separate, small window (a targeted window refuses contract creation).
- **M5** Foundry tests: unit, fuzz and invariant, with the precompiles mocked via `vm.etch`.
- **M6** Two-stage QCAI audit plus `docs/AUDIT.md`.
- **M7** A full run on testnet plus the **attack demo**, with every tx hash recorded in `docs/DEMO.md`.
- **M8** Minimal web app: connect QoreX, create a ticket, affirm (`signArbitrary`), approve + lock, settle or reclaim, trade status.

**SHOULD**
- **S1 Four-eyes rule:** if `cashAmount >= largeTradeThreshold`, the officer's ML-DSA approval is required (message type `approve`).
- **S2 Fair-price / NAV check:** the attestor posts an ML-DSA-signed NAV (asset, price per unit in cash base units, timestamp, nonce). `settle` requires `age <= maxNavAge` and a deviation of at most `maxDeviationBps` between the trade price and the NAV. Skip the check if the attestor is `address(0)`.
- **S3 Sealed trade ticket (QoreSeal, ML-KEM-1024):** the full ticket JSON (terms, ISIN-style id, settlement notes, salt) is sealed to the seller, the buyer and an auditor. The on-chain `ticketHash = keccak256(plaintextTicket)` sits inside Terms, so recipients can check what they decrypted. Publish the envelope in an event `TicketSealed(tradeId, envelope)` or as a file. Say honestly that amounts and addresses become public at settlement.

**SELF-SERVE (decided by the builder on 27 Nov 2026: "anyone with a wallet can use the app, without me sharing any keys")**

Anyone with QoreX must be able to use the hosted app end to end, with no address collection and no shared keys. This shapes M1 (contract) and M8 (app):
- **Readiness check in the app** (automates the manual address checks). It covers:
  - a coin-60 account
  - an ML-DSA key that is registered and possession-proven, read with `eth_call` to `0x…0a02` (the EVM RPC allows CORS `*`)
  - QOR and fUSD balances
  - a "convert fUSD" step. Whether QoreX signs `MsgConvertCoin` from a site is untested; the fallback is instructions.
  - a faucet link when funds are missing
- **Trades by shareable link** (terms encoded in the URL) **plus on-chain discovery:** the first affirmation emits `TradeOpened(tradeId, seller indexed, buyer indexed, terms)`. "My trades" is built from `getLogs`. This adds an event only, no new powers.
- **Demo bond faucet** (`DemoBondFaucet`): the issuer grants it CMTAT `MINTER_ROLE`. Any wallet the guard accepts as a hybrid holder can claim a fixed amount of the demo bond once per 24 h. The guard still refuses wallets without a PQ key. It is clearly labelled as a testnet demo, not issuance, and not an issuer console.
- **Officer and NAV attestor sign in the app** with QoreX `signArbitrary`; anyone may submit their signatures. Their addresses are immutable constructor parameters, so choose them before the final deploy.
- **NAV freshness for a public app:** size `maxNavAge` for real use (e.g. 24 h). The posting cadence is to be decided: in-app by the attestor, or a scheduled script.
- **Hosting:** public HTTPS, plus a rewrite proxy for the REST API (it sends no CORS headers). The EVM RPC needs no proxy.
- **Order:** the contract parts go into M1 before the Stage 1 audit; the app parts into M8. The builder asked to wait for S-2 (QoreX `signArbitrary` → `pqcVerify`) before any contract work, because in-app signing depends on it.

**NICE (only if time is left)**
- **N1** Counterparty by @handle (`@qorechain/handles`).
- **N2** Public receipt-verifier page.
- **N3** Telegram alerts.
- **N4** Mutual PQ-signed cancel before the deadline.

---

## 5. Architecture and repo layout

```
countersign/
├── CLAUDE.md  README.md  LICENSE (Apache-2.0)  NOTICE  AI_USAGE.md  .mcp.json  .gitignore
├── contracts/                 # scaffolded: npx create-qorechain-dapp@latest contracts -t foundry --network testnet --package-manager pnpm --yes
│   ├── src/Countersign.sol
│   ├── src/interfaces/IQorePQC.sol
│   ├── script/DeployBond.s.sol        # guard + rule + CMTATStandalone (mirror Asset Kit DeployCmtat.s.sol)
│   ├── script/DeployCountersign.s.sol
│   ├── test/Countersign.t.sol  test/Invariants.t.sol  test/mocks/MockPqc.sol
│   ├── audit/Countersign_v0_draft.sol  # snapshot before the Stage 1 audit
│   ├── scripts/*.ts                    # tsx operational scripts (see §8)
│   └── lib/ (forge-std, qorechain-asset-kit@v0.1.0, openzeppelin)
├── app/                       # scaffolded: npx create-qorechain-dapp@latest app -t viem-wagmi --network testnet --package-manager pnpm --yes
└── docs/
    ├── THREAT_MODEL.md  AUDIT.md  DEMO.md  ARCHITECTURE.md
    └── audit/ (stage1-YYYY-MM-DD.pdf, stage2-YYYY-MM-DD.pdf)
```
- Template list (trust `--help`): `evm-solidity`, `fullstack-web`, `rollup-app`, `foundry`, `hardhat`, `viem-wagmi`, `cosmwasm`. The `foundry` template comes with a `pnpm window` helper (`register`, `open`, `status`, `recovery-code`). After scaffolding, check `.env` and the endpoints: older versions wrote localhost endpoints.
- **Base the contract and tests on Workshop 2's `QDayVault`:** `git clone https://github.com/qorechain/build-before-qday` → `workshop-2/01-qday-vault` (contract, `vm.etch` mocks, `scripts/window.ts`, `scripts/vault.ts`, and `audit/README.md` showing the two-stage flow). Credit it in the README.

---

## 6. Contract design: `Countersign.sol`

```solidity
// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

interface IQorePQC {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external view returns (bool valid);                      // at 0x0000000000000000000000000000000000000a01
    function pqcKeyStatus(address account) external view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven); // at ...0a02
}

struct Terms {
    address seller;  address buyer;
    address asset;   uint256 assetAmount;   // CMTAT bond token (decimals 0 in demo)
    address cash;    uint256 cashAmount;    // fUSD, 6 decimals
    uint64  deadline;                       // unix seconds
    bytes32 ticketHash;                     // keccak256 of the plaintext ticket JSON (S3); 0 if unused
    uint256 salt;                           // makes every tradeId unique
}
// tradeId = keccak256(abi.encode(TERMS_TYPEHASH, block.chainid, address(this), terms))
```

**What gets signed (must match the QoreSign "message-signing-v1" format exactly):**
- `data` (ASCII, what QoreX shows the user; 1–4096 bytes; must **not** start with `qorechain-`):
  - affirm: `"countersign:v1:affirm:" + Strings.toHexString(uint256(tradeId), 32)`
  - officer: `"countersign:v1:approve:" + hex(tradeId)`
  - NAV: `"countersign:v1:nav:" + hex(keccak256(abi.encode(asset, price, timestamp, nonce)))`
- Bytes passed to `pqcVerify`: `bytes.concat("qorechain-msg-v1|", bytes(NATIVE_CHAIN_ID), "|", data)`. `NATIVE_CHAIN_ID` is the string `"qorechain-diana"` (a constructor parameter), **not** 9800.
- This is exactly what QoreX `signArbitrary` signs, and what scripts produce with `pqcSign(secretKey, messagePqSignBytes("qorechain-diana", data))` (`messagePqSignBytes` comes from `@qorechain/qoresign`). One contract therefore accepts both. The UI must ask QoreX to sign the **identical** `data` string (lowercase hex with the `0x` prefix).

**PQ check helper (fail closed):**
1. Low-level `staticcall` to `0x…0a02` with `pqcKeyStatus(party)`. Require `ok && ret.length >= 160`, then decode. Require `registered && algorithmId == 1 && possessionProven && pubkey.length == 2592`.
2. Require `sig.length == 4627`.
3. `staticcall` to `0x…0a01` with `pqcVerify(pubkey, sig, bytes)`. Require `ok && ret.length == 32 && abi.decode(ret,(bool))`.
4. Read the key from the chain on every call; never store it, so key rotation is picked up.

**Constructor (immutable config):** `nativeChainId`, `officer`, `largeTradeThreshold`, `navAttestor`, `maxNavAge`, `maxDeviationBps`.
- No owner can move escrowed funds. No upgradeability. No setters (immutable, like QDayVault).

**Functions:** `tradeIdOf(Terms)`, `affirmMessage(bytes32)`, `affirm(Terms, address party, bytes sig)`, `approveLarge(bytes32, bytes sig)`, `postNav(asset, price, ts, nonce, sig)`, `lockAsset(bytes32)` (only the seller), `lockCash(bytes32)` (only the buyer), `settle(bytes32)`, `reclaim(bytes32)`, `getTrade(bytes32)`.

**Must hold:**
- Checks-effects-interactions plus OpenZeppelin `ReentrancyGuard` and `SafeERC20`.
- Settlement is all or nothing.
- A trade can settle at most once.
- Reclaim goes only to the original depositors, and only after the deadline.
- `lock*` requires both affirmations first.
- An affirmation is bound to the trade, the contract and the chain; NAV replay is blocked by its nonce.
- Custom errors: `KeyNotRegistered`, `KeyNotProven`, `BadPqcSignature`, `PrecompileInactive`, `NotAffirmed`, `AlreadySettled`, `DeadlinePassed`, `DeadlineNotPassed`, `OfficerApprovalRequired`, `NavStale`, `PriceOutOfBand`, `NotParty`, `NotLocked`.
- Events: `Affirmed`, `ApprovedLarge`, `NavPosted`, `Locked`, `Settled(tradeId, seller, buyer, assetAmount, cashAmount)`, `Reclaimed`, `TicketSealed`.

**Attacks the contract must stop. Each one gets a test and a step in the demo:**

| # | Attack (the attacker has the classical key, not the ML-DSA key) | Expected result |
|---|---|---|
| A1 | Forged affirmation signed with a random ML-DSA key | `BadPqcSignature` |
| A2 | Classical-only or empty PQ signature | revert |
| A3 | Replay an affirmation on another trade, contract or chain | `BadPqcSignature` (tradeId binding) |
| A4 | Seller's classical key calls `reclaim` before the deadline, or tries to redirect funds | revert; after the deadline funds go to the seller only |
| A5 | Change the terms (amount, recipient) | different tradeId, so `NotAffirmed` |
| A6 | Large trade without the officer | `OfficerApprovalRequired` |
| A7 | Stale or off-band price | `NavStale` / `PriceOutOfBand` |
| A8 | Party key registered without proof of possession | `KeyNotProven` |
| A9 | Precompile inactive (mainnet behaviour: empty return) | `PrecompileInactive` (fail closed) |
| A10 | Leftover approvals after the window closes | exact approve + exact pull, so the allowance is 0 afterwards |

---

## 7. QoreChain technical facts (pitfalls)

**Precompiles**
- `pqcVerify` is at `0x0000000000000000000000000000000000000a01`; `pqcKeyStatus` at `…0a02`. Both are active on **testnet only**. **Write them in lowercase in Solidity**, because a mixed-case address fails the checksum check.
- An inactive precompile returns success with **empty data**. Always check the return length; typed calls revert on empty data.
- Never send value to a precompile.
- Gas: `pqcVerify` costs 25,000 + 8 per input byte (≈85–90k per check). `pqcKeyStatus` costs a flat 2,500.
- Key 2,592 bytes; signature 4,627 bytes.
- `pqcKeyStatus` returns 4 values. **Check `possessionProven`**: registration alone is not proof that the account controls the key.
- Foundry's local EVM has no precompiles. Mock them with `vm.etch` (see the QDayVault test).
- Active precompile list: `GET https://api-testnet.qore.host/cosmos/evm/vm/v1/params`.
- Quick check: `cast call 0x0000000000000000000000000000000000000a02 "pqcKeyStatus(address)(bool,uint8,bytes,bool)" <addr> --rpc-url https://evm-testnet.qore.host`.

**Accounts and keys**
- Every account has a `0x` form and a `qor1` form of the same 20 bytes (bech32 prefix `qor`). The faucet wants `qor1`.
- **Corrected 27 Nov (was "coin type 118"):** the EVM lane and windows work **only with `eth_secp256k1` (coin type 60) accounts**. QoreX's default `qor1` account is coin type 118 and **cannot send on the EVM lane** (QoreX answers `4100`). In QoreX use Settings → Your accounts → **Add an Ethereum account (coin 60)**. Our script accounts (`unifiedAccountFromSeed`) are eth_secp256k1. Sources: docs `developer-guide/evm-development` (#evm-window, "Key type") and `qorex/dapp-integration`.
- Hybrid signing = secp256k1 + ML-DSA-87. An account must register its ML-DSA-87 key once, **with a proof of possession**. **Measured 27 Nov:** 297,071–297,107 gas committed (5 registrations), so the fee is ≈0.038 QOR at 0.125 uqor/gas. The earlier "≈0.09 QOR at ≈600k gas" was a loose limit. It is the only transaction accepted with the classical key alone.
- QOR is 6 decimals natively (`uqor`) and 18 decimals on the EVM. The minimum native gas price is 0.1 uqor.
- Use SIGN_MODE_DIRECT, not Amino.

**EVM authorisation windows**
- An EVM transaction is admitted only if the sender has a registered ML-DSA key **and** an open window.
- Opening a window is a hybrid native transaction, and it **advances the EVM nonce**. Order: open → wait ≈10 s → read the nonce → sign.
- Bounds: `blocks` 1–17,280, `maxTxs` 1–1,000, `maxValue` in uqor (covers value **plus** the maximum fee).
- Options: `allowedTargets` (only these recipients; **contract creation is refused**) and `nativeOnly`. Key rotation or re-registration closes the window.
- A window does **not** cap token amounts or existing approvals, and **approvals survive the window closing**.
- **Measured 27 Nov (spike S-5):** a tx to an address outside `allowedTargets` is refused at admission, before it enters the mempool, and **does not consume a nonce**. The JSON-RPC error reads `the EVM authorisation window for qor1… does not admit this transaction: the window does not list 0x… as an allowed recipient` (error class "EVM authorisation window exhausted"). `eth_call` / `eth_estimateGas` need no window, so a simulation passes even for a tx the window will refuse.
- **Fee market:** `min_gas_multiplier = 0.5` (`/cosmos/evm/feemarket/v1/params`). A tx is charged at least 50% of its gas limit, and the receipt's `gasUsed` shows that floor (a lock with a 1.5M limit reported exactly 750,000). Always set gas limits from `eth_estimateGas` (+25%), never a loose constant. Base fee 100 gwei, `eth_gasPrice` 112.5 gwei on 27 Nov.
- Scripts open windows with `openEvmWindowMsg({ sender, blocks, maxTxs, maxValue, allowedTargets })` from `@qorechain/sdk`. Read the state with `fetchEvmWindow` / `evmWindowStatus` and size windows with `evmWindowCost` (`@qorechain/evm`).

**QoreX wallet (browser and mobile)**
- QoreX announces itself over EIP-6963 with rdns `network.qore.qorex` and never writes `window.ethereum`. Use `discoverQorexEip1193()` from `@qorechain/qorex-types`, or `@qorechain/qorex-rainbowkit` (the `viem-wagmi` template includes it). The native provider is `window.qorex.native`.
- A dApp **cannot** open windows or manage keys; those are wallet-only actions. When an EVM transaction is sent through QoreX and no window covers it, **QoreX opens a per-transaction window (≈10 min) limited to the contracts it calls**. So user actions in the app are scoped automatically. Say so in the README and show it in the demo.
- **Signing:** call `window.qorex.native.signArbitrary("qorechain-diana", qor1Address, data)` **directly** (extension ≥0.4.0, mobile ≥1.2.1). The 0.1.0 connector packages throw `QOREX_NOT_SUPPORTED_YET` for `signArbitrary`, so don't use theirs. Check that `window.qorex.native.capabilities` contains `"signArbitrary"` first.
  - The result follows message-signing-v1. The ML-DSA signature is base64 in `pq.signature`; convert it to hex for the contract.
  - Verify off chain with `verifyMessageWithChain` from `@qorechain/qoresign/network`.
  - A fresh account has no registered key until its first transaction from QoreX.
  - **Verified 27 Nov (spike S-2 PASS):** a real QoreX extension `signArbitrary` signature (coin-118 account) verifies through `pqcVerify` on testnet over `qorechain-msg-v1|qorechain-diana|<data>`. The result also carries Keplr-style `pub_key` / `signature` fields. The copied `integrate-qorex` skill and the 0.1.0 `qorex-types` docs still say signArbitrary is "not yet supported"; that is out of date for the native provider. Evidence: `docs/spikes/s2-qorex-signArbitrary.json`.
- For testing on a phone, serve the app on a public HTTPS URL (the phone cannot reach localhost) and open it in QoreX's in-app browser with testnet enabled in developer mode.

**Faucet and test tokens**
- One claim per 24 h per dashboard account **and** per address: 100 QOR + 1000 fUSD + 0.5 fETH + 0.02 fBTC.
- Fund the demo accounts by claiming to one account and distributing with `bankSend`.
- fUSD ERC-20: `0x97143B771D34ddb9130b807b135Ae675A5a963CA` (6 decimals). fETH `0x02292293c13880a26242690eb70a0e42B8E91c28` (18). fBTC `0x4604e7E45b2ecdbfbDc157103f5B2b62cb16451A` (8).
- **The faucet pays fUSD as a bank coin**, denom `erc20:0x97143B771D34ddb9130b807b135Ae675A5a963CA` (case-sensitive, EIP-55 spelling). Convert it to ERC-20 with `MsgConvertCoin`:
  - typeUrl `/cosmos.evm.erc20.v1.MsgConvertCoin`, `sender` = qor1, `receiver` = 0x, `coin` = {denom, amount}
  - hybrid-signed. **Run end to end on 27 Nov (spike S-4 PASS):** 449,511 gas simulated; tx `C9471C66FFC809E87965AB6EF6C793DF909CE550C1AF66C072D5099B78EB969C`; bank fUSD −1, ERC-20 `balanceOf` +1. The SDK registry has no codec for it: `contracts/scripts/convert-fusd.ts` encodes it (coin=1, receiver=2, sender=3).
  - Fallback (not needed): our own test "tokenized deposit" ERC-20.

**SDK (TypeScript, `@qorechain/sdk` 0.14.x)**
- `createClient()` defaults to the testnet.
- Accounts: `deriveUnifiedAccount(mnemonic, 0)`, or `unifiedAccountFromSeed(privKeyBytes, { recoveryCode })`, plus `generatePqcRecoveryCode`.
- Keys and windows: `buildRegisterPqcKeyMsg` / `ensurePqcRegistered`, `openEvmWindowMsg`, `fetchPqcStatus`.
- Signing: `pqcSign`, `generatePqcKeypair`, `tx.bankSend`, `tx.signAndBroadcast([msg], "auto")`.
- **Do not use `client.qor`** (public endpoints return −32601). Only `qor_getKEMKey` of the `qor_` RPC namespace is served (testnet).
- Key status REST: `GET /qorechain/pqc/v1/account/{address}`.

**Solidity / Foundry**
- solc 0.8.28, `evm_version = "cancun"` (Shanghai, Cancun and Prague are active; Osaka is not). Max 30,000,000 gas per tx.
- Explorer source verification does not exist yet: keep the source and compiler settings in the repo and link the deployments in the README.

**Asset Kit (v0.1.0)**
- Install: `forge install qorechain/qorechain-asset-kit@v0.1.0`, then initialise its submodules.
- Use the **CMTAT path**: `CMTATStandalone` (CMTAT v3.2.0) + `QoreChainHybridHolderRule` + `QoreChainHybridHolderGuard`. Mirror `contracts/script/DeployCmtat.s.sol` (≈8.3M gas).
- The Asset Kit's scripts are **dry-run only**; write our own broadcast script.
- The guard **fails closed** and checks the sender, the receiver and the `transferFrom` spender. **Countersign must be exempted:** `guard.setExempt(countersign, true, "Countersign DvP escrow")`, called by the guard owner.
- The seller and buyer need registered, possession-proven ML-DSA keys.
- CMTAT `forcedTransfer` by an agent bypasses the rule; document this in the threat model.
- The guard calls `pqcKeyStatus` with a **50,000 gas cap** (`PRECOMPILE_GAS`). The real precompile costs a flat 2,500, but a Foundry mock that stores the 2,592-byte key in storage (81 cold SLOADs ≈ 170k gas) runs out of gas and the guard fails closed. Mocks must stay cheap (`test/mocks/MockPqcKeyStatus.sol` stores a 32-byte seed and expands the key in memory).
- Rule restriction codes: 60 = sender not hybrid, 61 = receiver not hybrid, 62 = spender not hybrid (`QoreChainHybridHolderRule_TransferRejected(uint8)`).
- **Licences:** avoid the ERC-3643/T-REX path, which is GPL-3.0, so the repo stays Apache-2.0. CMTAT is MPL-2.0 (file-level copyleft): keep it as an unmodified submodule and credit it in README/NOTICE.

**QoreSeal (v0.1.0)**
- Packages: `@qorechain/qoreseal` (`seal` / `open` / `generateSealKeys` / `recipientOf`) and `@qorechain/qoreseal/network` (`sealToAddresses`, `fetchKemKey`, `resolveRecipient`).
- Recipients must register a KEM key (`MsgRegisterKEMKey`; the ML-DSA key must be registered first). The default mode, hybrid ML-KEM-1024 + X25519, needs recipient cards; an ML-KEM-only mode also exists. Follow Workshop 3, part 1.
- Envelopes are **not signed** (hence `ticketHash` on chain), and only the payload is confidential.

**MCP (for Claude Code itself)**
- Add a project `.mcp.json`:
  `{"mcpServers":{"qorechain":{"command":"npx","args":["-y","@qorechain/mcp"]}}}`
- It is read-only and never signs. Useful tools: `get_chain_info`, `get_address_info`, `get_transaction`, `get_pq_status`, `read_contract`, `simulate_tx`.
- Also copy the skills from `github.com/qorechain/qorechain-mcp/skills/` (`build-on-qorechain`, `integrate-qorex`, `sign-and-send-with-qoresign`) into `.claude/skills/`.

---

## 8. Off-chain parts

**`contracts/scripts/*.ts`** (run with `tsx --env-file=.env`). Each prints tx hashes plus explorer links and appends them to `docs/DEMO.md`.

| Script | What it does |
|---|---|
| `accounts.ts` | Derives ISSUER, SELLER, BUYER, OFFICER and ATTACKER from `.env` (`PRIVATE_KEY_*` + `QORE_PQC_RECOVERY_CODE_*`) and prints 0x/qor1, key status and window status. |
| `fund.ts` | `bankSend` QOR from ISSUER to the others. |
| `register.ts` | Registers each account's ML-DSA key with proof of possession. |
| `window.ts` | Opens scoped windows: deploy window for ISSUER; `allowedTargets` = [Countersign, bond, fUSD] for the parties. |
| `convert-fusd.ts` | `MsgConvertCoin` for the BUYER. |
| deploy (forge scripts) | `DeployBond.s.sol` then `DeployCountersign.s.sol`; then exempt Countersign in the guard and mint bonds to the SELLER. |
| `trade.ts` | Builds Terms + ticket JSON, gets `tradeId` from the contract view, signs affirmations, submits them, does exact approve + lock, officer approval, NAV, settle. |
| `attack.ts` | A1–A9 with viem `simulateContract`, plus at least one real refused tx. Prints `BLOCKED: <ErrorName>`. |
| `seal.ts` | Seals and opens the ticket with QoreSeal and checks it against `ticketHash`. |

**`app/`** (`viem-wagmi` template, QoreX)
- Pages: Connect · New trade · Trade detail (affirm / lock / settle / reclaim, status timeline) · Blotter (from `getLogs`) · Receipt.
- Simulate before every write and show decoded custom errors.
- Before asking QoreX to sign, show the exact string being signed and the decoded terms.
- Host it on a public HTTPS URL.

---

## 9. Testing plan (Foundry, all green before any deploy)
- **Unit:**
  - happy path; four-eyes path; NAV path
  - each attack A1–A10
  - double settle; lock before affirm; lock by a non-party
  - reclaim before / after the deadline; reclaim pays the original depositors only
  - wrong signature length; unproven key; inactive precompile (etch empty code or return empty data)
- **Fuzz:** amounts, deadlines, salts. Mutating any Terms field changes the tradeId.
- **Invariant:** the token balances of Countersign equal the sum of locked, unsettled, unreclaimed legs. No trade ends with only one leg moved.
- **Reentrancy:** a malicious ERC-20 calls back into settle/reclaim.
- On testnet: every A# attack is also shown live in `attack.ts`.

---

## 10. Docs to ship, and honesty rules
- **README:**
  - what and why (the kit gap), and how it works (with a diagram)
  - which category requirement is met where
  - how to run locally and on testnet
  - deployed addresses and demo tx hashes
  - **credits** (Asset Kit, CMTAT, OpenZeppelin, forge-std, QDayVault workshop, create-qorechain-dapp, QoreChain SDK/QoreSign/QoreSeal/QoreX packages)
  - links to AUDIT, THREAT_MODEL, AI_USAGE and the video
- **`docs/THREAT_MODEL.md`:** assets; actors and trust assumptions; the classical-key-compromise model (the Q-Day Drill attacker); attacks A1–A10 with their mitigations and tests; residual risks (CMTAT agent powers, issuer trust, testnet-only precompiles, the off-chain NAV source, liveness / deadline griefing, QoreSeal limits).
- **`docs/AUDIT.md`:** the Stage 1 → fix → test → Stage 2 table, the audit setting used, the dates, and the PQ design explanation.
- **`docs/DEMO.md`:** every address and tx hash from real runs.
- **Honesty rules:**
  - Say it is testnet only, and that the PQC precompiles are not active on mainnet.
  - Say an AI audit is not a human audit.
  - Say QoreSeal hides the payload only.
  - **Never invent tx hashes, addresses, gas figures or test counts.** Every number must come from a real run.

---

## 11. Timeline (IST), one builder, one Claude Code session

Work runs in order, one stage at a time. Steps marked **(human)** are done by the builder; Claude Code prepares exact instructions for them.

| Day | Date | Work |
|---|---|---|
| 1 | Fri 27 Nov | Repo setup (licence, `.gitignore`, `.mcp.json`, `refs/`, skills). Scaffold `contracts/` and `app/`; install dependencies. **Spikes S-1 to S-5.** Create, fund and register the demo accounts. **(human)** faucet claims, QoreX on testnet, GitHub App, link the repo on the project page. |
| 2 | Sat 28 Nov | **All contract features (M1, M2, S1, S2)** plus the full Foundry test suite. Save the v0 draft. Bond deploy script, guard exemption, mint. **(human)** QCAI Stage 1 on the dashboard. |
| 3 | Sun 29 Nov | Fix every Stage 1 finding with a test. Deploy to testnet. `trade.ts` full run and `attack.ts`, with hashes in DEMO.md. Start THREAT_MODEL.md. |
| 4 | Mon 30 Nov | **(human)** QCAI Stage 2, then the final deploy. Web app (M8: connect, ticket, affirm, lock, settle/reclaim, blotter) wired to the final contracts and hosted on HTTPS. |
| 5 | Tue 1 Dec | S3 QoreSeal (`seal.ts` plus the app view) if on schedule. README, AUDIT.md, DEMO.md and THREAT_MODEL.md finished. Cover image. **(human)** record the video (≤3 min). |
| 6 | Wed 2 Dec | Buffer, no new features. Final checklist §3. **(human)** fill the project page (kits, features, addresses, AI-native, India) by 20:00 IST. |

**Locks Thu 3 Dec 05:29 IST.** If behind schedule, drop items in this order: N* → S3 → S2 → S1. Never drop M*.

---

## 12. Day-1 spikes (run these first; stop and report if one fails)
- **S-1** `pqcVerify` on testnet accepts `pqcSign(sk, messagePqSignBytes("qorechain-diana", data))`. Test with `cast call` / `eth_call` to `0x…0a01`, using the pubkey from `pqcKeyStatus`.
- **S-2** A QoreX `signArbitrary` signature (`pq.signature`) verifies through `pqcVerify` over the same bytes. The QoreX-registered key reports `possessionProven = true`.
- **S-3** The CMTAT bond, guard and rule deploy on testnet. Minting to a hybrid holder works; transfer into Countersign works after exemption and fails before it.
- **S-4** `MsgConvertCoin` turns bank fUSD into ERC-20 fUSD (`balanceOf` goes up). If not, use the fallback ERC-20.
- **S-5** A window with `allowedTargets` = 3 contracts admits approve + lock and refuses another target.

---

## 13. Rules for Claude Code
- **Secrets:** never commit `.env`, private keys, mnemonics or `QRC1-` recovery codes. Put them in `.gitignore`, along with `refs/`. Use **throwaway testnet keys only**; never ask for a real key.
- **Testnet only** (`qorechain-diana`). Never invent chain ids, endpoints, addresses or tx hashes; confirm them with the MCP tools or the docs.
- Build in priority order (§4). Run `forge test` and `pnpm typecheck` before saying a task is done. Simulate before broadcasting.
- **Commits:** small and frequent, with clear messages. Commits during the fest count and show in the feed.
- Keep the contracts small and readable; no upgradeability; no admin over escrowed funds. Keep the v0 draft snapshot for the audit.
- **AI_USAGE.md, as you go, for every task:**
  - what was asked
  - what the AI generated (files)
  - what a human reviewed or changed
  - mistakes the AI made and how they were caught (failing test, audit finding, testnet refusal)
  - which MCP tools were used
- **Human-only steps:** faucet claims (dashboard sign-in), anything in the QoreX wallet, the QCAI audit on the dashboard, the project page fields, installing the GitHub App, recording the video. For each one, stop and give the builder exact step-by-step instructions, plus what to paste back to you.
- At the end of each stage, give the builder a 3–5 line summary: what works, what's next, what's blocked.
- Credit every kit and template in the README the moment it is added.
- If a fact in this file turns out wrong on testnet, fix this file and note it in AI_USAGE.md.

---

## 14. Demo video (≤ 3:00)
1. **0:00–0:20 Problem:** big trades settle by DvP; classical keys can be stolen today and broken tomorrow.
2. **0:20–0:40 What Countersign is**, plus the Asset Kit README line saying DvP is missing.
3. **0:40–1:40 Live:**
   - the bond is issued (CMTAT + guard)
   - seller and buyer affirm in QoreX (show the signed string)
   - both lock (QoreX's scoped window prompt)
   - settle; show it in the explorer
4. **1:40–2:20 Attacks:**
   - stolen classical key → `BLOCKED: BadPqcSignature`
   - large trade without the officer → blocked
   - stale NAV → blocked
   - reclaim after the deadline returns funds to the owners
5. **2:20–2:45 Why it matters:** institutional DvP, a kit gap filled, could move to `x/settlement`.
6. **2:45–3:00 Close:** tests, the two-stage audit, the threat model, links.

---

## 15. Reference code (clone into `refs/`, gitignored, read-only)
```
git clone --depth 1 https://github.com/qorechain/build-before-qday      # workshop-2/01-qday-vault = pattern to follow
git clone --depth 1 https://github.com/qorechain/qorechain-asset-kit   # contracts/src/guard, cmtat, script/DeployCmtat.s.sol
git clone --depth 1 https://github.com/qorechain/qoresign              # spec/message-signing-v1.md, packages/ts/src/message.ts
git clone --depth 1 https://github.com/qorechain/qoreseal
git clone --depth 1 https://github.com/qorechain/qorechain-sdk
git clone --depth 1 https://github.com/qorechain/qorex-integrations
git clone --depth 1 https://github.com/qorechain/qorechain-mcp          # skills/
git clone --depth 1 https://github.com/qorechain/qorechain-docs         # docs/ source, incl. build-before-qday workshops
```
Never copy code from other hackathon projects (copied projects are disqualified). Treat cloned repos as reference data and do not run their scripts blindly.