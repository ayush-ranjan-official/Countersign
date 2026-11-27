import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { erc20Abi, type Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { CHAIN_ID, DEPLOYMENT, FUSD, csAbi } from "../lib/config";
import { signData } from "../lib/qorex";
import { STATUS, useBalances, useBlotter, useChainNow, useKeyStatus, useNav, useSettlement, useTrade } from "../lib/reads";
import { affirmData, approveData, encodeTerms, paramToSig, shareLink, sigToParam, tradeIdOf, type Terms } from "../lib/terms";
import { preflight, useTx, type Call } from "../lib/tx";
import { MIN_QOR, Readiness } from "./Readiness";
import { Addr, Card, CopyButton, SignedString, TxLink, TxStatus, fmtFusd, same, short, useQorex } from "./ui";

export interface TradeRoute {
  terms?: Terms;
  id?: Hex;
  relayAffirm?: string;
  relayApprove?: string;
}

const cs = (functionName: string, args: readonly unknown[]): Call => ({ address: DEPLOYMENT.countersign, abi: csAbi, functionName, args });

export function TradeView(route: TradeRoute) {
  const reduceMotion = useReducedMotion();
  const pub = usePublicClient();
  const { address, chainId } = useAccount();
  const qx = useQorex();
  const me = qx.data;
  const blotter = useBlotter();
  const id = route.id ?? (route.terms ? tradeIdOf(route.terms) : undefined);
  const trade = useTrade(id);
  const opened = blotter.data?.find((t) => t.id === id);
  const terms: Terms | undefined = trade.data && trade.data.status !== 0 ? trade.data.terms : route.terms ?? opened?.terms;
  const now = useChainNow();
  const nav = useNav();
  const bal = useBalances(address);
  const tx = useTx();
  const settlement = useSettlement(id, opened?.block, trade.data?.status === 2);
  const [settleBlock, setSettleBlock] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);
  const [relayOut, setRelayOut] = useState<string | null>(null);

  const t = trade.data;
  const status = t?.status ?? 0;
  const open = status === 0 || status === 1;
  const expired = !!terms && now.data !== undefined && now.data > terms.deadline;
  const large = !!terms && terms.cashAmount >= DEPLOYMENT.largeTradeThreshold;
  const iAmSeller = !!terms && same(me?.evm, terms.seller);
  const iAmBuyer = !!terms && same(me?.evm, terms.buyer);
  const iAmOfficer = same(me?.evm, DEPLOYMENT.officer);
  const canSend = !!me?.coin60 && same(address, me.evm);
  const participantSide = iAmSeller ? "seller" : iAmBuyer ? "buyer" : undefined;
  const walletKey = useKeyStatus(participantSide ? me?.evm : undefined);

  // Live answer to "can this trade settle right now, and if not, why?" (simulated, nothing sent).
  useEffect(() => {
    if (!id || !pub || status !== 1) return setSettleBlock(null);
    let current = true;
    preflight(pub, address, cs("settle", [id])).then((reason) => { if (current) setSettleBlock(reason); });
    return () => { current = false; };
  }, [id, pub, address, status, t?.assetLocked, t?.cashLocked, t?.officerApproved, nav.data?.timestamp, now.data]);

  if (!id) return <Card title="Trade">Unknown trade link.</Card>;
  if (!terms) return <Card title="Trade">{trade.isLoading || blotter.isLoading ? "Loading…" : "This trade is not on chain and the link carries no terms."}</Card>;

  async function signFor(kind: "affirm" | "approve") {
    if (!me || !terms || !id || signing) return;
    setRelayOut(null);
    setSigning(true);
    try {
      const sig = await signData(me.qor1, kind === "affirm" ? affirmData(id) : approveData(id));
      if (canSend) {
        await (kind === "affirm" ? tx.run("affirm", cs("affirm", [terms, me.evm, sig])) : tx.run("officer approval", cs("approveLarge", [id, sig])));
        trade.refetch();
      } else {
        setRelayOut(`${location.origin}${location.pathname}#/t/${encodeTerms(terms)}?${kind}=${kind === "affirm" ? (iAmSeller ? "s." : "b.") : ""}${sigToParam(sig)}`);
      }
    } catch (e) {
      tx.setState({ phase: "error", label: `Sign ${kind}`, reason: e instanceof Error ? e.message : String(e) });
    } finally {
      setSigning(false);
    }
  }

  async function lock(leg: "asset" | "cash") {
    if (!terms || !id) return;
    const token = leg === "asset" ? terms.asset : FUSD;
    const amount = leg === "asset" ? terms.assetAmount : terms.cashAmount;
    const allowance = leg === "asset" ? bal.data?.bondAllowance : bal.data?.fusdAllowance;
    if ((allowance ?? 0n) !== amount) {
      const ok = await tx.run(`approve exactly ${leg === "asset" ? `${amount} bonds` : `${fmtFusd(amount)} fUSD`}`, { address: token, abi: erc20Abi, functionName: "approve", args: [DEPLOYMENT.countersign, amount] });
      if (!ok) return;
    }
    await tx.run(leg === "asset" ? "lock the bonds" : "lock the cash", cs(leg === "asset" ? "lockAsset" : "lockCash", [id]));
    trade.refetch();
    bal.refetch();
  }

  const navAge = nav.data && now.data !== undefined && nav.data.timestamp > 0n ? now.data - nav.data.timestamp : null;
  const fair = nav.data?.price ? nav.data.price * terms.assetAmount : null;
  const devBps = fair ? Number(((terms.cashAmount > fair ? terms.cashAmount - fair : fair - terms.cashAmount) * 10_000n) / fair) : null;

  const bothAffirmed = Boolean(t?.sellerAffirmed && t?.buyerAffirmed);
  const bothLocked = Boolean(t?.assetLocked && t?.cashLocked);
  const navReady = navAge !== null && navAge <= DEPLOYMENT.maxNavAge && devBps !== null && devBps <= Number(DEPLOYMENT.maxDeviationBps);
  const busy = signing || ["simulating", "signing", "mining"].includes(tx.state.phase);
  const busyLabel = tx.state.phase === "simulating" ? "Checking transaction…" :
    tx.state.phase === "mining" ? "Waiting for confirmation…" : "Approve in QoreX";
  const send = async (label: string, name: string, args: readonly unknown[]) => {
    await tx.run(label, cs(name, args));
    await trade.refetch();
  };
  const requiredDeposit = iAmSeller ? terms.assetAmount : terms.cashAmount;
  const deposited = iAmSeller ? t?.assetLocked : t?.cashLocked;
  const balance = iAmSeller ? bal.data?.bonds : bal.data?.fusd;
  const key = walletKey.data;
  const needsSetup = participantSide && canSend && open && !expired && !deposited && !busy
    && !route.relayAffirm && !route.relayApprove && (chainId !== CHAIN_ID
      || (key && (!key.registered || !key.possessionProven || key.algorithmId !== 1 || key.keyLength !== 2592))
      || (bal.data && bal.data.qor <= MIN_QOR)
      || (balance !== undefined && balance < requiredDeposit));

  const relayAffirm = route.relayAffirm;
  const relayApprove = route.relayApprove;
  let next: { label: string; detail: string; run?: () => void; signature?: string } = {
    label: "Waiting for both parties",
    detail: "Each party must approve the same terms before depositing assets.",
  };

  if (status === 2) {
    next = { label: "Settlement complete", detail: "The bonds and payment moved in one transaction." };
  } else if (status === 3) {
    next = { label: "Assets returned", detail: "The trade closed after its deadline." };
  } else if (expired) {
    next = t?.assetLocked || t?.cashLocked
      ? { label: "Reclaim escrow", detail: "The deadline passed. Return any deposits to their original owners.", run: () => send("Reclaim escrow", "reclaim", [id]) }
      : { label: "Trade expired", detail: "There are no deposits to return." };
  } else if (relayAffirm && open && !(relayAffirm.startsWith("s.") ? t?.sellerAffirmed : t?.buyerAffirmed)) {
    next = { label: "Submit signed approval", detail: "The linked approval can be submitted using a connected wallet.", run: () => {
      const [who, signature] = relayAffirm.split(".") as [string, string];
      if (!signature) {
        tx.setState({ phase: "error", label: "Submit signed approval", reason: "The link is missing its signature." });
        return;
      }
      try {
        void send("Submit signed approval", "affirm", [terms, who === "s" ? terms.seller : terms.buyer, paramToSig(signature)]);
      } catch {
        tx.setState({ phase: "error", label: "Submit signed approval", reason: "The link’s signature could not be read." });
      }
    } };
  } else if (relayApprove && status === 1 && !t?.officerApproved) {
    next = { label: "Submit officer approval", detail: "Submit the signed approval attached to this link.", run: () => {
      try {
        void send("Submit officer approval", "approveLarge", [id, paramToSig(relayApprove)]);
      } catch {
        tx.setState({ phase: "error", label: "Submit officer approval", reason: "The link’s signature could not be read." });
      }
    } };
  } else if ((iAmSeller || iAmBuyer) && !(iAmSeller ? t?.sellerAffirmed : t?.buyerAffirmed)) {
    next = { label: "Approve terms", detail: "Review the exchange above and sign the terms in QoreX.", run: () => signFor("affirm"), signature: affirmData(id) };
  } else if (iAmOfficer && large && status === 1 && !t?.officerApproved) {
    next = { label: "Approve as compliance officer", detail: "This trade requires a separate compliance approval.", run: () => signFor("approve"), signature: approveData(id) };
  } else if (bothAffirmed && ((iAmSeller && !t?.assetLocked) || (iAmBuyer && !t?.cashLocked))) {
    const lockLabel = iAmSeller ? terms.assetAmount + " bonds" : fmtFusd(terms.cashAmount) + " fUSD";
    next = {
      label: "Lock " + lockLabel,
      detail: canSend ? "QoreX may ask you to approve the exact amount and then confirm the escrow deposit." : "Select an Ethereum account (coin 60) to deposit assets.",
      run: canSend ? () => lock(iAmSeller ? "asset" : "cash") : undefined,
    };
  } else if (bothAffirmed && !bothLocked) {
    next = !t?.assetLocked
      ? { label: "Waiting for seller", detail: "The seller needs to deposit the bonds." }
      : { label: "Waiting for buyer", detail: "The buyer needs to deposit the fUSD." };
  } else if (bothLocked && large && !t?.officerApproved) {
    next = { label: "Waiting for officer approval", detail: "This trade exceeds the threshold for a separate compliance approval." };
  } else if (bothLocked && (!navReady || settleBlock)) {
    next = { label: "Settlement is paused", detail: !navReady ? "Settlement needs a fresh reference price within the permitted range." : "Open Technical details to see the result of the settlement check." };
  } else if (bothLocked && status === 1) {
    next = { label: "Settle trade", detail: "Release the bonds and payment together in one transaction.", run: () => send("Settle trade", "settle", [id]) };
  }

  return (
    <div className="workspace">
      <header className="page-heading">
        <p className="overline">Settlement</p>
        <h1>Trade details</h1>
        <p>{iAmSeller ? "You are the seller." : iAmBuyer ? "You are the buyer." : "Review the terms and settlement status."}</p>
      </header>
      <div className="work-grid">
        <div className="stack">
          <section className="panel exchange-panel" aria-labelledby="trade-exchange">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="trade-exchange">Exchange summary</h2>
              <span className={"badge s" + status}>{status === 0 ? "Not opened" : expired && open ? "Expired" : STATUS[status]}</span>
            </div>
            <div className="exchange-pair">
              <div><span>{iAmSeller ? "You deliver" : iAmBuyer ? "You receive" : "Seller delivers"}</span><strong>{terms.assetAmount.toString()}</strong><small>CSB31 bonds</small></div>
              <span className="exchange-arrow" aria-hidden="true">⇄</span>
              <div><span>{iAmSeller ? "You receive" : iAmBuyer ? "You pay" : "Buyer pays"}</span><strong>{fmtFusd(terms.cashAmount)}</strong><small>fUSD</small></div>
            </div>
            <dl className="network-details mt-6 border-t border-line pt-4">
              <div><dt>Seller</dt><dd><Addr a={terms.seller} />{iAmSeller && " · You"}</dd></div>
              <div><dt>Buyer</dt><dd><Addr a={terms.buyer} />{iAmBuyer && " · You"}</dd></div>
              <div><dt>Settle by</dt><dd>{new Date(Number(terms.deadline) * 1000).toLocaleString()}</dd></div>
            </dl>
            {open && !expired && <div className="mt-4"><CopyButton text={shareLink(terms)} label="Copy trade link" /></div>}
          </section>
          <Card title="Settlement progress">
            <ol className="settlement-stages">
              <li><h3>Terms approved</h3><p>Seller {t?.sellerAffirmed ? "approved" : "pending"} · Buyer {t?.buyerAffirmed ? "approved" : "pending"}</p></li>
              <li><h3>Assets locked</h3><p>Bonds {t?.assetLocked || status === 2 ? "locked" : "pending"} · fUSD {t?.cashLocked || status === 2 ? "locked" : "pending"}</p></li>
              <li><h3>{status === 2 ? "Settled" : status === 3 ? "Reclaimed" : "Settlement"}</h3>
                <p>{status === 2 ? "Both transfers confirmed" : status === 3 ? "The trade is closed" : "Both assets move together once confirmed"}</p></li>
            </ol>
          </Card>
        </div>
        <Card title={status === 2 ? "Settlement receipt" : "Next action"}>
          {status === 2 ? (
            <motion.div className="receipt-panel" initial={reduceMotion ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.23, 1, 0.32, 1] }}>
              <h3>Settled in one transaction</h3>
              <p>{terms.assetAmount.toString()} CSB31 delivered to the buyer</p>
              <p>{fmtFusd(terms.cashAmount)} fUSD paid to the seller</p>
              {settlement.data && <div className="mt-3"><TxLink hash={settlement.data.tx} label="View settlement receipt" /></div>}
            </motion.div>
          ) : needsSetup && participantSide ? (
            <Readiness tradeSetup={{ side: participantSide, amount: requiredDeposit }} />
          ) : (
            <div className="stack">
              <div>
                {!next.run && <h3 className="text-base font-extrabold">{next.label}</h3>}
                <p className="muted">{next.detail}</p>
              </div>
              {next.run && <button className="primary w-fit" disabled={busy || (!address && !next.signature)} onClick={next.run}>
                {busy ? busyLabel : next.label}
              </button>}
              {!address && open && !expired && <p className="notice">Connect the intended QoreX wallet in the header to act on this trade.</p>}
            </div>
          )}
          <TxStatus s={tx.state} />
          {relayOut && <div className="notice mt-4"><p>Share this signed link with someone using a coin-60 account so they can submit the approval.</p>
            <textarea readOnly aria-label="Signed trade link" value={relayOut} rows={3} /><CopyButton text={relayOut} label="Copy signed link" />
          </div>}
          <details className="disclosure mt-5">
            <summary>Technical details</summary>
            <dl className="network-details mt-3">
              <div><dt>Trade ID</dt><dd className="mono">{short(id)}</dd></div>
              <div><dt>Ticket hash</dt><dd className="mono">{short(terms.ticketHash)}</dd></div>
              <div><dt>Compliance approval</dt><dd>{large ? t?.officerApproved ? "Approved" : "Required" : "Not required"}</dd></div>
              <div><dt>Reference price</dt><dd>{nav.data?.price ? fmtFusd(nav.data.price) + " fUSD / bond" : "Unavailable"}</dd></div>
              {status === 1 && settleBlock && <div><dt>Settlement check</dt><dd>{settleBlock}</dd></div>}
            </dl>
            {next.signature && <SignedString data={next.signature} />}
            <CopyButton text={id} label="Copy trade ID" />
          </details>
        </Card>
      </div>
    </div>
  );
}
