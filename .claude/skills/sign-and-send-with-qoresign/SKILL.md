---
name: sign-and-send-with-qoresign
description: Sign and send QoreChain native-lane transactions with QoreSign (hybrid secp256k1 + ML-DSA-87, FIPS 204). Use when writing wallet or backend code that holds the account's own keys, verifies hybrid signatures, registers an ML-DSA-87 key, or implements Sign In With QoreChain.
---

# Sign and send with QoreSign

QoreSign signs locally; it never sends keys anywhere. Packages: TypeScript `@qorechain/qoresign`, Rust `qorechain-qoresign`, Go `github.com/qorechain/qoresign/go`, Swift `QoreSign`, Kotlin `io.github.qorechain:qoresign`. Source and specifications: `https://github.com/qorechain/qoresign`.

Only write this code for the key owner's own wallet or backend. An agent must never ask a user to paste a recovery phrase or private key.

## Flow (TypeScript)

```ts
import { addressFromPublicKey, deriveCanonicalPqKey, deriveClassicalKey, signHybrid } from "@qorechain/qoresign";
import { fetchPqKeyStatus, submitWithSignBytesFallback } from "@qorechain/qoresign/network";

const rest = "https://api-testnet.qore.host";
const chainId = "qorechain-diana";

const classical = deriveClassicalKey({ mnemonic });                       // m/44'/118'/0'/0/0
const address = addressFromPublicKey(classical.publicKey, "secp256k1").bech32;
const pqKey = deriveCanonicalPqKey({ mnemonic, address });               // the key QoreChain wallets register

// 1. The account needs a registered ML-DSA-87 key.
const status = await fetchPqKeyStatus({ rest, address });
// if !status.registered: register once (buildRegisterPqKeyMessage + signProofOfPossession), signed with mode "classicalOnly"

// 2. bodyBytes / authInfoBytes / accountNumber: from your own builder, or from the
//    QoreChain MCP tool prepare_transfer (sign_doc.body_bytes, sign_doc.auth_info_bytes, sign_doc.account_number).

// 3. Simulate, then sign and broadcast. The fallback retries once with the other sign-bytes version if the network refuses the first.
const result = await submitWithSignBytesFallback({
  rest,
  chainId,
  sign: (signBytesVersion) =>
    signHybrid({ chainId, accountNumber, bodyBytes, authInfoBytes, classicalKey: classical, pqKey, signBytesVersion }).txBytes,
});
```

## Rules

- A valid native-lane transaction body carries exactly one `/qorechain.pqc.v1.PQCHybridSignature` extension. `signHybrid` replaces any existing layer, then signs the final SignDoc classically.
- Sign-bytes: `v2` on networks with the `pqc-sign-bytes-v2` protocol feature (check `get_chain_info` or `resolveSignBytesVersion`), `v1` before.
- Gas: simulate first. From chain v3.2.5 simulation includes the ML-DSA-87 verification, so the limit is `ceil(gasUsed * 1.02) + 2000`; on older chains use `ceil((gasUsed + 40000) * 1.4)`. `suggestGasLimit` and `simulateTx` apply this. Fee = gas limit x 0.1 uqor minimum.
- Verify before you rely on a layer: `verifyPqLayer` (offline, against a known key) or `assertPqLayerMatchesRegisteredKey` (against the chain). The MCP tool `get_pq_status` does the same for committed transactions.
- The first ML-DSA-87 key registration is signed classically (`mode: "classicalOnly"`); every later transaction is hybrid.
- EVM lane: QoreSign supports quantum-ready mode only (registered key plus an EVM window opened from the native lane). SVM lane: not open yet.

## Errors

`QoreSignError` has a stable `code`, e.g. `KEY_NOT_REGISTERED`, `PQ_LAYER_MISSING`, `PQ_SIGNATURE_INVALID`, `SIMULATION_FAILED`, `LANE_NOT_AVAILABLE`. Treat a simulation failure as a reason not to sign.
