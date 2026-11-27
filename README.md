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

## Use Countersign end to end

This walkthrough runs a real testnet settlement on **QoreChain Diana** (EVM chain ID **9800**) using the shared Countersign deployment. You sell **10 CSB31 demo bonds** from your QoreX wallet to a script buyer for **100 test fUSD**. You need one browser with QoreX, one signed-in faucet claim, and a terminal. Use throwaway testnet accounts and keep your wallet recovery phrase and `contracts/.env` private.

### 1. Install and start the app

Use Git, Node.js 22 or later, pnpm 10, Foundry 1.5, and the QoreX browser extension 0.4.0 or later. Foundry builds the contract artifacts the trading scripts use. [Install Foundry](https://www.getfoundry.sh/introduction/installation) · [Install QoreX](https://chromewebstore.google.com/detail/qorex/cflpnggbnnifibblifgbeobogdpfjpcg)

```sh
git clone --recurse-submodules https://github.com/ayush-ranjan-official/Countersign
cd Countersign
git config core.hooksPath .githooks
pnpm --dir contracts install --frozen-lockfile
pnpm --dir contracts build
pnpm --dir app install --frozen-lockfile
pnpm --dir app dev
```

If you already cloned the repo, run `git submodule update --init --recursive` from its root before building. Keep the dev server running and open [Countersign](http://localhost:5173/) in the browser with QoreX.

### 2. Connect an Ethereum-style QoreX account

1. Open QoreX, create or unlock a test wallet, and click the version number **seven times** to reveal **Developer mode**. Select **Switch to testnet (diana)** and verify the **TESTNET** banner.
2. In QoreX, open **Your accounts**. Choose **Add an Ethereum account (coin 60)** if needed, then **Use Ethereum account**. This account can send the EVM transactions needed to lock and settle a trade.
3. In Countersign, choose **Connect Wallet → QoreX**. Approve the local site's connection request in QoreX. On **Get ready**, confirm the wallet is detected, signing is supported, the network is **EVM 9800**, and the selected account is **coin 60**. If the app still shows the previous account, reload and reconnect.
4. Copy the wallet's full **`qor1…` address** from **Get ready** or QoreX. This is your **browser seller**. Save the address for the funding step below.

### 3. Fund the browser seller and script buyer

**Generate the script accounts.** Run these commands in a second terminal from the repository root.

```sh
cd contracts
umask 077
pnpm keygen
```

Keep this terminal in `contracts/` for the remaining script commands. The script generates the local accounts in the gitignored `.env` and prints their public addresses. Copy the **`ISSUER` `qor1…` address** for the faucet and the **`BUYER` `0x…` address** for the trade form. Each tester should use the addresses printed by their own run.

**Claim the faucet funds.** Sign in to the dashboard and open the **qorechain-diana Faucet**. Replace any prefilled wallet address with your script **`ISSUER` `qor1…` address**, then click **Request Tokens**. Wait for confirmation. A fest claim provides **100 test QOR** and **1,000 bank-form fUSD**. The faucet limits claims to one per 24 hours per dashboard account and per recipient address. The funds arrive at the issuer first. [Diana faucet](https://dashboard.qorechain.io/faucet)

**Register the issuer, then prepare the buyer.** The issuer uses QOR to pay fees and forwards QOR and bank-form fUSD to the buyer. The last command makes 100 fUSD spendable by the EVM escrow.

```sh
pnpm register ISSUER
FUND_ONLY=BUYER pnpm fund
pnpm register BUYER
pnpm convert-fusd BUYER 100
```

Look for `registered=true` and `proven=true` after registration and `erc20 100 fUSD` after conversion. The funding command sends **8 QOR and 500 bank fUSD** to the local buyer. If you already funded this buyer, use `pnpm accounts` to check its balances before repeating the transfer or conversion. For a first run, the browser seller needs only QOR, since its side of the trade delivers demo bonds.

**Fund the browser seller from the same faucet claim.** Replace the quoted placeholder with the browser seller's `qor1…` address from step 2. Run this from `contracts/`. It uses the existing testnet transfer helper to simulate the transfer, then tops up the seller to **5 test QOR**. To preview the transfer, put `DRY_RUN=1` before `SELLER_QOR1` on the first line.

```sh
SELLER_QOR1='PASTE_YOUR_BROWSER_SELLER_QOR1_ADDRESS' \
  node --env-file=.env --import tsx --input-type=module <<'JS'
import { toEvmAddress } from '@qorechain/evm';
import { loadAccount } from './scripts/lib/accounts.ts';
import { bankBalances, sendNative } from './scripts/lib/native.ts';

const seller = process.env.SELLER_QOR1;
if (!seller?.startsWith('qor1')) throw new Error('Enter your browser seller qor1 address.');
toEvmAddress(seller);
const issuer = loadAccount('ISSUER');
if (seller === issuer.cosmos) throw new Error('Use the browser seller address.');
const current = BigInt((await bankBalances(seller)).uqor ?? '0');
const amount = 5_000_000n - current;

if (amount > 0n) {
  const receipt = await sendNative(issuer, [{
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: {
      fromAddress: issuer.cosmos,
      toAddress: seller,
      amount: [{ denom: 'uqor', amount: amount.toString() }],
    },
  }], { dryRun: process.env.DRY_RUN === '1' });
  if (receipt.simulated) console.log('Seller funding simulation passed.');
  else console.log('Seller funding tx', receipt.hash);
}
console.log('Seller balance (uqor)', (await bankBalances(seller)).uqor ?? '0');
JS
```

The script prints the seller's native balance in `uqor` (1 QOR = 1,000,000 uqor). Back on **Get ready**, confirm that the browser seller shows test QOR. Wait for the balance to update or reload the page if needed.

### 4. Register the browser seller and claim demo bonds

1. If **Get ready** says **No key yet**, open QoreX on Diana, choose **Send QOR**, paste your **own browser seller** `qor1…` address, and enter **0.01 QOR**. Review and confirm the self-transfer. QoreX registers the ML-DSA-87 key on the first send and shows the registration and network fees before you approve.
2. After the transfer confirms, return to **Get ready**. Wait for **ML-DSA-87 key registered with proof of possession** to show **possession proven**. Reload if the previous status is still displayed.
3. Under **Security leg: demo bond**, click **Claim demo bonds** and approve the testnet transaction in QoreX. Wait for the receipt and verify your CSB31 balance. The shared bond faucet gives **100 CSB31** per eligible wallet per 24 hours. The example sale needs 10.

### 5. Open, affirm, and lock the trade

1. In **New trade**, choose **selling bonds**, enter your script buyer's **`0x…` address**, and set **Bonds** to **10**, **Price per bond** to **10 fUSD**, and **Deadline** to **24 hours**. Review the two addresses, the **100 fUSD** total, and the deadline. Wait for the buyer's proven-key check and **Trade id ✓ matches the contract**.
2. Check the reference price before opening. This example uses the shared NAV of **10 fUSD per bond**. The settlement price must be within **2%** of a NAV no older than **two hours**. If the posted NAV has changed, use the current value and make sure the buyer has enough ERC-20 fUSD for the revised total. Keep the demo below **250 fUSD** to avoid the compliance officer approval step.
3. Click **Sign in QoreX and open the trade**. Approve the ML-DSA affirmation message, then approve the testnet transaction that submits it. Wait until the trade page shows **Open** and **Seller affirmed**. Copy the full **Trade id**.
4. In the `contracts/` terminal, run the command below with the copied ID. The script buyer opens a scoped EVM window, affirms, approves the exact fUSD amount, and locks the cash.

   ```sh
   pnpm counterparty 'PASTE_THE_FULL_0x_TRADE_ID'
   ```

5. Return to the trade page. Once the checklist shows **Buyer affirmed** and **Cash locked in escrow**, click **Approve exactly 10 bonds and lock**. Approve the exact token allowance and then the escrow lock in QoreX when prompted. Wait for **Bonds locked in escrow**.

### 6. Settle and verify both transfers

1. When the **Settlement checklist** says **ready: anyone can settle now**, click **Settle: bonds ↔ fUSD in one transaction**. Approve the settlement transaction on Diana.
2. Wait for the trade to show **Settled**. Open the receipt link and check for a successful transaction with **both** token transfers. The buyer receives **10 CSB31** and the browser seller receives **100 ERC-20 fUSD** from the escrow in that one receipt. The seller can confirm the fUSD balance on **Get ready**.
3. To reopen a trade, use **Blotter** or open `http://localhost:5173/#/trade/<trade-id>` with the full `0x…` trade ID. An already settled example is recorded in [the demo log](docs/DEMO.md). [Example settlement receipt](https://explore.qore.network/tx/0xb60ad2ab4717274f8f570750d1dbef944c0973fb75defd2541417acd8f660e06)

### Trade with another wallet or test from the terminal

- **Two wallets in the app.** Each trader can claim directly to their own QoreX `qor1…` address using the faucet, subject to its claim limit. Each connects their coin-60 account, registers their key with the self-transfer in step 4, and pays their own testnet fees. The seller claims CSB31. The buyer clicks **Convert to ERC-20** under **Cash leg: fUSD** to convert enough bank fUSD for the trade and approves the conversion in QoreX. After the first trader opens the trade, share the trade ID or use **Copy share link**. Each trader opens the trade on their own running app, reviews the terms, affirms if needed, and locks only their own leg. Either trader can submit settlement once both legs are locked.
- **Script-only trade.** If the script buyer is funded from step 3, run `FUND_ONLY=SELLER pnpm fund`, then `pnpm register SELLER` and `pnpm trade` from `contracts/`. The script claims demo bonds and converts buyer fUSD as needed. It prints **SETTLED in one tx** and the exact balance changes on success.
- **Automated contract tests.** From the root, run `pnpm --dir contracts test` and `pnpm --dir contracts typecheck`. Run `pnpm --dir app build` for the frontend check. The Foundry suite uses mocked PQC precompiles and can run without a funded wallet. For private deployments and officer or attestor setup, see [docs/DEVELOPING.md](docs/DEVELOPING.md).

### Troubleshooting

| What you see | What to do |
| --- | --- |
| The browser wallet still has **0 QOR** after the faucet confirms | Check the receipt's recipient. The solo flow claims to the script issuer, then separately tops up your browser seller. Compare the full `qor1…` addresses and confirm Diana is selected. |
| **Coin 118**, **precompile inactive**, or the wrong network | In QoreX, switch to **Diana** and select the **coin-60** account. Reload or reconnect Countersign. |
| **No key yet** or `NotHybridHolder` | Complete the testnet self-transfer and wait for **possession proven** before claiming or trading bonds. |
| The buyer has bank fUSD and **0 ERC-20 fUSD** | Run `pnpm convert-fusd BUYER 100` for the script buyer or use **Convert to ERC-20** for a QoreX buyer. |
| The wallet asks to unlock, approve several times, or open an EVM window | Unlock QoreX and review each request. Affirming signs a message and submits it. Locking can request an exact token approval and then a separate escrow transaction. QoreX can open a scoped window for an EVM call. |
| **Settle** is disabled, or the checklist shows `NotLocked` | Confirm both parties affirmed and both escrow entries are checked. Use the settlement checklist for the current blocker. |
| `NavStale` or `PriceOutOfBand` | The shared [NAV workflow](.github/workflows/nav-poster.yml) is scheduled hourly. Wait for a fresh post or ask a maintainer to run it. If the fixed trade price remains outside the band, create a new trade at the current NAV. |
| An open trade passes its deadline with assets in escrow | Use **Reclaim: return each leg to its owner**. Verify the trade shows **Reclaimed** and deposited assets return to their original owners. |

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
| [Tailwind CSS](https://tailwindcss.com/) and [Motion](https://motion.dev/) | Responsive app styling and interaction transitions |
| [Instrument Serif](https://fonts.google.com/specimen/Instrument+Serif) and [Manrope](https://fonts.google.com/specimen/Manrope) | App typography |
| QoreChain packages: `@qorechain/sdk`, `@qorechain/evm`, `@qorechain/qoresign`, `@qorechain/qoreseal`, `@qorechain/qorex-types`, `@qorechain/qorex-rainbowkit` | Accounts, windows, ML-DSA signing, QoreSeal, QoreX wallet |
| [QoreChain MCP](https://github.com/qorechain/qorechain-mcp) | Read-only chain tools and agent skills used while building (see [AI_USAGE.md](AI_USAGE.md)) |

## Licence
[Apache-2.0](LICENSE).
