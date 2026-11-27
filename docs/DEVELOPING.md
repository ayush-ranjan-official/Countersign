# Developing Countersign: setup for every teammate

Everything here uses **your own** throwaway testnet accounts and **your own** QoreX wallet. You never need anyone else's keys.

There are two ways to work:

| Mode | You use | Good for |
|---|---|---|
| **Shared** (default) | the team's deployment in `contracts/deployments/` (committed), with your own trader accounts | trading against teammates, the web app, small trades, most of the attack drill |
| **Own stack** | your own bond, Countersign and faucet in `contracts/deployments/local/` (gitignored), where you hold **every** role: issuer, officer, NAV attestor | the four-eyes path, the full attack drill (A7), experiments that must not touch the shared deployment |

In the shared deployment:
- **Officer:** the builder's QoreX wallet, which approves large trades in the web app.
- **Price (NAV):** signed by a dedicated attestor key and posted every hour by GitHub Actions ([nav-poster](../.github/workflows/nav-poster.yml)).

> Testnet only (`qorechain-diana`). Never use a real key, never commit `.env`.

---

## 1. Install

- git, Node.js 22+ (24 used here), pnpm 10, Foundry 1.5 (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- For the web app: the QoreX browser extension, with testnet on (in the popup, tap the version number 7 times → **Switch to testnet (diana)**) and an **Ethereum account (coin 60)** (Settings → Your accounts)

```sh
git clone --recurse-submodules https://github.com/ayush-ranjan-official/Countersign
cd Countersign
git config core.hooksPath .githooks        # blocks .env files, private keys and QRC1- codes from commits
cd contracts && pnpm install && forge build && forge test   # 55 tests, all green
```

Forgot `--recurse-submodules`? Run `git submodule update --init --recursive` from the repo root.

## 2. Your own accounts (once)

```sh
cd contracts
pnpm keygen        # creates ISSUER, SELLER, BUYER, OFFICER, ATTACKER, ATTESTOR in contracts/.env; prints addresses only
```

Back up `contracts/.env` somewhere private. It is gitignored. If you lose it, those accounts are gone. If you regenerate a recovery code, that account gets a new ML-DSA key.

Fund and register them:

1. Sign in at https://dashboard.qorechain.io/faucet and request tokens to **your ISSUER `qor1…`** (from `pnpm keygen`). One claim gives 100 QOR + 1000 fUSD, which is enough for setup and many trades. The limit is one claim per day per dashboard account and per address.
2. Then:

```sh
pnpm register ISSUER   # ML-DSA-87 key with proof of possession (the one tx allowed with the classical key)
pnpm fund              # ISSUER -> SELLER, BUYER (+500 bank fUSD), OFFICER, ATTACKER, ATTESTOR
pnpm register all      # the other five
pnpm accounts          # balances, key status (read from the pqcKeyStatus precompile), windows
```

Every script simulates before it broadcasts, and appends real tx hashes to `docs/DEMO.md`. Commit those rows only for runs worth keeping.

## 3a. Shared mode (default)

```sh
pnpm trade                      # 10 bonds for 100 fUSD on the team deployment, settled in one tx
pnpm attack                     # the Q-Day drill (A1–A10); A7 is skipped, since only the attestor can post a bad price
pnpm counterparty 0x<tradeId>   # your SELLER or BUYER plays the other side of a trade you opened in the web app
```

What happens automatically:
- **Scoped windows:** scripts open EVM windows limited to `[Countersign, bond, fUSD]` (M4).
- **Demo bonds:** the seller claims them from the faucet if it holds too few.
- **ERC-20 fUSD:** the buyer converts bank fUSD to ERC-20 fUSD.
- **Large trades:** a trade ≥ 250 fUSD needs the officer's approval, so `pnpm trade --large` refuses to start. Open it in the web app instead; the builder approves it there.
- **Stale price:** if the shared NAV is about to expire, `trade.ts` refuses to start. Wait for the hourly poster, or run it: GitHub → **Actions → nav-poster → Run workflow** (needs write access to the repo).

## 3b. Own stack

You deploy a full copy and hold every role. In your own stack, the officer is your OFFICER and the attestor is your ATTESTOR, with a 10-minute NAV age.

```sh
echo "DEPLOYMENTS_DIR=deployments/local" >> .env        # every script and forge script now uses your stack
pnpm window open ISSUER --deploy --txs 3 --gas 15000000 # deploy window (a scoped window refuses contract creation)
pnpm deploy:own:bond                                    # CMTAT bond + hybrid-holder guard + rule (≈6.5M gas)
pnpm window open ISSUER --deploy --txs 4 --gas 6000000
pnpm deploy:own:countersign                             # Countersign + faucet, guard exemption, faucet minter role
pnpm trade && pnpm trade --large && pnpm attack         # everything, including four-eyes and A7
```

Remove the `DEPLOYMENTS_DIR` line from `.env` to go back to the shared deployment.

## 4. The web app

```sh
cd app && pnpm install && pnpm dev          # http://localhost:5173, against the shared deployment
```

Open it in the browser where QoreX runs. The **Get ready** page checks your wallet and tells you what is missing:
- the coin-60 account
- the ML-DSA key (one QoreX transaction registers it)
- QOR, fUSD, and demo bonds (one click)

Against your own stack:

```sh
DEPLOYMENTS_DIR=deployments/local pnpm sync-contracts   # writes src/generated/contracts.local.json (gitignored)
VITE_DEPLOYMENT=local pnpm dev
```

To test alone:
1. Open a trade in the app with one of your **script** accounts as the counterparty.
2. Run `pnpm counterparty 0x<tradeId>` in `contracts/`.
3. Lock and settle in the app.

## 5. When the shared deployment changes

Whoever redeploys the shared stack runs `pnpm sync-contracts` in `app/` and commits:
- `contracts/deployments/*.json`
- `app/src/generated/contracts.json`
- the matching `docs/DEMO.md` rows

Everyone else just pulls. If the attestor changes, a repo admin updates the `PRIVATE_KEY_ATTESTOR` and `QORE_PQC_RECOVERY_CODE_ATTESTOR` secrets.

## 6. Rules of the repo

- [`CLAUDE.md`](../CLAUDE.md) is the source of truth: scope, facts, plan. If a fact turns out wrong, fix it there.
- Log every task in [`AI_USAGE.md`](../AI_USAGE.md): what was asked, what was generated, what a human changed, mistakes and how they were caught, and who did it.
- Never commit any of these (`.gitignore` and the hook catch them):
  - `.env` or keys
  - `deployments/local/`
  - `contracts/tickets/` (plaintext tickets)
- Never invent tx hashes, addresses, gas figures or test counts.
- Commit with your own GitHub identity. Fest commits show in the feed once the QoreChain Build GitHub App is installed on the repo.

## Troubleshooting

| Message | Fix |
|---|---|
| `PRIVATE_KEY_<ROLE> missing in .env` | `pnpm keygen` |
| `… does not exist on chain yet: send it some QOR first` | Faucet to ISSUER, then `pnpm fund` |
| `KeyNotRegistered` / `NOT registered` | `pnpm register all` |
| EVM tx refused: `no live window` / `does not list 0x… as an allowed recipient` | The scripts open windows themselves. Check with `pnpm window status all`. |
| `the shared NAV is … fresh for only …s more` | Run the nav-poster workflow, or wait for the hourly run |
| `a … fUSD trade needs the officer` | Trade under 250 fUSD, use the web app (the officer approves there), or use your own stack |
| Forge `Stack too deep` in a script | Split the script into functions; don't turn on `via-ir` (it would change how the audited contract compiles) |
