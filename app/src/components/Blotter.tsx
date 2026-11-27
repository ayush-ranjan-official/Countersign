import { DEPLOYMENT } from "../lib/config";
import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import { usePublicClient } from "wagmi";
import { useBlotter, useChainNow, useNav, tradeQueryOptions, STATUS, type OpenedTrade, type Trade } from "../lib/reads";
import { Addr, Card, fmtFusd, same, short, useQorex } from "./ui";

const FILTERS = ["All", "Action needed", "Completed"] as const;
type Filter = typeof FILTERS[number];

function isActionNeeded(trade: Trade | undefined, expired: boolean, side: "seller" | "buyer" | null, navReady: boolean) {
  if (!trade || trade.status !== 1 || !side) return false;
  if (expired) return trade.assetLocked || trade.cashLocked;
  const approved = side === "seller" ? trade.sellerAffirmed : trade.buyerAffirmed;
  const locked = side === "seller" ? trade.assetLocked : trade.cashLocked;
  if (trade.assetLocked && trade.cashLocked) {
    return navReady && (trade.terms.cashAmount < DEPLOYMENT.largeTradeThreshold || trade.officerApproved);
  }
  return !approved || (trade.sellerAffirmed && trade.buyerAffirmed && !locked);
}

function Row({ opened, side, status, expired }: {
  opened: OpenedTrade;
  side: "seller" | "buyer" | null;
  status: number | undefined;
  expired: boolean;
}) {
  return (
    <tr className={side ? "mine" : ""}>
      <td><a className="trade-link mono" href={"#/trade/" + opened.id} title={opened.id}>{short(opened.id, 4)}</a></td>
      <td className="wide-col">{side === "seller" ? "Seller" : side === "buyer" ? "Buyer" : "—"}</td>
      <td className="wide-col"><Addr a={opened.terms.seller} /></td>
      <td className="wide-col"><Addr a={opened.terms.buyer} /></td>
      <td className="num">{opened.terms.assetAmount.toString()}</td>
      <td className="num">{fmtFusd(opened.terms.cashAmount)}</td>
      <td><span className={"badge s" + (status ?? 0)}>{expired ? "Expired" : status === undefined ? "Unverified" : STATUS[status]}</span></td>
    </tr>
  );
}

export function Blotter() {
  const activity = useBlotter();
  const { data: account } = useQorex();
  const now = useChainNow().data;
  const nav = useNav().data;
  const pub = usePublicClient();
  const [filter, setFilter] = useState<Filter>("All");
  const openedTrades = activity.data ?? [];
  const tradeStates = useQueries({ queries: openedTrades.map((opened) => tradeQueryOptions(pub, opened.id)) });
  const rows = openedTrades.map((opened, index) => {
    const trade = tradeStates[index]?.data;
    const state = trade?.status;
    const expired = state === 1 && now !== undefined && now > opened.terms.deadline;
    const side = same(account?.evm, opened.terms.seller) ? "seller" as const : same(account?.evm, opened.terms.buyer) ? "buyer" as const : null;
    const ref = (nav?.price ?? 0n) * opened.terms.assetAmount;
    const difference = opened.terms.cashAmount > ref ? opened.terms.cashAmount - ref : ref - opened.terms.cashAmount;
    const navReady = Boolean(nav && nav.timestamp > 0n && now !== undefined && now - nav.timestamp <= DEPLOYMENT.maxNavAge
      && ref > 0n && difference * 10_000n / ref <= DEPLOYMENT.maxDeviationBps);
    return { opened, side, state, expired, actionNeeded: isActionNeeded(trade, expired, side, navReady) };
  });
  const visible = rows.filter((row) => filter === "All" || (filter === "Completed" ? row.state === 2 || row.state === 3 : row.actionNeeded));
  const checking = tradeStates.some((state) => state.isLoading);

  return (
    <div className="workspace">
      <header className="page-heading">
        <h1>Activity</h1>
        <p>Open a trade to check its approvals, escrow, or settlement receipt.</p>
        <a className="button primary mt-3 w-fit" href="#/new">New trade <span aria-hidden="true">↗</span></a>
      </header>
      <Card title="On-chain trades" aside={<span className="muted small">{activity.isLoading ? "Reading the chain…" : visible.length + " trades"}</span>}>
        <div className="activity-filters" role="group" aria-label="Filter trades">
          {FILTERS.map((name) => <button type="button" aria-pressed={filter === name} key={name} onClick={() => setFilter(name)}>{name}</button>)}
        </div>
        {activity.error && <p className="status bad" role="alert">Could not read trades: {activity.error.message}</p>}
        {visible.length > 0 ? (
          <div className="table-wrap">
            <table className="blotter">
              <thead><tr><th>Trade</th><th className="wide-col">Your role</th><th className="wide-col">Seller</th><th className="wide-col">Buyer</th><th className="num">CSB31</th><th className="num">fUSD</th><th>Status</th></tr></thead>
              <tbody>{visible.map((row) => <Row key={row.opened.id} opened={row.opened} side={row.side} status={row.state} expired={row.expired} />)}</tbody>
            </table>
          </div>
        ) : !activity.error && (
          <p className="muted" role="status">
            {activity.isLoading || checking ? "Checking trades…" : filter === "Action needed" && !account ? "Connect QoreX to see which trades need your action." : "No matching trades."}
          </p>
        )}
      </Card>
    </div>
  );
}
