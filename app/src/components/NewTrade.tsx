import { useEffect, useMemo, useRef, useState } from "react";
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
  const [hours, setHours] = useState("24");
  const [salt] = useState(randomSalt);
  const [signing, setSigning] = useState(false);
  const [relay, setRelay] = useState<string | null>(null);
  const cpAddr = useMemo(() => parseCounterparty(cp), [cp]);
  const cpKey = useKeyStatus(cpAddr ?? undefined);

  const terms = useMemo((): Terms | null => {
    if (!me || !cpAddr || now.data === undefined || same(cpAddr, me.evm)) return null;
    let assetAmount: bigint, cashAmount: bigint, deadline: bigint;
    try {
      assetAmount = BigInt(qty);
      cashAmount = parseUnits(price, 6) * assetAmount;
      deadline = now.data + BigInt(Math.round(Number(hours) * 3600));
    } catch {
      return null;
    }
    if (assetAmount <= 0n || cashAmount <= 0n || deadline <= now.data) return null;
    const base = {
      seller: role === "seller" ? me.evm : cpAddr,
      buyer: role === "buyer" ? me.evm : cpAddr,
      asset: DEPLOYMENT.bond,
      assetAmount,
      cash: FUSD,
      cashAmount,
      deadline,
      salt,
    };
    return { ...base, ticketHash: makeTicket(base).hash };
    // deadline follows the chain clock; recompute only when inputs change, not on every block
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, cpAddr, qty, price, hours, role, salt, now.data === undefined]);

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

  let estimate: bigint | null = null;
  try {
    const amount = parseUnits(price, 6) * BigInt(qty);
    if (amount > 0n) estimate = amount;
  } catch {
    // The estimate remains blank until both fields contain numbers.
  }
  const sameWallet = Boolean(cpAddr && same(cpAddr, me?.evm));

  return (
    <div className="workspace">
      <header className="page-heading">
        <p className="overline">Trade proposal</p>
        <h1>New trade</h1>
        <p>Set the terms for a buyer and seller to approve.</p>
      </header>
      <div className="work-grid">
        <Card title={reviewing ? "Review before signing" : "Trade terms"}>
          {!reviewing ? (
            <form className="form" onSubmit={(event) => {
              event.preventDefault();
              if (terms && idsMatch) setReviewing(true);
            }}>
              <label>Buy or sell
                <select value={role} onChange={(event) => setRole(event.target.value === "buyer" ? "buyer" : "seller")}>
                  <option value="seller">Sell bonds</option>
                  <option value="buyer">Buy bonds</option>
                </select>
              </label>
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
              <div className="field-pair">
                <label>Bond quantity<input value={qty} onChange={(event) => setQty(event.target.value)} inputMode="numeric" /></label>
                <label>Price per bond (fUSD)<input value={price} onChange={(event) => setPrice(event.target.value)} inputMode="decimal" /></label>
              </div>
              <details className="disclosure">
                <summary>Advanced terms <span className="muted">· {hours || "—"} h deadline</span></summary>
                <label className="mt-3">Deadline (hours)<input value={hours} onChange={(event) => setHours(event.target.value)} inputMode="decimal" /></label>
              </details>
              {!me && <p className="notice">Connect QoreX in the header to review and open this trade.</p>}
              {contractId.isError && <p className="notice" role="alert">Could not verify the terms on-chain. <button className="link" type="button" onClick={() => contractId.refetch()}>Try again</button></p>}
              <button className="primary w-fit" type="submit" disabled={!terms || !idsMatch}>
                {terms && contractId.isFetching ? "Verifying trade…" : "Review trade"}
              </button>
            </form>
          ) : terms && id ? (
            <div className="stack" tabIndex={-1} ref={reviewPanel}>
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
        <aside className="panel exchange-panel" aria-label="Exchange summary">
          <h2>Exchange summary</h2>
          <div className="exchange-pair">
            <div><span>{role === "seller" ? "You deliver" : "You receive"}</span><strong>{qty || "—"}</strong><small>CSB31 bonds</small></div>
            <span className="exchange-arrow" aria-hidden="true">⇄</span>
            <div><span>{role === "seller" ? "You receive" : "You pay"}</span><strong>{estimate === null ? "—" : fmtFusd(estimate)}</strong><small>fUSD</small></div>
          </div>
          <div className="exchange-note">
            <span>Reference price</span><strong>{nav.data?.price ? fmtFusd(nav.data.price) + " fUSD / bond" : nav.isLoading ? "Checking…" : "Unavailable"}</strong>
          </div>
        </aside>
      </div>
    </div>
  );
}
