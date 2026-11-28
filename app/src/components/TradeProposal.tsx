import { useId, type CSSProperties, type ReactNode } from "react";
import { parseUnits } from "viem";
import { fmtFusd } from "./ui";

const MIN_HOURS = 1;
const MAX_HOURS = 72;

export type TradeDraft = {
  role: "seller" | "buyer";
  qty: string;
  price: string;
  counterparty: string;
  hours: number;
};

export function readTradeAmounts(qty: string, price: string) {
  try {
    const assetAmount = BigInt(qty);
    const cashAmount = parseUnits(price, 6) * assetAmount;
    if (assetAmount > 0n && cashAmount > 0n) return { assetAmount, cashAmount };
  } catch {
    // A partially entered amount cannot be quoted or signed.
  }
  return null;
}

type TradeAmounts = ReturnType<typeof readTradeAmounts>;

function TradeExchangeSummary({ role, amounts }: { role: TradeDraft["role"]; amounts: TradeAmounts }) {
  const bonds = amounts?.assetAmount.toLocaleString() ?? "—";
  const cash = amounts ? fmtFusd(amounts.cashAmount) : "—";
  return (
    <p className="trade-exchange-summary">
      <span>{role === "buyer" ? `Pay ${cash} fUSD` : `Deliver ${bonds} CSB31`}</span>
      {" · "}
      <span>{role === "buyer" ? `Receive ${bonds} CSB31` : `Receive ${cash} fUSD`}</span>
    </p>
  );
}

type TradeTermsFormProps = {
  draft: TradeDraft;
  amounts: TradeAmounts;
  referencePrice: string;
  counterpartyHelp: string;
  counterpartyInvalid?: boolean;
  advancedOpen?: boolean;
  reviewReady: boolean;
  verifying?: boolean;
  onChange?: (changes: Partial<TradeDraft>) => void;
  onReview?: () => void;
  children?: ReactNode;
};

export function TradeTermsForm({
  draft, amounts, referencePrice, counterpartyHelp, counterpartyInvalid, advancedOpen,
  reviewReady, verifying, onChange, onReview, children,
}: TradeTermsFormProps) {
  const { role, qty, price, counterparty, hours } = draft;
  const referenceId = useId();
  const helpId = useId();
  const deadlineId = useId();
  const displayHours = Math.round(hours);
  const deadlineProgress = ((hours - MIN_HOURS) / (MAX_HOURS - MIN_HOURS)) * 100;
  return (
    <form className="form" onSubmit={(event) => {
      event.preventDefault();
      if (reviewReady) onReview?.();
    }}>
      <div className="asset-role trade-side" role="group" aria-label="Trading role">
        <button type="button" data-demo-target="buyer" aria-pressed={role === "buyer"} onClick={() => onChange?.({ role: "buyer" })}>Buy bonds</button>
        <button type="button" aria-pressed={role === "seller"} onClick={() => onChange?.({ role: "seller" })}>Sell bonds</button>
      </div>
      <div className="trade-quote">
        <div className="trade-amounts">
          <label className="trade-amount" data-demo-target="quantity">
            Bond quantity
            <span className="trade-amount-entry">
              <input value={qty} onChange={(event) => onChange?.({ qty: event.target.value })} inputMode="numeric" />
              <span>CSB31</span>
            </span>
          </label>
          <label className="trade-amount" data-demo-target="price">
            Price per bond
            <span className="trade-amount-entry">
              <input value={price} onChange={(event) => onChange?.({ price: event.target.value })} inputMode="decimal" aria-describedby={referenceId} />
              <span>fUSD</span>
            </span>
          </label>
        </div>
        <TradeExchangeSummary role={role} amounts={amounts} />
        <p className="small muted" id={referenceId}>Reference price {referencePrice}</p>
      </div>
      <label>Counterparty address
        <input value={counterparty} onChange={(event) => onChange?.({ counterparty: event.target.value })} placeholder="qor1… or 0x…" spellCheck={false}
          data-demo-target="counterparty" aria-invalid={counterpartyInvalid} aria-describedby={helpId} />
      </label>
      <p className="small muted" id={helpId}>{counterpartyHelp}</p>
      <details className="disclosure trade-deadline" open={advancedOpen}>
        <summary data-demo-target="advanced">Advanced terms <span className="muted deadline-preview">· {displayHours} h deadline</span></summary>
        <label className="deadline-label" htmlFor={deadlineId}>Settlement deadline</label>
        <span className="deadline-value" aria-hidden="true">{displayHours} h</span>
        <input className="deadline-slider" type="range" id={deadlineId} data-demo-target="deadline"
          min={MIN_HOURS} max={MAX_HOURS} step={onChange ? 1 : "any"} value={hours}
          aria-valuetext={`${displayHours} ${displayHours === 1 ? "hour" : "hours"}`}
          style={{ "--deadline-progress": `${deadlineProgress}%` } as CSSProperties}
          onChange={(event) => onChange?.({ hours: event.target.valueAsNumber })} />
        <div className="deadline-limits" aria-hidden="true"><span>{MIN_HOURS} h</span><span>{MAX_HOURS} h</span></div>
      </details>
      {children}
      <button className="primary w-fit" type="submit" data-demo-target="review" disabled={!reviewReady}>
        {verifying ? "Verifying trade…" : "Review trade"}
      </button>
    </form>
  );
}

type TradeReviewProps = {
  role: TradeDraft["role"];
  amounts: TradeAmounts;
  seller: string;
  buyer: string;
  settleBy: string;
  children: ReactNode;
};

export function TradeReview({ role, amounts, seller, buyer, settleBy, children }: TradeReviewProps) {
  return (
    <>
      <TradeExchangeSummary role={role} amounts={amounts} />
      <dl className="network-details">
        <div><dt>Seller</dt><dd className="mono">{seller}{role === "seller" && " (you)"}</dd></div>
        <div><dt>Buyer</dt><dd className="mono">{buyer}{role === "buyer" && " (you)"}</dd></div>
        <div><dt>Settle by</dt><dd>{settleBy}</dd></div>
      </dl>
      {children}
    </>
  );
}
