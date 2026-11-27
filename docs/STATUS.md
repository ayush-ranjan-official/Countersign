# Countersign: team status (27 Nov 2026)

Hi team 👋 Here's where Countersign stands, what's left (including UI updates), how to start working with **your own** keys and wallet, and the current user flow. **Please test it and tell me about any error you hit** (how to report is at the end).

- **Repo:** https://github.com/ayush-ranjan-official/Countersign
- **Deadline:** the project locks **2 Dec 23:59 UTC (Thu 3 Dec, 05:29 IST)**. Let's be done on the evening of 2 Dec IST.

## What Countersign is

Post-quantum **delivery-versus-payment** on the QoreChain testnet. A tokenized bond (the QoreChain Asset Kit's CMTAT token with the hybrid-holder guard) and test dollars (fUSD) swap **in one transaction, or not at all**.

Every approval is an **ML-DSA-87 signature that the contract verifies on chain** with the `pqcVerify` precompile: the seller's, the buyer's, the compliance officer's (large trades) and the price attestor's. Someone who steals a classical (secp256k1) key still cannot forge a trade.

Category: **Post-Quantum dApp**. The Asset Kit's own README lists DvP as missing on EVM; Countersign fills that gap.

## ✅ Done (everything verified on testnet; hashes in `docs/DEMO.md`)

- **Contract** `contracts/src/Countersign.sol`:
  - affirm, lock, settle, reclaim
  - fail-closed `pqcKeyStatus` + `pqcVerify` checks
  - four-eyes approval for large trades
  - signed NAV price band
  - per-leg reclaim
  - a `TradeOpened` event for discovery
- **`DemoBondFaucet.sol`:** anyone with a PQ key can claim demo bonds and act as a seller.
- **Tests:** **55 Foundry tests** (unit, fuzz, invariant), all green.
  - Every attack A1–A10 has its own test.
  - I deliberately broke 6 security lines one at a time, and the tests caught all 6.
- **Day-1 spikes S-1 to S-5 passed**, including a real QoreX `signArbitrary` signature verified on chain.
- **Testnet runs:**
  - trades settled, including a large one with the officer's approval
  - the attack drill passed **21/21 checks** against the real precompiles, including a real refused transaction
- **Shared team deployment (preview-v1), live:**

| | Address |
|---|---|
| Countersign | `0x364b8AEb5a865Def57D94742506B3645954A07B5` |
| Demo bond faucet | `0xFBe8fd0f93ba70F57E39A3Db0e8D4bc38e720159` |
| Demo bond CSB31 (CMTAT) | `0xE125101F98f2E689d7562245e9633BD74B60f213` |
| Hybrid-holder guard | `0x54A2d3d4B60eD430BF32765Cf2F5243cd69Fc43a` |
| fUSD (ERC-20, 6 decimals) | `0x97143B771D34ddb9130b807b135Ae675A5a963CA` |
| Compliance officer (my QoreX wallet) | `0x95B48b47e66b2B486b57D9202fd284E759b48020` |
| NAV attestor (GitHub Actions) | `0x0B6Ef4262777F2d3b45a98b5d02A11Eb76E1738d` |

- **Hourly price (NAV) poster** on GitHub Actions (`nav-poster` workflow), using a dedicated attestor key. Trades settle without anyone's laptop being online.
- **Self-serve web app** (`app/`): Get ready, New trade, Trade page and Blotter. **It runs locally and is not hosted yet**, and it has **not yet been tested with a real QoreX wallet**. That's where your help matters most.
- **Docs:** threat model, audit write-up, architecture, developer guide, demo record, AI-usage log.
- **Teammate setup tested:** a fresh clone with brand-new keys ran the whole flow and settled a trade.

## ⏳ What's left

| Item | Owner | When |
|---|---|---|
| **Live QoreX test of the app** (see the checklist below) | everyone | now |
| QCAI **Stage 1** audit (dashboard, free once per day) | me | Sat 28 Nov, after 05:30 IST |
| Fix every Stage 1 finding **with a regression test** → **Stage 2** audit → **final deploy** | team | 28–30 Nov |
| **UI updates** (list below) | open: reply if you take one | 29 Nov–1 Dec |
| Host the app on a public HTTPS URL (Vercel or GitHub Pages; not decided) | open | ~30 Nov |
| Final README (diagram, category checklist, addresses, credits), cover image | open | 1 Dec |
| **Demo video ≤ 3 min** | team | 1 Dec |
| Optional: S3 sealed trade ticket (QoreSeal) | open | only if on schedule |
| Project page fields, QoreChain Build GitHub App, every member fully registered | me + **everyone** | by 2 Dec, 20:00 IST |

**UI updates wanted** (no contract changes needed; start with any of these):
- A landing / "how it works" section for jurors and new users: the post-quantum story in 3 steps, plus a short "why DvP" panel.
- Visual polish: typography, spacing, colour and dark mode, a consistent card and button system, a logo that matches the cover image.
- A **trade stepper/timeline** (affirm → lock → approve → price → settle) instead of the plain checklist, with a deadline countdown.
- Clearer loading, empty and error states, with friendlier copy for each contract error (`NavStale`, `PriceOutOfBand`, `OfficerApprovalRequired`, `NotParty` …) and for QoreX refusals.
- A shareable **receipt view** for settled trades (both legs, tx link, the signed strings).
- Better relay-link UX: copy buttons and a QR code.
- Mobile layout check; accessibility (labels, contrast, keyboard).
- Banners for "QoreX not installed", "wrong network", "coin-118 account".
- Bundle size: the main chunk is 888 kB, so code-split the wallet libraries.

## ⚠️ Rules (please read)

- **Don't edit `contracts/src/Countersign.sol` or `DemoBondFaucet.sol` until the Stage 1 audit has run.** The audited draft must be identical to `src/`. After the audit, every fix comes with a regression test.
- **Testnet only.** Never commit `.env`, keys or `QRC1-` recovery codes. Run `git config core.hooksPath .githooks` once; the hook blocks them.
- **Never invent** tx hashes, addresses, gas figures or test counts. Every number must come from a real run.
- **Log every task in `AI_USAGE.md`:** what was asked, what the AI generated, what you changed, mistakes and how they were caught, tools used, your name. This counts for the AI-native prize.
- Make small commits with clear messages. I'll add you as collaborators so you can push.
- **Everyone must be fully registered** on build.qorechain.io (18+, GitHub, X, and a QoreX testnet address connected), or the whole project is excluded.

## 📚 Which `.md` file to use for what

| File | Use it for |
|---|---|
| `CLAUDE.md` | **Source of truth:** scope, decisions, chain facts and pitfalls, plan, rules. Read it first. If you use Claude Code, it loads automatically, along with the QoreChain skills in `.claude/skills/` and the MCP server in `.mcp.json` (approve it on first start). |
| `docs/DEVELOPING.md` | **Start here to work:** setup, your own accounts, shared mode vs your own stack, every script, the app, troubleshooting |
| `docs/ARCHITECTURE.md` | Flow diagram, components, the exact signed-message formats |
| `docs/THREAT_MODEL.md` | Attacks A1–A10, which test and which on-chain run proves each, residual risks |
| `docs/AUDIT.md` | The two-stage QCAI audit, and the post-quantum design (where `pqcVerify` / `pqcKeyStatus` are called) |
| `docs/DEMO.md` | Every real address and tx hash (scripts append to it) |
| `AI_USAGE.md` | The task log: add your entries |
| `contracts/README.md` | What's in `contracts/` and the script commands |
| `docs/STATUS.md` | This message |

## 🚀 Get started (about 20 minutes)

```sh
git clone --recurse-submodules https://github.com/ayush-ranjan-official/Countersign
cd Countersign && git config core.hooksPath .githooks
cd contracts && pnpm install && forge build && forge test        # 55 passing
pnpm keygen          # YOUR 6 throwaway testnet accounts -> contracts/.env (back it up, never commit)
```

1. Sign in at https://dashboard.qorechain.io/faucet and request tokens to **your ISSUER `qor1…`** (printed by `keygen`). You get 100 QOR + 1000 fUSD, once per day.
2. Then:

```sh
pnpm register ISSUER && pnpm fund && pnpm register all && pnpm accounts
pnpm trade           # a full trade on the shared deployment, settled in one tx
pnpm attack          # the Q-Day attack drill (A7 is skipped in shared mode)
```

Web app: `cd app && pnpm install && pnpm dev`, then open http://localhost:5173 in the browser where QoreX is installed.

Need the officer or attestor role yourself (four-eyes path, the full attack drill)? Deploy **your own stack**: see `docs/DEVELOPING.md` §3b.

## 🧭 Current user flow (web app)

1. **Install QoreX** (Chrome Web Store: "QoreX"). Turn on testnet: in the popup, tap the version number 7 times → **Switch to testnet (diana)**. Add an **Ethereum account (coin 60)** under Settings → Your accounts. Only coin-60 accounts can send EVM transactions; coin-118 accounts can sign but not send.
2. **Get QOR:** claim the faucet to your `qor1` address, then make **one small transaction** from QoreX. That registers your ML-DSA-87 key.
3. **Get ready page:** everything should turn green. Then:
   - **Seller:** click **Claim demo bonds** (100 per day).
   - **Buyer:** **Convert** your faucet fUSD to ERC-20.
4. **New trade:**
   - Pick seller or buyer, paste the counterparty's `qor1…` or `0x…`, and enter quantity, price per bond and a deadline in hours.
   - Keep the price within **±2 % of the NAV** (10 fUSD/bond today, so **9.80–10.20**). Otherwise settle refuses with `PriceOutOfBand`.
   - The page shows the decoded terms, the trade id (checked against the contract), and **the exact string QoreX will sign**. Compare it with the QoreX prompt, then sign. The first signature opens the trade on chain.
5. **Share the link** (Copy link) with your counterparty. The trade also appears under **Blotter** for both of you.
6. **The counterparty** opens the link and clicks **Affirm** (signs in QoreX).
7. **Both lock:**
   - The seller clicks **Approve exactly N bonds and lock**; the buyer does the same for fUSD.
   - Each is an exact approval followed by an exact pull, so no allowance is left over.
   - QoreX opens a one-off EVM window limited to the contracts it calls.
8. **Large trades (≥ 250 fUSD)** need the compliance officer: that's me. I approve on the trade page with QoreX, and anyone can submit it.
9. The **price must be fresh**. The hourly poster keeps it valid for 2 hours. If it's stale, the checklist tells you; a collaborator can run **Actions → nav-poster → Run workflow**.
10. **Settle:** anyone clicks Settle once the checklist is green. Bonds go to the buyer and fUSD to the seller **in one transaction**, and a receipt link appears.
11. **Missed the deadline?** **Reclaim** returns each locked leg to whoever locked it. Anyone can trigger it.
12. **Coin-118 accounts** can still sign; the app then gives a **relay link** that anyone with a coin-60 account can submit.

**Test alone:**
1. Open a trade in the app with one of your **script** accounts (from `pnpm accounts`) as the counterparty.
2. Run `pnpm counterparty 0x<tradeId>` in `contracts/`. The script affirms and locks the other side.
3. Lock and settle in the app.

## 🧪 Please test, then tell me what breaks

- [ ] A fresh clone builds and the tests pass (`docs/DEVELOPING.md` §1–2)
- [ ] `pnpm trade` settles on the shared deployment
- [ ] `pnpm attack` shows **BLOCKED** for every check
- [ ] App, **Get ready:** all green with your QoreX coin-60 account
- [ ] App: claim demo bonds; convert fUSD
- [ ] App: one teammate sells and one buys; both affirm in QoreX, both lock, then settle; the receipt shows
- [ ] App: try mistakes (price off the band, the wrong account, after the deadline, QoreX locked or rejected). Is each error clear?
- [ ] App on your phone (QoreX in-app browser), once we host it

**How to report:** open a GitHub issue (template "Bug report") or message me with:
- what you did (page or command)
- the **exact error text**
- a screenshot
- your `0x` address
- the tx hash, if any
- your browser and QoreX version

Thank you! 🙏
