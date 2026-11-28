import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseUnits, type Address, type Hex } from "viem";
import { toEvmAddress } from "@qorechain/evm";
import { useAccount, usePublicClient } from "wagmi";
import { DEPLOYMENT, FUSD, csAbi } from "../lib/config";
import { signData } from "../lib/qorex";
import { useChainNow, useKeyStatus, useNav } from "../lib/reads";
import { affirmData, encodeTerms, makeTicket, randomSalt, shareLink, sigToParam, tradeIdOf, type Terms } from "../lib/terms";
import { useTx } from "../lib/tx";
import { Card, CopyButton, SignedString, TxStatus, fmtFusd, same, useQorex } from "./ui";

const MIN_HOURS = 1;
const MAX_HOURS = 72;

function parseCounterparty(s: string): Address | null {
  const v = s.trim();
  try {
    if (/^0x[0-9a-fA-F]{40}$/.test(v)) return v as Address;
    if (v.startsWith("qor1")) return toEvmAddress(v) as Address;
  } catch {
    /* invalid bech32 */
  }
  return null;
}

export function NewTrade({ initialSide }: { initialSide: "buyer" | "seller" }) {
  const { address } = useAccount();
  const pub = usePublicClient();
  const qx = useQorex();
  const me = qx.data;
  const now = useChainNow();
  const nav = useNav();
  const tx = useTx();
  const [role, setRole] = useState<"seller" | "buyer">(initialSide);
  const [reviewing, setReviewing] = useState(false);
  const reviewPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reviewing) reviewPanel.current?.focus();
  }, [reviewing]);
  const [cp, setCp] = useState("");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("10");
  const [hours, setHours] = useState(24);
  const [salt] = useState(randomSalt);
  const [signing, setSigning] = useState(false);
  const [relay, setRelay] = useState<string | null>(null);
  const cpAddr = useMemo(() => parseCounterparty(cp), [cp]);
  const cpKey = useKeyStatus(cpAddr ?? undefined);

  const amounts = useMemo(() => {
    try {
      const assetAmount = BigInt(qty);
      const cashAmount = parseUnits(price, 6) * assetAmount;
      if (assetAmount > 0n && cashAmount > 0n) return { assetAmount, cashAmount };
    } catch {
      // A partially entered amount cannot be quoted or signed.
    }
    return null;
  }, [qty, price]);

  const terms = useMemo((): Terms | null => {
    if (!amounts || !me || !cpAddr || now.data === undefined || same(cpAddr, me.evm)) return null;
    const base = {
      seller: role === "seller" ? me.evm : cpAddr,
      buyer: role === "buyer" ? me.evm : cpAddr,
      asset: DEPLOYMENT.bond,
      cash: FUSD,
      ...amounts,
      deadline: now.data + BigInt(hours * 3600),
      salt,
    };
    return { ...base, ticketHash: makeTicket(base).hash };
    // deadline follows the chain clock; recompute only when inputs change, not on every block
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, cpAddr, amounts, hours, role, salt, now.data === undefined]);

  const id = terms ? tradeIdOf(terms) : null;
  const contractId = useQuery({
    queryKey: ["proposalTradeId", id, pub?.chain.id],
    enabled: Boolean(terms && pub),
    queryFn: async () => (await pub!.readContract({
      address: DEPLOYMENT.countersign, abi: csAbi, functionName: "tradeIdOf", args: [terms!],
    })) as Hex,
  });

  const large = terms ? terms.cashAmount >= DEPLOYMENT.largeTradeThreshold : false;
  const fair = terms && nav.data?.price ? nav.data.price * terms.assetAmount : null;
  const devBps = terms && fair ? Number(((terms.cashAmount > fair ? terms.cashAmount - fair : fair - terms.cashAmount) * 10_000n) / fair) : null;
  const idsMatch = !!id && !!contractId.data && id === contractId.data;
  const canSend = !!me?.coin60 && same(address, me.evm);

  async function signAndOpen() {
    if (!terms || !id || !me || !idsMatch || signing) return;
    setRelay(null);
    setSigning(true);
    try {
      const sig = await signData(me.qor1, affirmData(id));
      if (canSend) {
        const hash = await tx.run("affirm and open the trade", { address: DEPLOYMENT.countersign, abi: csAbi, functionName: "affirm", args: [terms, me.evm, sig] });
        if (hash) location.hash = `#/trade/${id}`;
      } else {
        // a coin-118 account cannot send: anyone (e.g. the counterparty) can submit the signed affirmation
        setRelay(`${location.origin}${location.pathname}#/t/${encodeTerms(terms)}?affirm=${role === "seller" ? "s" : "b"}.${sigToParam(sig)}`);
      }
    } catch (e) {
      tx.setState({ phase: "error", label: "Sign in QoreX", reason: e instanceof Error ? e.message : String(e) });
    } finally {
      setSigning(false);
    }
  }

  const bonds = amounts?.assetAmount.toLocaleString() ?? "—";
  const cash = amounts ? fmtFusd(amounts.cashAmount) : "—";
  const exchangeSummary = (
    <p className="trade-exchange-summary">
      <span>{role === "buyer" ? `Pay ${cash} fUSD` : `Deliver ${bonds} CSB31`}</span>
      {" · "}
      <span>{role === "buyer" ? `Receive ${bonds} CSB31` : `Receive ${cash} fUSD`}</span>
    </p>
  );
  const sameWallet = Boolean(cpAddr && same(cpAddr, me?.evm));
  const deadlineProgress = ((hours - MIN_HOURS) / (MAX_HOURS - MIN_HOURS)) * 100;

  return (
    <div className="workspace new-trade-workspace">
      <Card title={reviewing ? "Review before signing" : "Trade terms"}>
        {!reviewing ? (
          <form className="form" onSubmit={(event) => {
            event.preventDefault();
            if (terms && idsMatch) setReviewing(true);
          }}>
            <div className="asset-role trade-side" role="group" aria-label="Trading role">
              <button type="button" aria-pressed={role === "buyer"} onClick={() => setRole("buyer")}>Buy bonds</button>
              <button type="button" aria-pressed={role === "seller"} onClick={() => setRole("seller")}>Sell bonds</button>
            </div>
            <div className="trade-quote">
              <div className="trade-amounts">
                <label className="trade-amount">
                  Bond quantity
                  <span className="trade-amount-entry">
                    <input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="numeric" />
                    <span>CSB31</span>
                  </span>
                </label>
                <label className="trade-amount">
                  Price per bond
                  <span className="trade-amount-entry">
                    <input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" aria-describedby="trade-reference-price" />
                    <span>fUSD</span>
                  </span>
                </label>
              </div>
              {exchangeSummary}
              <p className="small muted" id="trade-reference-price">
                Reference price {nav.data?.price ? `${fmtFusd(nav.data.price)} fUSD per bond` : nav.isLoading ? "loading…" : "unavailable"}
              </p>
            </div>
            <label>Counterparty address
              <input value={cp} onChange={(event) => setCp(event.target.value)} placeholder="qor1… or 0x…" spellCheck={false}
                aria-invalid={Boolean(cp && (!cpAddr || sameWallet))} aria-describedby="counterparty-help" />
            </label>
            <p className="small muted" id="counterparty-help">
              {sameWallet ? "Enter the other party’s wallet address." : cp && !cpAddr ? "Enter a valid QoreChain or Ethereum-style address." :
                cpKey.data ? cpKey.data.registered && cpKey.data.possessionProven ? "Counterparty’s signing key is verified." :
                  "The counterparty needs to register their signing key before they can approve." :
                  "Use the public address of the other party."}
            </p>
            <details className="disclosure trade-deadline">
              <summary>Advanced terms <span className="muted deadline-preview">· {hours} h deadline</span></summary>
              <label className="deadline-label" htmlFor="trade-deadline">Settlement deadline</label>
              <span className="deadline-value" aria-hidden="true">{hours} h</span>
              <input className="deadline-slider" type="range" id="trade-deadline"
                min={MIN_HOURS} max={MAX_HOURS} step={1} value={hours} aria-valuetext={`${hours} ${hours === 1 ? "hour" : "hours"}`}
                style={{ "--deadline-progress": `${deadlineProgress}%` } as CSSProperties}
                onChange={(event) => setHours(event.target.valueAsNumber)} />
              <div className="deadline-limits" aria-hidden="true"><span>{MIN_HOURS} h</span><span>{MAX_HOURS} h</span></div>
            </details>
            {!me && <p className="notice">Connect QoreX in the header to review and open this trade.</p>}
            {contractId.isError && <p className="notice" role="alert">Could not verify the terms on-chain. <button className="link" type="button" onClick={() => contractId.refetch()}>Try again</button></p>}
            <button className="primary w-fit" type="submit" disabled={!terms || !idsMatch}>
              {terms && contractId.isFetching ? "Verifying trade…" : "Review trade"}
            </button>
          </form>
        ) : terms && id ? (
          <div className="stack" tabIndex={-1} ref={reviewPanel}>
            {exchangeSummary}
            <dl className="network-details">
              <div><dt>Seller</dt><dd className="mono">{terms.seller}{role === "seller" && " (you)"}</dd></div>
              <div><dt>Buyer</dt><dd className="mono">{terms.buyer}{role === "buyer" && " (you)"}</dd></div>
              <div><dt>Settle by</dt><dd>{new Date(Number(terms.deadline) * 1000).toLocaleString()}</dd></div>
            </dl>
            {large && <p className="notice">A compliance officer’s approval is required to settle this trade.</p>}
            {devBps !== null && devBps > Number(DEPLOYMENT.maxDeviationBps) && <p className="notice">The price is outside the permitted range for settlement.</p>}
            {!canSend && <p className="notice">QoreX will return a link so the counterparty can submit your signed approval.</p>}
            <div className="action-row">
              <button className="primary" disabled={!idsMatch || signing} onClick={signAndOpen}>{signing ? "Waiting for QoreX…" : "Sign and open"}</button>
              <button className="ghost" disabled={signing} onClick={() => setReviewing(false)}>Edit terms</button>
            </div>
            <TxStatus s={tx.state} />
            {relay && <div className="notice"><p>Your approval is signed. Share the link so the other party can submit it.</p><CopyButton text={relay} label="Copy signed link" /></div>}
            <details className="disclosure">
              <summary>Technical details</summary>
              <p className="mono mt-3">{id}</p>
              <SignedString data={affirmData(id)} />
              <CopyButton text={shareLink(terms)} label="Copy draft link" />
            </details>
          </div>
        ) : (
          <p className="muted">Your wallet or terms changed. <button className="link" onClick={() => setReviewing(false)}>Edit terms</button></p>
        )}
      </Card>
    </div>
  );
}
