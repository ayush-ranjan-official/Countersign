import { useEffect, useMemo, useState } from "react";
import { parseUnits, type Address, type Hex } from "viem";
import { toEvmAddress } from "@qorechain/evm";
import { useAccount, usePublicClient } from "wagmi";
import { DEPLOYMENT, FUSD, csAbi } from "../lib/config";
import { signData } from "../lib/qorex";
import { useChainNow, useKeyStatus, useNav } from "../lib/reads";
import { affirmData, encodeTerms, makeTicket, randomSalt, shareLink, sigToParam, tradeIdOf, type Terms } from "../lib/terms";
import { useTx } from "../lib/tx";
import { Card, SignedString, TxStatus, fmtFusd, same, short, useQorex } from "./ui";

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

export function NewTrade() {
  const { address } = useAccount();
  const pub = usePublicClient();
  const qx = useQorex();
  const me = qx.data;
  const now = useChainNow();
  const nav = useNav();
  const tx = useTx();
  const [role, setRole] = useState<"seller" | "buyer">("seller");
  const [cp, setCp] = useState("");
  const [qty, setQty] = useState("10");
  const [price, setPrice] = useState("10");
  const [hours, setHours] = useState("24");
  const [salt] = useState(randomSalt);
  const [contractId, setContractId] = useState<Hex | null>(null);
  const [relay, setRelay] = useState<string | null>(null);
  const cpAddr = parseCounterparty(cp);
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
    if (assetAmount <= 0n || cashAmount <= 0n) return null;
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
  useEffect(() => {
    setContractId(null);
    if (!terms || !pub) return;
    pub.readContract({ address: DEPLOYMENT.countersign, abi: csAbi, functionName: "tradeIdOf", args: [terms] }).then((v) => setContractId(v as Hex));
  }, [terms, pub]);

  const large = terms ? terms.cashAmount >= DEPLOYMENT.largeTradeThreshold : false;
  const fair = terms && nav.data?.price ? nav.data.price * terms.assetAmount : null;
  const devBps = terms && fair ? Number(((terms.cashAmount > fair ? terms.cashAmount - fair : fair - terms.cashAmount) * 10_000n) / fair) : null;
  const idsMatch = !!id && !!contractId && id === contractId;
  const canSend = !!me?.coin60 && same(address, me.evm);

  async function signAndOpen() {
    if (!terms || !id || !me || !idsMatch) return;
    setRelay(null);
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
      tx.setState({ phase: "error", label: "sign in QoreX", reason: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div className="stack">
      <Card title="New trade">
        <div className="form">
          <label>
            I am
            <select value={role} onChange={(e) => setRole(e.target.value as "seller" | "buyer")}>
              <option value="seller">selling bonds (I deliver CSB31, I receive fUSD)</option>
              <option value="buyer">buying bonds (I pay fUSD, I receive CSB31)</option>
            </select>
          </label>
          <label>
            Counterparty (qor1… or 0x…)
            <input value={cp} onChange={(e) => setCp(e.target.value)} placeholder="qor1…" spellCheck={false} />
            {cp && !cpAddr && <span className="bad small">not a valid address</span>}
            {cpAddr && cpKey.data && (
              <span className={`small ${cpKey.data.registered && cpKey.data.possessionProven ? "ok" : "bad"}`}>
                {cpKey.data.registered && cpKey.data.possessionProven ? "✓ has a proven ML-DSA-87 key" : "✗ no proven ML-DSA-87 key yet: they cannot affirm until they make one QoreX transaction"}
              </span>
            )}
          </label>
          <div className="row">
            <label>
              Bonds
              <input value={qty} onChange={(e) => setQty(e.target.value)} inputMode="numeric" />
            </label>
            <label>
              Price per bond (fUSD)
              <input value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" />
            </label>
            <label>
              Deadline (hours)
              <input value={hours} onChange={(e) => setHours(e.target.value)} inputMode="decimal" />
            </label>
          </div>
        </div>
      </Card>

      {terms && id && (
        <Card title="Review before you sign">
          <table className="kv">
            <tbody>
              <tr><th>Seller</th><td className="mono">{terms.seller}{same(terms.seller, me?.evm) && " (you)"}</td></tr>
              <tr><th>Buyer</th><td className="mono">{terms.buyer}{same(terms.buyer, me?.evm) && " (you)"}</td></tr>
              <tr><th>Delivers</th><td>{terms.assetAmount.toString()} CSB31 bonds</td></tr>
              <tr><th>Pays</th><td>{fmtFusd(terms.cashAmount)} fUSD ({price} per bond)</td></tr>
              <tr><th>Deadline</th><td>{new Date(Number(terms.deadline) * 1000).toLocaleString()} (settle by then, or each side reclaims)</td></tr>
              <tr><th>Four-eyes</th><td>{large ? `yes: ≥ ${fmtFusd(DEPLOYMENT.largeTradeThreshold)} fUSD needs the compliance officer's ML-DSA approval` : "no (below the threshold)"}</td></tr>
              <tr><th>Reference price</th><td>{nav.data?.price ? `${fmtFusd(nav.data.price)} fUSD per bond; this trade is ${devBps !== null ? (devBps / 100).toFixed(2) : "?"} % away (band ${Number(DEPLOYMENT.maxDeviationBps) / 100} %)` : "no NAV posted yet"}</td></tr>
              <tr><th>Trade id</th><td className="mono">{id} {idsMatch ? <span className="ok">✓ matches the contract</span> : <span className="muted">checking…</span>}</td></tr>
            </tbody>
          </table>
          {devBps !== null && devBps > Number(DEPLOYMENT.maxDeviationBps) && <p className="status warn">This price is outside the NAV band: settle will refuse it (PriceOutOfBand).</p>}
          <SignedString data={affirmData(id)} />
          <div className="row">
            <button className="primary" disabled={!idsMatch || !me} onClick={signAndOpen}>
              Sign in QoreX and open the trade
            </button>
            <button className="ghost" onClick={() => navigator.clipboard.writeText(shareLink(terms))}>
              Copy link for {short(role === "seller" ? terms.buyer : terms.seller)}
            </button>
          </div>
          {!canSend && me && <p className="muted small">This account cannot send EVM transactions, so after signing you get a link; anyone with a coin-60 account (e.g. your counterparty) can submit it.</p>}
          <TxStatus s={tx.state} />
          {relay && (
            <div className="signed">
              <div className="small">Signed. Send this link to your counterparty; opening it lets them submit your affirmation:</div>
              <textarea readOnly value={relay} rows={3} />
              <button onClick={() => navigator.clipboard.writeText(relay)}>Copy</button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
