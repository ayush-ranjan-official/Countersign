import { useBlotter, useChainNow, useTrade, STATUS, type OpenedTrade } from "../lib/reads";
import { Addr, Card, fmtFusd, same, useQorex } from "./ui";

function Row({ o, me }: { o: OpenedTrade; me?: string }) {
  const t = useTrade(o.id);
  const now = useChainNow();
  const status = t.data?.status ?? 1;
  const expired = now.data !== undefined && now.data > o.terms.deadline && status === 1;
  const mine = same(me, o.terms.seller) ? "seller" : same(me, o.terms.buyer) ? "buyer" : "";
  return (
    <tr className={mine ? "mine" : ""} onClick={() => (location.hash = `#/trade/${o.id}`)}>
      <td className="mono">{o.id.slice(0, 10)}…</td>
      <td>{mine || "—"}</td>
      <td><Addr a={o.terms.seller} /></td>
      <td><Addr a={o.terms.buyer} /></td>
      <td className="num">{o.terms.assetAmount.toString()}</td>
      <td className="num">{fmtFusd(o.terms.cashAmount)}</td>
      <td><span className={`badge s${status}`}>{expired ? "Expired" : STATUS[status]}</span></td>
      <td>{new Date(Number(o.terms.deadline) * 1000).toLocaleString()}</td>
    </tr>
  );
}

/** Every trade ever opened on this Countersign deployment, from TradeOpened events. Yours are highlighted. */
export function Blotter() {
  const b = useBlotter();
  const qx = useQorex();
  const mine = (b.data ?? []).filter((o) => same(qx.data?.evm, o.terms.seller) || same(qx.data?.evm, o.terms.buyer));
  return (
    <Card title="Blotter" aside={<span className="muted small">{b.data ? `${b.data.length} trades, ${mine.length} yours` : b.isLoading ? "scanning the chain…" : ""}</span>}>
      {b.error && <p className="status bad">Could not read events: {b.error.message}</p>}
      <div className="table-wrap">
        <table className="blotter">
          <thead>
            <tr><th>Trade</th><th>You</th><th>Seller</th><th>Buyer</th><th className="num">Bonds</th><th className="num">fUSD</th><th>Status</th><th>Deadline</th></tr>
          </thead>
          <tbody>
            {(b.data ?? []).map((o) => (
              <Row key={o.id} o={o} me={qx.data?.evm} />
            ))}
          </tbody>
        </table>
      </div>
      {b.data?.length === 0 && <p className="muted">No trades yet. Open one under “New trade”.</p>}
    </Card>
  );
}
