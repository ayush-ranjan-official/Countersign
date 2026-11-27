import { useEffect, useState } from "react";
import { erc20Abi, type Hex } from "viem";
import { useAccount, usePublicClient } from "wagmi";
import { DEPLOYMENT, FUSD, csAbi } from "../lib/config";
import { signData } from "../lib/qorex";
import { STATUS, useBalances, useBlotter, useChainNow, useNav, useSettlement, useTrade } from "../lib/reads";
import { affirmData, approveData, encodeTerms, paramToSig, shareLink, sigToParam, tradeIdOf, type Terms } from "../lib/terms";
import { preflight, useTx, type Call } from "../lib/tx";
import { Addr, Card, Check, SignedString, TxLink, TxStatus, fmtFusd, same, useQorex } from "./ui";

export interface TradeRoute {
  terms?: Terms;
  id?: Hex;
  relayAffirm?: string;
  relayApprove?: string;
}

const cs = (functionName: string, args: readonly unknown[]): Call => ({ address: DEPLOYMENT.countersign, abi: csAbi, functionName, args });

export function TradeView(route: TradeRoute) {
  const pub = usePublicClient();
  const { address } = useAccount();
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

  // Live answer to "can this trade settle right now, and if not, why?" (simulated, nothing sent).
  useEffect(() => {
    if (!id || !pub || status !== 1) return setSettleBlock(null);
    preflight(pub, address, cs("settle", [id])).then(setSettleBlock);
  }, [id, pub, address, status, t?.assetLocked, t?.cashLocked, t?.officerApproved, nav.data?.timestamp, now.data]);

  if (!id) return <Card title="Trade">Unknown trade link.</Card>;
  if (!terms) return <Card title="Trade">{trade.isLoading || blotter.isLoading ? "Loading…" : "This trade is not on chain and the link carries no terms."}</Card>;

  async function signFor(kind: "affirm" | "approve") {
    if (!me || !terms || !id) return;
    setRelayOut(null);
    try {
      const sig = await signData(me.qor1, kind === "affirm" ? affirmData(id) : approveData(id));
      if (canSend) {
        await (kind === "affirm" ? tx.run("affirm", cs("affirm", [terms, me.evm, sig])) : tx.run("officer approval", cs("approveLarge", [id, sig])));
        trade.refetch();
      } else {
        setRelayOut(`${location.origin}${location.pathname}#/t/${encodeTerms(terms)}?${kind}=${kind === "affirm" ? (iAmSeller ? "s." : "b.") : ""}${sigToParam(sig)}`);
      }
    } catch (e) {
      tx.setState({ phase: "error", label: `sign ${kind}`, reason: e instanceof Error ? e.message : String(e) });
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

  return (
    <div className="stack">
      <Card title={`Trade ${id.slice(0, 10)}…`} aside={<span className={`badge s${status}`}>{status === 0 ? "Not opened" : STATUS[status]}</span>}>
        <table className="kv">
          <tbody>
            <tr><th>Seller</th><td><Addr a={terms.seller} />{iAmSeller && " (you)"}</td></tr>
            <tr><th>Buyer</th><td><Addr a={terms.buyer} />{iAmBuyer && " (you)"}</td></tr>
            <tr><th>Delivery</th><td>{terms.assetAmount.toString()} CSB31 bonds</td></tr>
            <tr><th>Payment</th><td>{fmtFusd(terms.cashAmount)} fUSD</td></tr>
            <tr><th>Deadline</th><td>{new Date(Number(terms.deadline) * 1000).toLocaleString()}{expired && open ? " (passed)" : ""}</td></tr>
            <tr><th>Trade id</th><td className="mono">{id}</td></tr>
            <tr><th>Ticket hash</th><td className="mono">{terms.ticketHash}</td></tr>
          </tbody>
        </table>
        {open && !expired && (
          <button className="ghost" onClick={() => navigator.clipboard.writeText(shareLink(terms))}>
            Copy share link
          </button>
        )}
      </Card>

      <div className="grid2">
        <Card title="Settlement checklist">
          <ul className="checks">
            <Check ok={!!t?.sellerAffirmed} title="Seller affirmed (ML-DSA-87, verified on chain)" />
            <Check ok={!!t?.buyerAffirmed} title="Buyer affirmed (ML-DSA-87, verified on chain)" />
            <Check ok={!!t?.assetLocked || status === 2} title="Bonds locked in escrow (exact pull)" />
            <Check ok={!!t?.cashLocked || status === 2} title="Cash locked in escrow (exact pull)" />
            {large && <Check ok={!!t?.officerApproved} title={`Compliance officer approved (≥ ${fmtFusd(DEPLOYMENT.largeTradeThreshold)} fUSD)`} />}
            {status === 2 ? (
              <Check ok title="Fresh reference price, trade within the band">checked by the contract at settlement</Check>
            ) : status !== 3 ? (
              <Check ok={navAge !== null && navAge <= DEPLOYMENT.maxNavAge && devBps !== null && devBps <= Number(DEPLOYMENT.maxDeviationBps)} title="Fresh reference price, trade within the band">
                {nav.isLoading
                  ? "reading the NAV…"
                  : nav.data?.price
                    ? `NAV ${fmtFusd(nav.data.price)} fUSD/bond, ${navAge}s old (max ${DEPLOYMENT.maxNavAge}s); trade is ${devBps !== null ? (devBps / 100).toFixed(2) : "?"} % away (max ${Number(DEPLOYMENT.maxDeviationBps) / 100} %)`
                    : "no NAV posted yet"}
              </Check>
            ) : null}
            <Check ok={status === 2} warn={status === 3} title={status === 3 ? "Reclaimed after the deadline" : "Settled: both legs in one transaction"}>
              {status === 1 && (settleBlock ? `not yet: ${settleBlock}` : "ready: anyone can settle now")}
              {status === 2 && settlement.data && (
                <>
                  receipt <TxLink hash={settlement.data.tx} />
                </>
              )}
            </Check>
          </ul>
        </Card>

        <Card title="Actions">
          <div className="actions">
            {open && !expired && (iAmSeller || iAmBuyer) && !(iAmSeller ? t?.sellerAffirmed : t?.buyerAffirmed) && (
              <div>
                <SignedString data={affirmData(id)} />
                <button className="primary" onClick={() => signFor("affirm")}>
                  Affirm as {iAmSeller ? "seller" : "buyer"} in QoreX
                </button>
              </div>
            )}
            {route.relayAffirm && open && !expired && (
              <button
                onClick={() => {
                  const [who, sig] = route.relayAffirm!.split(".") as [string, string];
                  const party = who === "s" ? terms.seller : terms.buyer;
                  tx.run(`submit the ${who === "s" ? "seller" : "buyer"}'s relayed affirmation`, cs("affirm", [terms, party, paramToSig(sig)])).then(() => trade.refetch());
                }}
              >
                Submit the {route.relayAffirm.startsWith("s.") ? "seller" : "buyer"}'s signed affirmation in this link
              </button>
            )}
            {status === 1 && !expired && t?.sellerAffirmed && t?.buyerAffirmed && iAmSeller && !t.assetLocked && (
              <button className="primary" disabled={!canSend} onClick={() => lock("asset")}>
                Approve exactly {terms.assetAmount.toString()} bonds and lock
              </button>
            )}
            {status === 1 && !expired && t?.sellerAffirmed && t?.buyerAffirmed && iAmBuyer && !t.cashLocked && (
              <button className="primary" disabled={!canSend} onClick={() => lock("cash")}>
                Approve exactly {fmtFusd(terms.cashAmount)} fUSD and lock
              </button>
            )}
            {status === 1 && !expired && large && iAmOfficer && !t?.officerApproved && (
              <div>
                <SignedString data={approveData(id)} />
                <button className="primary" onClick={() => signFor("approve")}>
                  Approve as compliance officer in QoreX
                </button>
              </div>
            )}
            {route.relayApprove && status === 1 && !t?.officerApproved && (
              <button onClick={() => tx.run("submit the officer's approval", cs("approveLarge", [id, paramToSig(route.relayApprove!)])).then(() => trade.refetch())}>
                Submit the officer approval in this link
              </button>
            )}
            {status === 1 && !expired && (
              <button className="primary" disabled={!!settleBlock || !address} onClick={() => tx.run("settle (DvP)", cs("settle", [id])).then(() => trade.refetch())}>
                Settle: bonds ↔ fUSD in one transaction
              </button>
            )}
            {status !== 2 && expired && (t?.assetLocked || t?.cashLocked) && (
              <button onClick={() => tx.run("reclaim", cs("reclaim", [id])).then(() => trade.refetch())}>Reclaim: return each leg to its owner</button>
            )}
            {status === 2 && <p className="ok">Settled. The buyer holds the bonds and the seller the fUSD.</p>}
            {status === 3 && <p className="muted">Closed after the deadline; locked legs went back to their depositors.</p>}
          </div>
          <TxStatus s={tx.state} />
          {relayOut && (
            <div className="signed">
              <div className="small">Signed. This account cannot send EVM transactions: send this link to anyone with a coin-60 account (e.g. the counterparty) to submit it.</div>
              <textarea readOnly value={relayOut} rows={3} />
              <button onClick={() => navigator.clipboard.writeText(relayOut)}>Copy</button>
            </div>
          )}
          {(iAmSeller || iAmBuyer) && !canSend && me && <p className="muted small">Locking and settling need an Ethereum-style (coin 60) QoreX account.</p>}
        </Card>
      </div>
    </div>
  );
}
