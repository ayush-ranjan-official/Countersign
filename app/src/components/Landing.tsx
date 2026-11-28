import { useCallback, useEffect, useRef, useState } from "react";
import { animate } from "motion";
import { motion, useReducedMotion } from "motion/react";
import { DEPLOYMENT, FUSD } from "../lib/config";
import { affirmData, makeTicket, tradeIdOf, type Terms } from "../lib/terms";
import { readTradeAmounts, TradeReview, TradeTermsForm, type TradeDraft } from "./TradeProposal";
import { Card, fmtFusd } from "./ui";
import "./landing.css";

type DemoTarget = "buyer" | "quantity" | "price" | "counterparty" | "advanced" | "deadline" | "review";

type DemoFrame = TradeDraft & {
  target?: DemoTarget;
  pressing: boolean;
  advanced: boolean;
  reviewing: boolean;
};

const seller = "0x2a190b2cfe13d54a000000000000000000006c3f";
const buyer = "0x785dc952c853f6b4000000000000000000008b2e";
const exampleHours = 36;

const initialFrame: DemoFrame = {
  role: "seller", qty: "10", price: "10", counterparty: "", hours: 24,
  pressing: false, advanced: false, reviewing: false,
};

const walkthrough: ReadonlyArray<readonly [number, Partial<DemoFrame>]> = [
  [500, { target: "buyer", pressing: true }],
  [640, { role: "buyer", pressing: false }],
  [1020, { target: "quantity" }],
  [1230, { qty: "2" }],
  [1400, { qty: "25" }],
  [1900, { target: "price" }],
  [2090, { price: "1" }],
  [2260, { price: "10" }],
  [2430, { price: "10.20" }],
  [2900, { target: undefined }],
  [3500, { target: "counterparty" }],
  [3830, { counterparty: seller }],
  [4660, { target: "advanced", pressing: true }],
  [4800, { advanced: true, pressing: false }],
  [5290, { target: "deadline" }],
  [6180, { target: "advanced", pressing: true }],
  [6320, { advanced: false, pressing: false }],
  [7010, { target: "review", pressing: true }],
  [7150, { reviewing: true, pressing: false, target: undefined }],
];

function ExampleTradeReview({ amounts }: { amounts: ReturnType<typeof readTradeAmounts> }) {
  const [deadline] = useState(() => BigInt(Math.floor(Date.now() / 1000) + exampleHours * 3600));
  if (!amounts) return null;

  const proposal: Omit<Terms, "ticketHash"> = {
    seller, buyer, asset: DEPLOYMENT.bond, cash: FUSD, ...amounts, deadline, salt: 1n,
  };
  const id = tradeIdOf({ ...proposal, ticketHash: makeTicket(proposal).hash });
  return (
    <div className="stack">
      <TradeReview role="buyer" amounts={amounts} seller={seller} buyer={buyer}
        settleBy={new Date(Number(deadline) * 1000).toLocaleString()}>
        <div className="action-row">
          <button className="primary" type="button">Sign and open</button>
          <button className="ghost" type="button">Edit terms</button>
        </div>
        <details className="disclosure" open>
          <summary>Technical details</summary>
          <div className="mt-3">
            <p className="small muted">Sample trade ID</p>
            <code className="mono">{id}</code>
          </div>
          <div className="signed">
            <p className="small muted">Sample signing message</p>
            <code>{affirmData(id)}</code>
          </div>
        </details>
      </TradeReview>
    </div>
  );
}

function WorkbenchInstruments() {
  return (
    <aside className="workbench-instruments" aria-label="Example instruments">
      <div>
        <h3>Bond instruments</h3>
        <div className="workbench-instrument workbench-instrument-current">
          <strong>CSB31</strong><strong className="workbench-number">10.00 fUSD</strong>
          <span>Example bond</span><span>Reference price</span>
        </div>
      </div>
      <div>
        <h3>Example counterparty</h3>
        <div className="workbench-instrument">
          <strong>Meridian Desk</strong>
          <span className="workbench-number">0x2a19…6c3f</span>
        </div>
      </div>
      <dl className="workbench-network">
        <div><dt>Network</dt><dd>QoreChain Diana</dd></div>
        <div><dt>Settlement asset</dt><dd>fUSD</dd></div>
      </dl>
    </aside>
  );
}

function WorkbenchSettlement({ frame, amounts }: { frame: DemoFrame; amounts: ReturnType<typeof readTradeAmounts> }) {
  const bonds = amounts ? `${amounts.assetAmount.toLocaleString()} CSB31` : "—";
  const cash = amounts ? `${fmtFusd(amounts.cashAmount)} fUSD` : "—";
  const buying = frame.role === "buyer";
  return (
    <aside className="workbench-settlement" aria-hidden="true">
      <div className="workbench-panel">
        <div className="workbench-panel-heading"><h3>DvP settlement map</h3><span>{frame.reviewing ? "In review" : "Drafting"}</span></div>
        <div className="workbench-party">
          <i aria-hidden="true">Y</i>
          <div><strong>Your desk</strong><small>{buying ? "Buyer" : "Seller"}</small></div>
          <span className="workbench-number">{buying ? cash : bonds}</span>
        </div>
        <div className="workbench-flow">
          <svg aria-hidden="true" viewBox="0 0 260 56" fill="none">
            <path d="M55 2C55 28 118 28 130 28S205 28 205 54" stroke="#357d5f" strokeWidth="1.75" />
            <path d="M205 2C205 28 142 28 130 28S55 28 55 54" stroke="#83918a" strokeWidth="1.5" />
          </svg>
          <span>⇄&nbsp; Atomic escrow</span>
        </div>
        <div className="workbench-party">
          <i aria-hidden="true">C</i>
          <div><strong>{frame.counterparty ? "Meridian Desk" : "Counterparty"}</strong><small>{buying ? "Seller" : "Buyer"}</small></div>
          <span className="workbench-number">{buying ? bonds : cash}</span>
        </div>
      </div>
      <div className="workbench-panel">
        <div className="workbench-panel-heading"><h3>CSB31 reference</h3><strong className="workbench-number">10.00 fUSD</strong></div>
        <p className="workbench-chart-note">Illustrative price history</p>
        <svg className="workbench-chart" aria-hidden="true" viewBox="0 0 240 52" fill="none" preserveAspectRatio="none">
          <path d="M0 36L24 34 48 35 72 30 96 31 120 26 144 27 168 22 192 24 216 19 240 20V52H0Z" fill="#e2eee7" />
          <path d="M0 36L24 34 48 35 72 30 96 31 120 26 144 27 168 22 192 24 216 19 240 20" stroke="#246249" strokeWidth="1.8" strokeLinejoin="round" />
        </svg>
      </div>
    </aside>
  );
}

