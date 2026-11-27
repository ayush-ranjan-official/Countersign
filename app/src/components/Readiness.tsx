import { useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { parseUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { CHAIN_ID, DEPLOYMENT, faucetAbi } from "../lib/config";
import { can, convertFusd, qorexNative } from "../lib/qorex";
import { useBalances, useBankFusd, useChainNow, useKeyStatus } from "../lib/reads";
import { useTx } from "../lib/tx";
import { Addr, TxLink, TxStatus, fmtFusd, fmtQor, same, useQorex } from "./ui";

const QOREX_INSTALL = "https://chromewebstore.google.com/detail/qorex/cflpnggbnnifibblifgbeobogdpfjpcg";
const FAUCET = "https://dashboard.qorechain.io/faucet";
const MIN_QOR = 10n ** 16n;

function SetupRow({ title, complete, active, children }: {
  title: string;
  complete: boolean;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <li className="setup-row" data-state={complete ? "done" : active ? "current" : "next"}>
      <span className="setup-marker" aria-hidden="true">{complete ? "✓" : active ? "•" : ""}</span>
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <h3>{title}</h3>
          <span className="step-status">{complete ? "Ready" : active ? "Next step" : "Later"}</span>
        </div>
        {active && <div className="setup-detail">{children}</div>}
      </div>
    </li>
  );
}

export function Readiness({ initialSide }: { initialSide: "seller" | "buyer" }) {
  const [side, setSide] = useState(initialSide);
  const reduceMotion = useReducedMotion();
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
  const [convertMsg, setConvertMsg] = useState("");
  const [converting, setConverting] = useState(false);
  const [extensionFound, setExtensionFound] = useState(() => Boolean(qorexNative()));

  useEffect(() => {
    const onFocus = () => setExtensionFound(Boolean(qorexNative()));
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  const walletReady = isConnected && chainId === CHAIN_ID && Boolean(acct?.coin60) && same(address, acct?.evm) && can("signArbitrary");
  const hasFees = Boolean(bal.data && bal.data.qor > MIN_QOR);
  const keyOk = Boolean(key.data?.registered && key.data.possessionProven && key.data.algorithmId === 1 && key.data.keyLength === 2592);
  const assetReady = Boolean(bal.data && (side === "seller" ? bal.data.bonds : bal.data.fusd) > 0n);
  const steps = [walletReady, hasFees, keyOk, assetReady];
  const active = steps.indexOf(false);
  const nextClaim = bal.data?.nextClaim;
  const canClaimNow = now.data !== undefined && nextClaim !== undefined && now.data >= nextClaim;
  const claiming = ["simulating", "signing", "mining"].includes(claim.state.phase);

  async function doConvert() {
    if (!acct || converting) return;
    setConverting(true);
    setConvertMsg("Confirm the conversion in QoreX.");
    try {
      const amount = parseUnits(convertAmt || "0", 6);
      if (amount <= 0n) throw new Error("Enter an amount greater than zero.");
      const result = await convertFusd(acct, amount);
      setConvertMsg("Conversion confirmed. Transaction " + result.txHash);
      await Promise.all([bal.refetch(), bank.refetch()]);
    } catch (error) {
      setConvertMsg(error instanceof Error ? error.message : String(error));
    } finally {
      setConverting(false);
    }
  }

  const assetTools = side === "seller" ? (
    <>
      <p>Claim {DEPLOYMENT.faucetAmount.toString()} test CSB31 bonds from the demo bond faucet.</p>
      <button className="primary" disabled={!walletReady || !keyOk || !canClaimNow || claiming} onClick={async () => {
        const txHash = await claim.run("Claim demo bonds", { address: DEPLOYMENT.faucet, abi: faucetAbi, functionName: "claim" });
        if (txHash) await bal.refetch();
      }}>
        {claiming ? "Claiming bonds…" : nextClaim && now.data !== undefined && nextClaim > now.data ? "Claim available " + new Date(Number(nextClaim) * 1000).toLocaleString() : "Claim demo bonds"}
      </button>
      <TxStatus s={claim.state} />
    </>
  ) : (
    <>
      <p>Convert bank fUSD to ERC-20 fUSD for escrow.{bank.data != null && " Bank balance: " + fmtFusd(bank.data) + " fUSD."}</p>
      {bank.data === 0n && <p><a className="text-link" href={FAUCET} target="_blank" rel="noreferrer">Get test fUSD from the Diana faucet ↗</a></p>}
      <div className="convert-controls">
        <label className="flex-1">Amount in fUSD<input inputMode="decimal" value={convertAmt} onChange={(event) => setConvertAmt(event.target.value)} /></label>
        <button className="primary" disabled={!walletReady || !keyOk || !can("signAndBroadcast") || converting} onClick={doConvert}>
          {converting ? "Converting…" : "Convert to ERC-20"}
        </button>
      </div>
      {convertMsg && <p className="status" role="status">{convertMsg}</p>}
    </>
  );

  return (
    <div className="overview-grid">
      <section className="overview-intro">
        <div>
          <p className="overline">Bond settlement</p>
          <h1>Settle a bond trade on your terms.</h1>
          <p className="intro-description">Agree the deal, lock both sides, and exchange bonds for payment in one transaction.</p>
        </div>
        <div>
          <h2 className="intent-heading">What are you doing today?</h2>
          <div className="intent-controls" role="group" aria-label="Trading role">
            <button type="button" className="intent-option" aria-pressed={side === "seller"} onClick={() => setSide("seller")}>
              <span><strong>Sell bonds</strong><small>Deliver CSB31 and receive fUSD</small></span><span className="intent-indicator" aria-hidden="true" />
            </button>
            <button type="button" className="intent-option" aria-pressed={side === "buyer"} onClick={() => setSide("buyer")}>
              <span><strong>Buy bonds</strong><small>Pay fUSD and receive CSB31</small></span><span className="intent-indicator" aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>

      <section className="panel readiness-panel" aria-labelledby="readiness-heading">
        <header className="readiness-header">
          <div><p className="overline">Wallet setup</p><h2 id="readiness-heading">Get ready to trade</h2></div>
          <span className="setup-count">{steps.filter(Boolean).length} of {steps.length} ready</span>
        </header>
        <ul className="setup-list">
          <SetupRow title="Connect QoreX" complete={walletReady} active={active === 0}>
            {!extensionFound && !qorexNative() ? (
              <><p>Install QoreX and enable Diana testnet to connect an Ethereum-style account.</p><a className="button" href={QOREX_INSTALL} target="_blank" rel="noreferrer">Install QoreX ↗</a></>
            ) : !isConnected ? (
              <><p>Connect your QoreX wallet to begin.</p><ConnectButton showBalance={false} /></>
            ) : chainId !== CHAIN_ID ? (
              <><p>Switch to Diana in QoreX. If you don’t see it, tap the extension version seven times to enable developer mode.</p><button className="primary" onClick={() => switchChain({ chainId: CHAIN_ID })}>Switch to Diana</button></>
            ) : acct && (!acct.coin60 || !same(address, acct.evm)) ? (
              <p>In QoreX, go to <strong>Your accounts</strong> and select an <strong>Ethereum account (coin 60)</strong>. Reconnect if the address in the header differs.</p>
            ) : acct && !can("signArbitrary") ? (
              <p>Update QoreX to a build that supports signing trade messages.</p>
            ) : (
              <p>{qx.error ? "Unlock QoreX and reconnect to verify your account." : "Checking your QoreX account…"}</p>
            )}
          </SetupRow>
          <SetupRow title="Add test QOR for fees" complete={hasFees} active={active === 1}>
            <p>Request test tokens for your connected Diana wallet.{acct && <span className="mt-1 block break-all font-mono text-xs">{acct.qor1}</span>}</p>
            <a className="button" href={FAUCET} target="_blank" rel="noreferrer">Open Diana faucet ↗</a>
          </SetupRow>
          <SetupRow title="Register your signing key" complete={keyOk} active={active === 2}>
            <p>Send 0.01 test QOR to your own address in QoreX. The wallet registers your ML-DSA-87 key on your first send.</p>
            {key.isFetching && <p role="status">Checking for registration…</p>}
          </SetupRow>
          <li className="setup-assets">
            <AnimatePresence initial={false} mode="wait">
              <motion.div key={side} initial={reduceMotion ? false : { opacity: 0 }}
                animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: reduceMotion ? 0 : 0.15 }}>
                <ul className="list-none"><SetupRow title={side === "seller" ? "Get demo bonds" : "Prepare fUSD"} complete={assetReady} active={active === 3}>{assetTools}</SetupRow></ul>
              </motion.div>
            </AnimatePresence>
          </li>
        </ul>

        <div className="readiness-bottom">
          {bal.data && (
            <dl className="balance-strip">
              <div><dt>CSB31 bonds</dt><dd>{bal.data.bonds.toString()}</dd></div>
              <div><dt>Spendable fUSD</dt><dd>{fmtFusd(bal.data.fusd)}</dd></div>
              <div><dt>Test QOR</dt><dd>{fmtQor(bal.data.qor)}</dd></div>
            </dl>
          )}
          {active === -1 && (
            <>
              <a className="button primary" href={"#/new?side=" + side}>New trade <span aria-hidden="true">↗</span></a>
              <details className="disclosure"><summary>{side === "seller" ? "Claim more bonds" : "Convert more fUSD"}</summary><div className="setup-detail">{assetTools}</div></details>
            </>
          )}
          {assetReady && side === "seller" && claim.state.phase === "done" && <TxLink hash={claim.state.hash} label="View bond claim receipt" />}
          <details className="disclosure">
            <summary>Network and contracts</summary>
            <dl className="network-details">
              <div><dt>Chain</dt><dd>Diana · {CHAIN_ID}</dd></div>
              <div><dt>Escrow</dt><dd><Addr a={DEPLOYMENT.countersign} /></dd></div>
              <div><dt>Bond</dt><dd><Addr a={DEPLOYMENT.bond} /></dd></div>
              <div><dt>Bond faucet</dt><dd><Addr a={DEPLOYMENT.faucet} /></dd></div>
              <div><dt>Compliance officer</dt><dd><Addr a={DEPLOYMENT.officer} /></dd></div>
              <div><dt>Price attestor</dt><dd><Addr a={DEPLOYMENT.attestor} /></dd></div>
            </dl>
          </details>
        </div>
      </section>
    </div>
  );
}
