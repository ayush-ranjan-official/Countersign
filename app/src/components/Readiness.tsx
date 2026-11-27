import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { formatUnits, parseUnits } from "viem";
import { useAccount, useSwitchChain } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { qorechainTestnet } from "@qorechain/evm";
import { CHAIN_ID, DEPLOYMENT, PQC_KEY_STATUS, faucetAbi } from "../lib/config";
import { can, convertFusd, qorexNative } from "../lib/qorex";
import { useBalances, useBankFusd, useChainNow, useKeyStatus } from "../lib/reads";
import { useTx } from "../lib/tx";
import { ReadinessCoin } from "./ReadinessCoin";
import { SetupRow, SetupValue, TerminalCheck } from "./SetupChecklist";
import { Addr, TxLink, TxStatus, fmtFusd, fmtQor, same, useQorex } from "./ui";

const QOREX_INSTALL = "https://chromewebstore.google.com/detail/qorex/cflpnggbnnifibblifgbeobogdpfjpcg";
const FAUCET = "https://dashboard.qorechain.io/faucet";
const DIANA_RPC = qorechainTestnet.rpcUrls.default.http[0];
const FIRST_SEND_AMOUNT = "0.01";
export const MIN_QOR = 10n ** 16n;
type Side = "seller" | "buyer";

