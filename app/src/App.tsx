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

function route(hash: string): { page: string; trade?: TradeRoute; error?: string } {
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
  if (path === "/new") return { page: "new" };
  if (path === "/blotter") return { page: "blotter" };
  return { page: "ready" };
}

export function App() {
  const r = route(useHash());
  const nav = [
    ["ready", "#/", "Get ready"],
    ["new", "#/new", "New trade"],
    ["blotter", "#/blotter", "Blotter"],
  ] as const;
  return (
    <div className="app">
      <header className="top">
        <a className="brand" href="#/">
          <span className="mark" aria-hidden>⧉</span> Countersign
          <span className="tag">post-quantum DvP · QoreChain testnet</span>
        </a>
        <nav>
          {nav.map(([k, href, label]) => (
            <a key={k} href={href} className={r.page === k ? "active" : ""}>
              {label}
            </a>
          ))}
        </nav>
        <ConnectButton showBalance={false} chainStatus="icon" accountStatus="address" />
      </header>
      <main>
        {r.page === "ready" && <Readiness />}
        {r.page === "new" && <NewTrade />}
        {r.page === "blotter" && <Blotter />}
        {r.page === "trade" && r.trade && <TradeView key={location.hash} {...r.trade} />}
        {r.page === "error" && <p className="status bad">Bad trade link: {r.error}</p>}
      </main>
      <footer className="muted small">
        Testnet only (qorechain-diana): the ML-DSA-87 precompiles are not active on mainnet, where Countersign refuses every affirmation. Contract{" "}
        <Addr a={DEPLOYMENT.countersign} /> ({DEPLOYMENT.label}). Apache-2.0 ·{" "}
        <a href="https://github.com/ayush-ranjan-official/Countersign" target="_blank" rel="noreferrer">source</a>
      </footer>
    </div>
  );
}
