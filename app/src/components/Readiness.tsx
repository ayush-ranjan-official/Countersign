import { useState } from "react";
import { parseUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CHAIN_ID, DEPLOYMENT, faucetAbi } from "../lib/config";
import { can, convertFusd, qorexNative } from "../lib/qorex";
import { useBalances, useBankFusd, useChainNow, useKeyStatus } from "../lib/reads";
import { useTx } from "../lib/tx";
import { Addr, Card, Check, TxLink, TxStatus, fmtFusd, fmtQor, useQorex } from "./ui";

/** Everything a new user needs before trading, checked on chain, each with the fix next to it. */
export function Readiness() {
  const { address, chainId, isConnected } = useAccount();
  const { switchChain } = useSwitchChain();
  const qx = useQorex();
  const acct = qx.data;
  const key = useKeyStatus(acct?.evm);
  const bal = useBalances(acct?.evm);
  const bank = useBankFusd(acct?.qor1);
  const now = useChainNow();
  const claim = useTx();
  const [convertAmt, setConvertAmt] = useState("100");
  const [convertMsg, setConvertMsg] = useState<string | null>(null);
  const native = qorexNative();

  const keyOk = !!key.data?.registered && !!key.data?.possessionProven && key.data.algorithmId === 1 && key.data.keyLength === 2592;
  const nextClaim = bal.data?.nextClaim ?? 0n;
  const canClaimNow = now.data !== undefined && now.data >= nextClaim;

  async function doConvert() {
    if (!acct) return;
    setConvertMsg("approve in QoreX…");
    try {
      const r = await convertFusd(acct, parseUnits(convertAmt || "0", 6));
      setConvertMsg(`converted: tx ${r.txHash} (${r.shield})`);
    } catch (e) {
      setConvertMsg(`not converted: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return (
    <div className="stack">
      <Card title="Get ready to trade" aside={<ConnectButton showBalance={false} />}>
        <p className="muted">
          Countersign accepts only post-quantum (ML-DSA-87) approvals, checked on chain. These checks read the same precompiles the contract uses.
        </p>
        <ul className="checks">
          <Check ok={!!native} title="QoreX wallet found">
            {native ? `capabilities: ${(native.capabilities ?? []).join(", ") || "none declared"}` : "Install the QoreX extension, then reload."}
          </Check>
          <Check ok={can("signArbitrary")} title="QoreX can sign messages (signArbitrary)">
            Needs QoreX extension 0.4.0+ or app 1.2.1+.
          </Check>
          <Check ok={isConnected && chainId === CHAIN_ID} title="Connected to QoreChain testnet (EVM 9800)">
            {isConnected && chainId !== CHAIN_ID ? (
              <button className="link" onClick={() => switchChain({ chainId: CHAIN_ID })}>
                Switch to testnet
              </button>
            ) : (
              !isConnected && "Connect QoreX above. In QoreX, testnet is under developer mode (tap the version number 7 times)."
            )}
          </Check>
          <Check ok={!!acct?.coin60} warn={!!acct && !acct.coin60} title="Ethereum-style account (coin 60)">
            {acct ? (
              <>
                <Addr a={acct.evm} /> <span className="mono">{acct.qor1}</span>
                {!acct.coin60 && " — this coin-118 account can sign, but not send EVM transactions. In QoreX: Settings → Your accounts → Add an Ethereum account (coin 60)."}
              </>
            ) : (
              qx.error?.message ?? "connect first"
            )}
          </Check>
          <Check ok={keyOk} title="ML-DSA-87 key registered with proof of possession">
            {key.data
              ? !key.data.active
                ? "pqcKeyStatus precompile inactive on this network"
                : key.data.registered
                  ? `algorithm ${key.data.algorithmId}, ${key.data.keyLength}-byte key, possession ${key.data.possessionProven ? "proven" : "NOT proven"}`
                  : "No key yet: send any small transaction from QoreX once (e.g. 0.01 QOR to yourself); QoreX registers it."
              : acct
                ? "reading…"
                : "connect first"}
          </Check>
          <Check ok={(bal.data?.qor ?? 0n) > 10n ** 16n} title="Some test QOR for fees">
            {bal.data ? `${fmtQor(bal.data.qor)} QOR. ` : ""}
            Faucet: <a href="https://dashboard.qorechain.io/faucet" target="_blank" rel="noreferrer">dashboard.qorechain.io/faucet</a> (sign in, paste your qor1 address).
          </Check>
        </ul>
      </Card>

      <div className="grid2">
        <Card title="Cash leg: fUSD">
          <p>
            ERC-20 fUSD: <strong>{bal.data ? fmtFusd(bal.data.fusd) : "…"}</strong>
            {bank.data !== undefined && bank.data !== null && (
              <>
                {" "}
                · bank form: <strong>{fmtFusd(bank.data)}</strong>
              </>
            )}
          </p>
          <p className="muted small">The faucet pays fUSD as a bank coin. Buyers convert it to ERC-20 once (MsgConvertCoin, signed in QoreX).</p>
          <div className="row">
            <input aria-label="fUSD to convert" value={convertAmt} onChange={(e) => setConvertAmt(e.target.value)} inputMode="decimal" />
            <button disabled={!acct || !can("signAndBroadcast")} onClick={doConvert}>
              Convert to ERC-20
            </button>
          </div>
          {convertMsg && <p className="status">{convertMsg}</p>}
        </Card>

        <Card title="Security leg: demo bond">
          <p>
            You hold <strong>{bal.data ? bal.data.bonds.toString() : "…"}</strong> CSB31 (Countersign Demo Bond 2031, CMTAT with the hybrid-holder guard).
          </p>
          <p className="muted small">
            Testnet demo only. Wallets with a proven ML-DSA key can claim {DEPLOYMENT.faucetAmount.toString()} demo bonds a day to act as a seller; the guard refuses classical-only wallets.
          </p>
          <button
            disabled={!address || !canClaimNow}
            onClick={() => claim.run("claim demo bonds", { address: DEPLOYMENT.faucet, abi: faucetAbi, functionName: "claim" })}
          >
            {canClaimNow ? "Claim demo bonds" : `Next claim ${new Date(Number(nextClaim) * 1000).toLocaleString()}`}
          </button>
          <TxStatus s={claim.state} />
        </Card>
      </div>

      <Card title="Deployment">
        <p className="muted small">
          {DEPLOYMENT.label} · Countersign <Addr a={DEPLOYMENT.countersign} /> · bond <Addr a={DEPLOYMENT.bond} /> · faucet <Addr a={DEPLOYMENT.faucet} /> · officer{" "}
          <Addr a={DEPLOYMENT.officer} /> · NAV attestor <Addr a={DEPLOYMENT.attestor} />
        </p>
        {claim.state.phase === "done" && <TxLink hash={claim.state.hash} />}
      </Card>
    </div>
  );
}