export function Readiness({ tradeSetup }: { tradeSetup?: { side: Side; amount: bigint } }) {
  const [selectedSide, setSide] = useState<Side>();
  const [accordion, setAccordion] = useState<{ checkpoint: number; row: number }>();
  const side = tradeSetup?.side ?? selectedSide;
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
  const [customAmount, setConvertAmt] = useState<string>();
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
  const requiredAmount = tradeSetup?.amount ?? 1n;
  const spendableFusd = bal.data?.fusd ?? 0n;
  const convertAmt = customAmount ?? (tradeSetup ? formatUnits(requiredAmount > spendableFusd ? requiredAmount - spendableFusd : 0n, 6) : "100");
  const assetReady = Boolean(side && bal.data && (side === "seller" ? bal.data.bonds : spendableFusd) >= requiredAmount);
  const steps = [walletReady, hasFees, keyOk, assetReady];
  const active = steps.indexOf(false);
  const openRow = accordion?.checkpoint === active ? accordion.row : active;
  const sharedReady = walletReady && hasFees && keyOk;
  const connectedAccount = walletReady ? acct : undefined;
  const evmInput = connectedAccount?.evm ?? "PASTE_YOUR_0x_ADDRESS";

  function rowProps(index: number) {
    return {
      complete: steps[index] ?? false,
      active: active === index,
      open: openRow === index,
      onToggle: () => setAccordion({ checkpoint: active, row: openRow === index ? -1 : index }),
    };
  }
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

  const assetTools = side === undefined ? null : side === "seller" ? (
    <>
      <p>Claim {DEPLOYMENT.faucetAmount.toString()} test CSB31 bonds from the demo bond faucet.</p>
      <button className="primary" disabled={!sharedReady || !canClaimNow || claiming} onClick={async () => {
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
      <div className="convert-controls">
        <label className="flex-1">Amount in fUSD<input inputMode="decimal" value={convertAmt} onChange={(event) => setConvertAmt(event.target.value)} /></label>
        <button className="primary" disabled={!sharedReady || !can("signAndBroadcast") || converting} onClick={doConvert}>
          {converting ? "Converting…" : "Convert to ERC-20"}
        </button>
      </div>
      {convertMsg && <p className="status" role="status">{convertMsg}</p>}
    </>
  );

  const assetTitle = side === "seller" ? "Get demo bonds" : side === "buyer" ? "Prepare fUSD" : "Prepare trading assets";
  const setupPanel = (
    <section className={tradeSetup ? "trade-readiness" : "panel readiness-panel"} aria-labelledby="readiness-heading">
        <header className="readiness-header">
          <h2 id="readiness-heading">{tradeSetup ? "Prepare your " + tradeSetup.side + " wallet" : "Get ready to trade"}</h2>
          {tradeSetup && <span className="setup-count">{steps.filter(Boolean).length} of {steps.length} ready</span>}
        </header>
        <ul className="setup-list">
          <SetupRow title="Connect QoreX" {...rowProps(0)}>
            <p>QoreX is the browser wallet you’ll use to hold test tokens and approve trade actions.</p>
            <ol className="setup-steps">
              <li>Install QoreX, then open the extension and create or unlock a test wallet.</li>
              <li>Tap the version number seven times to reveal developer mode. Choose <strong>Switch to testnet (Diana)</strong> and check for the <strong>TESTNET</strong> banner.</li>
              <li>Open <strong>Your accounts</strong> and select <strong>Use Ethereum account</strong>. Add an <strong>Ethereum account (coin 60)</strong> first if you don’t have one.</li>
              <li>In Countersign, choose <strong>Connect Wallet → QoreX</strong> and approve the connection in the extension.</li>
            </ol>
            {walletReady ? (
              <p>Your QoreX Ethereum account is connected to Diana.</p>
            ) : !extensionFound && !qorexNative() ? (
              <a className="button" href={QOREX_INSTALL} target="_blank" rel="noreferrer">Install QoreX ↗</a>
            ) : !isConnected ? (
              <ConnectButton showBalance={false} />
            ) : chainId !== CHAIN_ID ? (
              <button className="primary" onClick={() => switchChain({ chainId: CHAIN_ID })}>Switch to Diana</button>
            ) : acct && (!acct.coin60 || !same(address, acct.evm)) ? (
              <p>Select the Ethereum account in QoreX and reconnect Countersign if the addresses differ.</p>
            ) : acct && !can("signArbitrary") ? (
              <p>Update QoreX to version 0.4.0 or later to sign trade messages.</p>
            ) : (
              <p role="status">{qx.error ? "Unlock QoreX and reconnect to verify your account." : "Checking your QoreX account…"}</p>
            )}
          </SetupRow>
          <SetupRow title="Add test QOR for fees" {...rowProps(1)}>
            <p>Test QOR pays Diana’s network fees when you register your key, claim bonds, or submit a trade transaction.</p>
            <ol className="setup-steps">
              <li>Copy the <code>qor1…</code> address for the same Ethereum account you connected. You can find it in QoreX or copy it below once connected.</li>
              <li>Open the <strong>Diana faucet</strong> and sign in. Paste your own address over any prefilled recipient, then click <strong>Request Tokens</strong>.</li>
              <li>Wait for confirmation, then return here and check your test QOR balance. If it stays at zero, compare the full recipient address in the faucet receipt with your QoreX address.</li>
            </ol>
            {connectedAccount && <SetupValue label="Faucet recipient" value={connectedAccount.qor1} copyLabel="Copy QOR address" />}
            <div className="setup-actions">
              <a className="button" href={FAUCET} target="_blank" rel="noreferrer">Open Diana faucet ↗</a>
              {connectedAccount && <button type="button" className="ghost" disabled={bal.isFetching} onClick={() => void bal.refetch()}>
                {bal.isFetching ? "Checking balance…" : "Refresh balance"}
              </button>}
            </div>
            <TerminalCheck connected={Boolean(connectedAccount)} command={`cast balance '${evmInput}' --ether --rpc-url ${DIANA_RPC}`}>
              This prints the test QOR balance for that address.
            </TerminalCheck>
          </SetupRow>
          <SetupRow title="Register your signing key" {...rowProps(2)}>
            <p>Your QoreX wallet uses an ML-DSA-87 key to sign trade approvals. Your first send on Diana registers the public key so Countersign can verify those signatures.</p>
            {keyOk ? <p>Your key is registered and ownership is verified. This wallet is ready to sign.</p> : (
              <>
                <ol className="setup-steps">
                  <li>With test QOR in your account, open QoreX on <strong>Diana</strong> and choose <strong>Send QOR</strong>.</li>
                  <li>Paste your <strong>own <code>qor1…</code> address</strong> as the recipient and enter <strong>{FIRST_SEND_AMOUNT} QOR</strong>.</li>
                  <li>Review the recipient and the fees shown by QoreX, then confirm the self-transfer. After it confirms, return here and wait for this step’s checkmark.</li>
                </ol>
                {connectedAccount && <SetupValue label="Send QOR to your own address" value={connectedAccount.qor1} copyLabel="Copy self-transfer address" />}
                <SetupValue label="Amount in QOR" value={FIRST_SEND_AMOUNT} copyLabel="Copy amount" />
              </>
            )}
            {connectedAccount && !keyOk && (
              <button type="button" className="ghost" disabled={key.isFetching} onClick={() => void key.refetch()}>
                {key.isFetching ? "Checking registration…" : "Check registration"}
              </button>
            )}
            <TerminalCheck connected={Boolean(connectedAccount)}
              command={`cast call ${PQC_KEY_STATUS} 'pqcKeyStatus(address)(bool,uint8,bytes,bool)' '${evmInput}' --rpc-url ${DIANA_RPC}`}>
              A registered ML-DSA-87 key reports <code>true</code>, algorithm <code>1</code>, the public key, and a final <code>true</code> for proof of ownership.
            </TerminalCheck>
          </SetupRow>
          <SetupRow title={assetTitle} {...rowProps(3)}>
            {!side && (
              <>
                <p>Complete the first three steps to choose your side and prepare the assets you’ll send.</p>
                <ul className="setup-paths">
                  <li><strong>Sell bonds.</strong> Select <strong>Claim demo bonds</strong> and approve the CSB31 claim in QoreX.</li>
                  <li><strong>Buy bonds.</strong> Get bank fUSD from the Diana faucet, then select <strong>Convert to ERC-20</strong> to make it spendable.</li>
                </ul>
              </>
            )}
            {!tradeSetup && sharedReady && (
              <div className="asset-role" role="group" aria-label="Trading role">
                <button type="button" aria-pressed={side === "seller"} disabled={claiming || converting} onClick={() => setSide("seller")}>Sell bonds</button>
                <button type="button" aria-pressed={side === "buyer"} disabled={claiming || converting} onClick={() => setSide("buyer")}>Buy bonds</button>
              </div>
            )}
            {side === "seller" && (
              <ol className="setup-steps">
                <li>Select <strong>Claim demo bonds</strong> to request {DEPLOYMENT.faucetAmount.toString()} test CSB31 bonds.</li>
                <li>Review and approve the claim in QoreX on Diana.</li>
                <li>Wait for confirmation and check your <strong>CSB31 bonds</strong> balance below.</li>
              </ol>
            )}
            {side === "buyer" && (
              <ol className="setup-steps">
                <li>If you need test fUSD, request tokens from the <a className="text-link" href={FAUCET} target="_blank" rel="noreferrer">Diana faucet</a> using the same <code>qor1…</code> address. The faucet sends bank fUSD.</li>
                <li>Enter the amount you need and select <strong>Convert to ERC-20</strong>. This makes the fUSD spendable by the trade contract.</li>
                <li>Approve the conversion in QoreX and check that your <strong>Spendable fUSD</strong> balance covers the trade.</li>
              </ol>
            )}
            {side && !sharedReady && <p>Complete the wallet, fee, and signing-key steps to unlock asset preparation.</p>}
            {assetReady && <p>You have the assets required for this step.</p>}
            {!assetReady && sharedReady && (
              <AnimatePresence initial={false} mode="wait">
                {side && <motion.div className="asset-tools" key={side}
                  initial={reduceMotion ? false : { opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                  transition={{ duration: reduceMotion ? 0 : 0.15 }}>
                  {assetTools}
                </motion.div>}
              </AnimatePresence>
            )}
          </SetupRow>
        </ul>

        <div className="readiness-bottom">
          {bal.data && (
            <dl className="balance-strip">
              <div><dt>CSB31 bonds</dt><dd>{bal.data.bonds.toString()}</dd></div>
              <div><dt>Spendable fUSD</dt><dd>{fmtFusd(bal.data.fusd)}</dd></div>
              <div><dt>Test QOR</dt><dd>{fmtQor(bal.data.qor)}</dd></div>
            </dl>
          )}
          {active === -1 && !tradeSetup && (
            <>
              <a className="button primary" href={"#/new?side=" + side}>New trade <span aria-hidden="true">↗</span></a>
              <details className="disclosure"><summary>{side === "seller" ? "Claim more bonds" : "Convert more fUSD"}</summary><div className="setup-detail">{assetTools}</div></details>
            </>
          )}
          {assetReady && side === "seller" && claim.state.phase === "done" && <TxLink hash={claim.state.hash} label="View bond claim receipt" />}
          {!tradeSetup && <details className="disclosure">
            <summary>Network and contracts</summary>
            <dl className="network-details">
              <div><dt>Chain</dt><dd>Diana · {CHAIN_ID}</dd></div>
              <div><dt>Escrow</dt><dd><Addr a={DEPLOYMENT.countersign} /></dd></div>
              <div><dt>Bond</dt><dd><Addr a={DEPLOYMENT.bond} /></dd></div>
              <div><dt>Bond faucet</dt><dd><Addr a={DEPLOYMENT.faucet} /></dd></div>
              <div><dt>Compliance officer</dt><dd><Addr a={DEPLOYMENT.officer} /></dd></div>
              <div><dt>Price attestor</dt><dd><Addr a={DEPLOYMENT.attestor} /></dd></div>
            </dl>
          </details>}
        </div>
      </section>
  );

  if (tradeSetup) return setupPanel;

  return (
    <div className="overview-grid">
      <section className="overview-intro">
        <h1>Settle a bond trade on your terms.</h1>
        <p className="intro-description">Agree the deal, lock both sides, and exchange bonds for payment in one transaction.</p>
      </section>
      <ReadinessCoin />
      {setupPanel}
    </div>
  );
}
