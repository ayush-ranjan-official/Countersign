# AI usage log

Countersign is built **AI-native**. One human builder (the repo owner) works with **Claude Code (Claude Opus 5.5)** in a single session. The AI writes the contracts, tests, scripts, web app and docs. The human sets the scope (`CLAUDE.md`), reviews, and does every step only a human can do: faucet claims, QoreX wallet actions, the QCAI audit on the dashboard, the project page, the GitHub App, the video.

Every task gets an entry, in order, in this format:

- **Asked:** what the human asked for
- **AI generated:** files and commands
- **Human reviewed / changed:** what the builder checked or edited
- **AI mistakes and how they were caught:** failing test, audit finding, testnet refusal, review
- **MCP / tools used:** QoreChain MCP tools, docs, read-only chain calls

Commits written with the AI carry a `Co-Authored-By: Claude` trailer.

---

## Log

### T0: Repo setup and local git identity (27 Nov 2026)
- **Asked:** set up the repo from `CLAUDE.md` §5: licence, `.gitignore`, README stub, `AI_USAGE.md`, `NOTICE`, `.mcp.json`. Make the `ayush-ranjan-official` GitHub account this repo's commit and push identity, **local only** (not global).
- **AI generated:** `LICENSE` (the canonical Apache-2.0 text from apache.org, sha256 `cfc7749b…3d30`), `NOTICE`, `README.md`, `AI_USAGE.md`, `.gitignore`, `.mcp.json`, `docs/DEMO.md`. Local `git config` (`user.name`, `user.email` = the account's GitHub noreply address, and a repo-local credential helper that reads the `ayush-ranjan-official` token from `gh`). A local, uncommitted `.git/hooks/pre-commit` that blocks `.env` files, `refs/`, private keys, mnemonics and `QRC1-` recovery codes.
- **Human reviewed / changed:** approved the plan. Chose to keep their existing QoreChain wallet as the funding source and QoreX party, with no key ever exported (scripts use generated throwaway keys only).
- **AI mistakes and how they were caught:** none yet.
- **MCP / tools used:** read-only checks before planning: `eth_chainId` on `evm-testnet.qore.host` (= `0x2648`, 9800), `GET /cosmos/evm/vm/v1/params` (precompiles `0x…0a01` and `0x…0a02` active), `npm view` for package versions, `git ls-remote` for the reference repos and the Asset Kit `v0.1.0` tag.

### T1: Reference repos, skills, scaffolding, dependencies (27 Nov 2026)
- **Asked:** clone the §15 reference repos into `refs/` (gitignored), copy the QoreChain MCP skills into `.claude/skills/`, scaffold `contracts/` and `app/` with `create-qorechain-dapp` exactly as §5 says, check `.env` and the endpoints, install the Asset Kit v0.1.0, OpenZeppelin and forge-std.
- **AI generated:**
  - Ran `npx create-qorechain-dapp@latest contracts -t foundry …` and `… app -t viem-wagmi …` (CLI 0.14.0). Checked both: no nested `.git`, public testnet endpoints only, `.env` ignored.
  - `forge install qorechain/qorechain-asset-kit@v0.1.0`, plus OpenZeppelin `v5.5.0` (the same commit `fcbae53` the kit pins) and forge-std `v1.17.0` (also the kit's pin). Recorded in `contracts/foundry.lock`.
  - `foundry.toml`: solc 0.8.28, `evm_version = "cancun"`, remappings for the CMTAT path only.
  - `test/compile/AssetKitImports.t.sol`: a compile smoke test.
- **Human reviewed / changed:** none yet.
- **AI mistakes and how they were caught:**
  - My own local pre-commit hook blocked the scaffold commit, because the template's `.env.example` has an all-zeros `PRIVATE_KEY` placeholder. I narrowed the hook to allow an all-zero placeholder, then checked that it still blocks a random 32-byte key.
- **MCP / tools used:** `git ls-remote` / `git ls-tree` to map the kit's submodule commits to release tags. The QoreChain MCP server is configured in `.mcp.json` but needs a session restart to load, so the chain reads so far used REST and JSON-RPC directly.

### T2: Day-1 spike scripts S-1 to S-5 (27 Nov 2026)
- **Asked:** write the spike scripts (§12), run what can run, report pass / fail / blocked.
- **AI generated:**
  - `contracts/scripts/`: `lib/{chain,accounts,native,evm,tokens,demo-log}.ts`, `keygen.ts`, `accounts.ts`, `register.ts`, `fund.ts`, `window.ts` (rewritten from the template helper to be role-aware, with `--deploy` and `--targets`), `convert-fusd.ts` (hand-written protobuf codec for `MsgConvertCoin`, which the SDK registry lacks), `spike-s1.ts`, `spike-s2.ts`, `spike-s3.ts`, `spike-s5.ts`.
  - `app/public/spike-s2.html` (QoreX `signArbitrary` page).
  - `script/DeployBond.s.sol`: the real M3 bond deploy, mirroring the kit's dry-run-only `DeployCmtat.s.sol`.
  - Spike-only `src/spike/SpikeEscrow.sol` and `script/DeploySpikeEscrow.s.sol`.
  - Tests: `test/mocks/MockPqcKeyStatus.sol` and `test/spike/SpikeBond.t.sol`.
- **Results so far (real runs):**
  - **S-1a PASS** on the live testnet precompile `0x…0a01`. A fresh ML-DSA-87 signature over `messagePqSignBytes("qorechain-diana", "countersign:v1:affirm:0x…")` verifies `true`.
  - In the same run, a flipped bit, another tradeId, another chain id, a missing domain prefix and another key all return `false`.
  - Bond deploy dry run: 8,479,707 gas estimated for guard + rule + CMTAT (forge estimate, not yet broadcast).
- **Human reviewed / changed:** chose to keep their own QoreChain wallet as the funding source and QoreX party. No wallet key is ever exported.
- **AI mistakes and how they were caught:**
  1. **Mock gas:** my first `MockPqcKeyStatus` stored the 2,592-byte key in storage. The local S-3 rehearsal test failed with `TransferRejected(60)`: 81 cold SLOADs exceed the guard's 50,000-gas cap on the precompile call, so the guard failed closed. I fixed the mock (32-byte seed, key expanded in memory) and noted the cap in CLAUDE.md §7.
  2. **Dry-run artefact:** the first `DeployBond.s.sol` wrote `deployments/bond-9800.json` during a dry run, recording predicted addresses that were never deployed. I caught it by listing `deployments/` after the dry run, deleted the file, and gated the write on `vm.isContext(ScriptBroadcast)`.
  3. **Fact fix in CLAUDE.md:** §7 said accounts use coin type 118. The docs say the EVM lane and windows work only with eth_secp256k1 (coin type 60) accounts; QoreX's default `qor1` account cannot send on the EVM lane. CLAUDE.md is corrected.
- **MCP / tools used:** JSON-RPC `eth_call` to `0x…0a01` / `0x…0a02`, `eth_gasPrice`, `eth_getBlockByNumber` (base fee 100 gwei). REST `token_pairs` (fUSD pair enabled, `OWNER_EXTERNAL`) and `denoms_metadata`. The docs in `refs/qorechain-docs`.

### T3: Day-1 spikes run on testnet (27 Nov 2026)
- **Asked:** run the spikes once ISSUER was funded. The human claimed the faucet to ISSUER (tx `1B6E8FA4…694B`).
- **AI ran:** in order, register ISSUER → S-1 with the registered key → fund → register the other 4 → ISSUER deploy window → `DeployBond.s.sol` + `DeploySpikeEscrow.s.sol` → SELLER scoped window → S-3 → S-4 → BUYER scoped window → S-5. Every native tx was simulated through REST `/cosmos/tx/v1beta1/simulate`, every EVM write through `eth_call` / `eth_estimateGas`, and every forge deploy as a dry run first. All hashes are in `docs/DEMO.md`.
- **Results:**
  - **S-1 PASS:** the registered key from `pqcKeyStatus` (alg 1, proven, 2,592 B) verifies through `pqcVerify`; 5 negative cases return `false`.
  - **S-3 PASS:** mint to a hybrid holder works and mint to a keyless address is refused (`TransferRejected(61)`). The pull into the escrow is refused before exemption (`TransferRejected(62)`) and works after `setExempt`, with the allowance back to 0.
  - **S-4 PASS:** `MsgConvertCoin` 1 fUSD, ERC-20 `balanceOf` +1.
  - **S-5 PASS:** a scoped window admits approve, lock and unlock. A tx to a 4th address is refused at admission ("does not list … as an allowed recipient") and does not consume a nonce.
  - **S-2:** blocked on the human (QoreX).
- **Human reviewed / changed:** did the faucet claim.
- **AI mistakes and how they were caught:**
  1. **Unsorted coins:** `fund.ts` built the BUYER coins as `[uqor, erc20:…]`. The chain's **simulation** refused it with `invalid coins`, because `sdk.Coins` must be sorted by denom. Nothing was broadcast. Fixed by sorting.
  2. **Loose gas limit:** a fixed 1.5M gas limit made the S-3 lock receipt show exactly 750,000 gas. The fee market's `min_gas_multiplier = 0.5` charges at least half the limit, so we overpaid and the receipt didn't show the real cost. Writes now use `eth_estimateGas` + 25%. Recorded in CLAUDE.md §7.
  3. **Wrong gas figures in CLAUDE.md:** §7 said registration is ≈600k gas / ≈0.09 QOR; it measured ≈297k gas / ≈0.038 QOR. `MsgConvertCoin` measured 449.5k gas against ≈432k. Both corrected from the real runs.
- **MCP / tools used:** REST (`txs`, `bank/balances`, `evm_window`, `feemarket/params`, `simulate`), JSON-RPC (`eth_call` to the precompiles, `eth_estimateGas`, receipts), `cast codesize` / `cast call` to check the deployed code and owners. The QoreChain MCP server is not loaded in this session yet.

### T4: Builder's address checked; self-serve decision (27 Nov 2026)
- **Asked:**
  - Check the builder's own testnet address for S-2.
  - Then a product question: "from the user perspective, collecting all the addresses is not user-friendly; can anyone with their wallet just use the deployed app?"
- **AI generated:**
  - A read-only check of `qor1jk6gk3lxdv45s66hmyszl55yuavmfqpq692s4n` with the QoreChain MCP (`get_address_info`, `get_pq_status`, and `read_contract` on the `0x…0a02` precompile). Result: ML-DSA-87 registered, possession proven, 2,592-byte key, 99.85 QOR. It is a `secp256k1` (coin-118) account: fine for S-2, but it can't send EVM txs.
  - A CORS check: the EVM RPC allows `*`, the REST API sends no CORS headers.
  - A self-serve design: in-app readiness check, trades by link plus a `TradeOpened` event, a demo bond faucet, in-app officer and attestor signing.
  - Added that design to CLAUDE.md §4 (SELF-SERVE).
- **Human reviewed / changed:**
  - The builder made the call: build the fully self-serve version ("anyone can use this app, without me needing to share any keys"). This changes M1 and M8.
  - The builder chose to wait for S-2 before any contract work.
- **AI mistakes and how they were caught:** none in this step.
- **MCP / tools used:** QoreChain MCP `get_address_info`, `get_pq_status`, `read_contract` (first use after the session restart loaded `.mcp.json`).

### T5: Spike S-2 with the builder's QoreX wallet (27 Nov 2026)
- **Asked:** verify the QoreX `signArbitrary` result the builder produced with `app/public/spike-s2.html` (the AI started the dev server; the human did the signing in QoreX).
- **AI generated:** saved the result as `docs/spikes/s2-qorex-signArbitrary.json` (public data only) and ran `pnpm spike:s2`. Also ran two negative checks: the same signature over another tradeId or another chain id.
- **Results:** **S-2 PASS.**
  - `pqcVerify` on chain returns `true` against the key read from `pqcKeyStatus` (registered, alg 1, possession proven, 2,592 B).
  - `verifyMessageWithChain` (classical ADR-36 + ML-DSA) passes.
  - Both negative checks return `false`.
  - All five Day-1 spikes now pass.
- **Human reviewed / changed:** did the QoreX signing (wallet-only step).
- **AI mistakes and how they were caught:** none.
- **MCP / tools used:** JSON-RPC `eth_call` to `0x…0a01` / `0x…0a02`, `@qorechain/qoresign/network` `verifyMessageWithChain`.

### T6: M1 + M2 + S1 + S2 contract, self-serve parts, M5 tests, v0 draft (27 Nov 2026)
- **Asked:** after all spikes passed, build `Countersign.sol` in priority order and base it on the QDayVault pattern. The builder had asked for the self-serve parts: the `TradeOpened` event and a demo bond faucet.
- **AI generated:**
  - `src/Countersign.sol`: affirm, lock, settle, reclaim; fail-closed `pqcKeyStatus` + `pqcVerify`; four-eyes; NAV band; per-leg reclaim; `TradeOpened`; `sealTicket`.
  - `src/interfaces/IQorePQC.sol`, `src/DemoBondFaucet.sol`.
  - Tests: `test/Countersign.t.sol` (42 tests: A1–A10, state machine, NAV, four-eyes, reentrancy, fee-on-transfer, paused-bond reclaim, 2 fuzz), `test/Invariants.t.sol` (3 invariants + 1 handler-reachability test), `test/DemoBondFaucet.t.sol` (6 tests).
  - Mocks: `test/mocks/MockPqcVerify.sol`, `test/mocks/MockTokens.sol`, `test/utils/CountersignFixture.sol`. The fixture uses the real Asset Kit CMTAT bond + guard + rule with mocked precompiles.
  - Snapshot: `contracts/audit/Countersign_v0_draft.sol` and `DemoBondFaucet_v0_draft.sol`. Byte-identical to `src` at this commit: sha256 `6887fcd3…2c66` and `27c5187f…ef8f`.
  - Design differences from the spec are recorded in CLAUDE.md §6 "As implemented".
- **Test results (real runs):**
  - `forge test`: **55 passed, 0 failed** (5 suites).
  - Invariants: 128 runs × 64 depth = 8,192 calls each, **0 reverts** with `FOUNDRY_INVARIANT_FAIL_ON_REVERT=true`.
  - **Mutation check:** 6 hand-made mutants of security lines (drop the possession check, drop the empty-return check, drop the officer check, drop the NAV check, tradeId without `address(this)`, reclaim before the deadline). **All 6 were killed** by the expected tests, so the tests check the security rules, not just the happy path.
- **Human reviewed / changed:** asked for the self-serve design and for M1 to wait until S-2 passed. The code is not yet reviewed by the human.
- **AI mistakes and how they were caught:**
  1. **Test-ordering bugs:** in 2 tests `vm.expectRevert` came before a helper that makes its own external calls, and in 1 test `vm.prank` would have applied to the wrong call. Caught by my own review before the first run.
  2. **Memory aliasing:** in the invalid-terms test, memory struct assignment aliased all 8 "bad terms" to one struct. Caught in the same review. Fixed with fresh copies.
  3. **Invariant harness:** the first invariant run showed handler-level reverts. A fail-on-revert run traced them to the fuzzer calling the setup-only `addTrade` with `assetAmount = 0` (division by zero in the handler). Fixed with `targetSelector`.
  4. **Lint leftover:** an earlier BSD `sed` with `\|` had silently not removed two imports from the smoke test. Caught by a forge lint note.
- **MCP / tools used:** none new (local Foundry work).

### T7: Preview deploy, full trades and the attack drill on testnet, M7 (27 Nov 2026)
- **Asked:** keep building while the Stage 1 audit waits for the free daily audit (the builder had 100 test QOR; an extra audit costs 150). The builder also asked whether the audit is required: the official Prizes page lists "two-stage QCAI audit" as a category main requirement; it is not one of the hard exclusion checks, and its score is not fed into judging (FAQ). Recorded in CLAUDE.md §3c, along with the official rubric weights CLAUDE.md had called "not published".
- **AI generated:**
  - `script/DeployCountersign.s.sol` and the preview-v0 deploy: Countersign `0x5dE4…7c47`, faucet `0x5738…164F`, plus the guard exemption and faucet MINTER_ROLE, all verified on chain.
  - `scripts/trade.ts`: two trades settled on testnet: 10 bonds/100 fUSD, and 30 bonds/300 fUSD with the officer's ML-DSA approval.
  - `scripts/attack.ts`: **21 checks, 0 failed** against the real precompiles. This includes the real A1 tx `0x9c13e13d…` (mined, reverted `BadPqcSignature`) and attacker-triggered reclaims that paid only the owners.
  - Shared libs: `scripts/lib/{windows,convert,countersign}.ts`.
  - Docs: `docs/THREAT_MODEL.md`, `docs/AUDIT.md` (PQ design; Stage 1 table pending), `docs/ARCHITECTURE.md`.
  - Run log: `docs/runs/attack-2026-11-27.log`.
- **Human reviewed / changed:** decided on the audit timing.
- **AI mistakes and how they were caught:**
  1. **Stack too deep:** `DeployCountersign.s.sol` failed to compile. Fixed by refactoring the script into a config struct, not by switching the compiler to `via-ir` (which would change how the audited contract compiles).
  2. **Missing npm script:** I ran `pnpm deploy:countersign` before adding it to package.json. My own grep filter hid the pnpm error, so the first "deploy" did nothing. I noticed it because `deployments/countersign-9800.json` was missing. A deploy window had already been opened (tx `EE139C4E…`); it was reused for the real deploy.
- **MCP / tools used:** JSON-RPC `eth_call` (simulations run the real precompiles), receipts, `cast codesize` / `cast call` checks, REST bank and window reads. The official rules, prizes and FAQ pages were read through a web-fetch agent.

### T8: M8 self-serve web app (27 Nov 2026)
- **Asked:**
  - Build the app so anyone with QoreX can use it, with no keys shared and no address collection.
  - Builder's decisions: hosting later; officer = the builder's QoreX wallet; NAV via a free GitHub Actions cron with a dedicated attestor key.
- **AI generated:** `app/` on the `viem-wagmi` template:
  - `scripts/sync-contracts.mjs` copies addresses, the deploy block and ABIs from `contracts/`.
  - `src/lib/qorex.ts`: direct `signArbitrary`, a coin-60 check via `RIPEMD160(SHA256(pubKey))`, and `MsgConvertCoin` through QoreX `signAndBroadcast`.
  - `src/lib/terms.ts`: tradeId, share links, tickets, relay links.
  - `src/lib/tx.ts`: simulate on the node before every write, decoded custom errors, QoreX and window refusals.
  - `src/lib/reads.ts`:
    - key status from the `0x…0a02` precompile
    - trades, NAV and balances
    - bank fUSD over the REST proxy, null when there is none
    - blotter: chunked `TradeOpened` scan (the RPC allows at most 10,000 blocks per `eth_getLogs`), cached per browser
    - settlement receipt lookup
  - Pages:
    - Get ready: checks with fixes, fUSD convert, demo-bond faucet claim
    - New trade: decoded terms, the exact string to sign, the tradeId cross-checked against the contract, NAV band warning
    - Trade: checklist, live "why it can't settle yet" preflight, affirm / exact approve + lock / officer approval / settle / reclaim, relay links for coin-118 signers, receipt
    - Blotter
  - `styles.css`: light and dark, readable at phone width.
- **Verified:**
  - `pnpm typecheck` clean, `vite build` ok.
  - In a real browser (Playwright, no wallet), the blotter loads the 4 real trades from chain with the correct statuses (2 Settled, 2 Reclaimed).
  - The trade page shows the real settlement receipt `0xf8bbb176…`. The readiness page renders guidance without a wallet.
  - Not yet verified: the QoreX-driven flows (signing, EVM sends) need the human's wallet.
- **Facts found and recorded in CLAUDE.md:**
  - Block time ≈1.42 s (≈60,700 blocks/day).
  - `eth_getLogs` is capped at 10,000 blocks per query.
  - QoreX `getKey().algo` is always `"secp256k1"`.
- **AI mistakes and how they were caught:**
  1. **Relay party:** a relayed affirmation first guessed the signer as "whoever has not affirmed yet". That would have sent a buyer's signature as the seller's (`BadPqcSignature`). Caught on review; the party is now encoded in the link.
  2. **NAV check on closed trades:** the trade page showed a red check for a settled trade (today's price is irrelevant after settlement) and said "no NAV" while still loading. Caught in the browser screenshot; fixed.
- **MCP / tools used:** Playwright (browser screenshots and evaluate), JSON-RPC checks of the `eth_getLogs` limit and block time.
