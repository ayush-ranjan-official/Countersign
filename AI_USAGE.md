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