function TradeWalkthrough() {
  const stage = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [run, setRun] = useState(0);
  const [frame, setFrame] = useState(initialFrame);
  const start = useCallback(() => {
    setFrame(initialFrame);
    setRun((previous) => previous + 1);
  }, []);

  useEffect(() => {
    const surface = stage.current;
    if (!surface || run) return;
    const threshold = Math.min(0.7, (window.innerHeight * 0.8) / surface.offsetHeight);
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.intersectionRatio < threshold) return;
      observer.disconnect();
      start();
    }, { threshold });
    observer.observe(surface);
    return () => observer.disconnect();
  }, [run, start]);

  useEffect(() => {
    if (!run) return;
    let slider: ReturnType<typeof animate> | undefined;
    const timers = walkthrough.map(([delay, changes]) => window.setTimeout(() => {
      setFrame((current) => ({ ...current, ...changes }));
      if (changes.target !== "deadline") return;
      if (reduceMotion) {
        setFrame((current) => ({ ...current, hours: exampleHours }));
        return;
      }
      slider = animate(initialFrame.hours, exampleHours, {
        duration: 0.55,
        ease: [0.23, 1, 0.32, 1],
        onUpdate: (hours) => setFrame((current) => ({ ...current, hours })),
      });
    }, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      slider?.stop();
    };
  }, [run, reduceMotion]);

  const amounts = readTradeAmounts(frame.qty, frame.price);
  const setInert = useCallback((content: HTMLDivElement | null) => {
    if (content) content.inert = true;
  }, []);

  return (
    <div id="workbench" className="trade-demo-stage landing-workbench" role="region" aria-label="New Trade walkthrough">
      <div className="trade-demo-actions">
        <div className="workbench-product" aria-hidden="true">
          <span className="wordmark-symbol" />
          <strong>Countersign</strong>
        </div>
        <div className="workbench-tabs" aria-hidden="true">
          <span>Overview</span><strong>New trade</strong><span>Activity</span>
        </div>
        <button type="button" onClick={start} disabled={run === 0}>
          <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.65">
            <path d="M3.5 8.5a6.65 6.65 0 1 1 .9 5.3M3.5 4v4.5H8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Replay
        </button>
      </div>
      <p className="sr-only" aria-live="polite">
        {frame.reviewing
          ? "Review before signing. Buy 25 CSB31 bonds for 255 fUSD with a 36-hour deadline."
          : "Example showing how to set the terms of a bond trade and review the proposal."}
      </p>
      <div className="workbench-grid">
        <WorkbenchInstruments />
        <div className="trade-demo-surface" ref={stage}>
          <div ref={setInert} data-demo-focus={frame.target} data-demo-press={frame.pressing || undefined}>
            <motion.div
              key={frame.reviewing ? "review" : "form"}
              initial={frame.reviewing && !reduceMotion ? { opacity: 0, y: 4 } : false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.20, ease: [0.23, 1, 0.32, 1] }}
            >
              <Card title={frame.reviewing ? "Review before signing" : "Trade terms"}>
                {frame.reviewing ? (
                  <ExampleTradeReview amounts={amounts} />
                ) : (
                  <TradeTermsForm
                    draft={frame}
                    amounts={amounts}
                    referencePrice="10 fUSD per bond"
                    counterpartyHelp={frame.counterparty ? "Counterparty’s signing key is verified." : "Use the public address of the other party."}
                    advancedOpen={frame.advanced}
                    reviewReady={Boolean(frame.counterparty && amounts)}
                  />
                )}
              </Card>
            </motion.div>
          </div>
        </div>
        <WorkbenchSettlement frame={frame} amounts={amounts} />
      </div>
    </div>
  );
}

export function Landing() {
  const reduceMotion = useReducedMotion();
  return (
    <section className="landing-hero" aria-labelledby="landing-heading">
      <div className="landing-mist" aria-hidden="true" />
      <div className="landing-hero-content">
        <div className="landing-intro">
          <h1 id="landing-heading">Agree the trade.<br /> <span>Settle it together.</span></h1>
          <p className="landing-lead">Set the terms for a bond trade. Both parties approve, then bonds and cash settle simultaneously in a single atomic transaction.</p>
          <div className="landing-cta">
            <a className="button primary" href="#/overview">Get started <span aria-hidden="true">↗</span></a>
            <button className="ghost" type="button" onClick={() => document.getElementById("workbench")?.scrollIntoView({
              behavior: reduceMotion ? "auto" : "smooth", block: "center",
            })}>See example trade <span aria-hidden="true">↓</span></button>
          </div>
        </div>
        <TradeWalkthrough />
      </div>
    </section>
  );
}
