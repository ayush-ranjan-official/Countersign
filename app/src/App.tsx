import { useEffect, useState } from "react";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { DEPLOYMENT } from "./lib/config";
import { decodeTerms } from "./lib/terms";
import { Readiness } from "./components/Readiness";
import { NewTrade } from "./components/NewTrade";
import { TradeView, type TradeRoute } from "./components/TradeView";
import { Blotter } from "./components/Blotter";
import { Addr } from "./components/ui";
import type { Hex } from "viem";

function useHash() {
  const [h, setH] = useState(location.hash);
  useEffect(() => {
    const on = () => setH(location.hash);
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return h;
}

function route(hash: string): { page: "ready" | "new" | "blotter"; side: "seller" | "buyer" } | { page: "trade"; trade: TradeRoute } | { page: "error"; error: string } {
  const [path = "", query = ""] = hash.replace(/^#/, "").split("?");
  const q = new URLSearchParams(query);
  const relay = { relayAffirm: q.get("affirm") ?? undefined, relayApprove: q.get("approve") ?? undefined };
  if (path.startsWith("/t/")) {
    try {
      return { page: "trade", trade: { terms: decodeTerms(path.slice(3)), ...relay } };
    } catch (e) {
      return { page: "error", error: e instanceof Error ? e.message : String(e) };
    }
  }
  if (/^\/trade\/0x[0-9a-fA-F]{64}$/.test(path)) return { page: "trade", trade: { id: path.slice(7) as Hex, ...relay } };
  const side = q.get("side") === "buyer" ? "buyer" : "seller";
  if (path === "/new") return { page: "new", side };
  if (path === "/blotter") return { page: "blotter", side };
  return { page: "ready", side };
}

export function App() {
  const hash = useHash();
  const r = route(hash);
  const nav = [
    ["ready", "#/", "Overview"],
    ["new", "#/new", "New trade"],
    ["blotter", "#/blotter", "Activity"],
  ] as const;

  return (
    <div className="app">
      <a className="skip-link" href="#workspace" onClick={(event) => {
        event.preventDefault();
        document.getElementById("workspace")?.focus();
      }}>Skip to content</a>
      <header className="top">
        <a className="brand" href="#/">
          <span className="wordmark-symbol" aria-hidden="true" />
          Countersign
        </a>
        <nav aria-label="Main navigation">
          {nav.map(([key, href, label]) => (
            <a key={key} href={href} aria-current={r.page === key ? "page" : undefined}>{label}</a>
          ))}
        </nav>
        <div className="wallet-bar">
          <span className="network-label"><i aria-hidden="true" /> Diana testnet</span>
          <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
        </div>
      </header>
      <main id="workspace" className="min-w-0" tabIndex={-1}>
        {r.page === "ready" && <Readiness initialSide={r.side} />}
        {r.page === "new" && <NewTrade key={r.side} initialSide={r.side} />}
        {r.page === "blotter" && <Blotter />}
        {r.page === "trade" && <TradeView key={hash} {...r.trade} />}
        {r.page === "error" && <p className="status bad">Bad trade link: {r.error}</p>}
      </main>
      <footer className="site-footer">
        <span>QoreChain Diana <span aria-hidden="true">·</span> Testnet assets only</span>
        <span>Contract <Addr a={DEPLOYMENT.countersign} /> <span aria-hidden="true">·</span>{" "}
          <a href="https://github.com/ayush-ranjan-official/Countersign" target="_blank" rel="noreferrer">Source</a>
        </span>
      </footer>
    </div>
  );
}
