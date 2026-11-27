# Countersign architecture

## Flow

```mermaid
sequenceDiagram
    autonumber
    participant S as Seller (QoreX / script)
    participant B as Buyer (QoreX / script)
    participant O as Officer
    participant A as NAV attestor
    participant C as Countersign
    participant P as pqcKeyStatus 0x…0a02 / pqcVerify 0x…0a01
    participant T as CMTAT bond + hybrid-holder guard / fUSD

    S->>B: agree on Terms off chain (share link; ticketHash = keccak256(ticket JSON))
    S->>C: affirm(terms, seller, ML-DSA sig over "countersign:v1:affirm:<tradeId>")
    C->>P: key registered + possession proven? signature valid over qorechain-msg-v1|qorechain-diana|data?
    Note over C: first affirmation opens the trade, emits TradeOpened (discovery)
    B->>C: affirm(terms, buyer, sig)
    C->>P: same checks for the buyer
    S->>T: approve(Countersign, assetAmount) exact
    S->>C: lockAsset(tradeId) pulls the bond (guard: seller is a hybrid holder, Countersign exempt)
    B->>T: approve(Countersign, cashAmount) exact
    B->>C: lockCash(tradeId) pulls fUSD
    opt cashAmount >= largeTradeThreshold
        O->>C: approveLarge(tradeId, sig over "countersign:v1:approve:<tradeId>")
    end
    A->>C: postNav(asset, cash, price, ts, nonce, sig over a readable NAV string)
    Note over C: settle: affirmed + locked + deadline + officer + fresh in-band NAV
    C->>T: bond to buyer AND fUSD to seller, in ONE transaction
    Note over C: after the deadline instead: reclaim returns each locked leg to its depositor
```

Every EVM transaction is admitted only inside an **EVM authorisation window**:
- **Scripts:** a window scoped to `[Countersign, bond, fUSD]`, opened by the scripts.
- **Web app:** QoreX opens a per-transaction window limited to the contracts it calls.

## Components

| Component | Path | Notes |
|---|---|---|
| Countersign | `contracts/src/Countersign.sol` | No owner, no upgrades, no setters. Config is immutable (constructor). |
| Precompile interface | `contracts/src/interfaces/IQorePQC.sol` | Low-level `staticcall`s; empty return data fails closed |
| Demo bond | Asset Kit v0.1.0 `CMTATStandalone` (CMTAT v3.2.0) + `QoreChainHybridHolderRule` + `QoreChainHybridHolderGuard` | `contracts/script/DeployBond.s.sol`. Countersign is exempted in the guard. |
| Demo bond faucet | `contracts/src/DemoBondFaucet.sol` | Testnet demo: any hybrid holder claims demo bonds, so anyone can sell |
| Cash leg | fUSD ERC-20 `0x97143B771D34ddb9130b807b135Ae675A5a963CA` | The faucet pays bank fUSD; `MsgConvertCoin` makes it ERC-20 (`scripts/lib/convert.ts`) |
| Operational scripts | `contracts/scripts/*.ts` | Accounts, registration with proof of possession, funding, scoped windows, `trade.ts`, `attack.ts` |
| Web app | `app/` | Vite + React + wagmi + QoreX. Signing through `window.qorex.native.signArbitrary` (spike S-2). |

## Message formats (QoreSign message-signing-v1)

`pqcVerify` checks `"qorechain-msg-v1|" + "qorechain-diana" + "|" + data`, where `data` is one of:

| Purpose | `data` |
|---|---|
| Party affirmation | `countersign:v1:affirm:0x<tradeId, 64 lowercase hex>` |
| Officer approval | `countersign:v1:approve:0x<tradeId>` |
| NAV | `countersign:v1:nav:asset=0x…;cash=0x…;price=<base units per bond>;ts=<unix>;nonce=<n>` |

`tradeId = keccak256(abi.encode(TERMS_TYPEHASH, chainid, countersign, terms))`. The contract exposes `tradeIdOf`, `affirmData`, `approveData`, `navData` and `signedBytes`, so a UI never has to rebuild them by hand.
