import { useQuery } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { addrUrl, txUrl } from "../lib/config";
import { qorexAccount, qorexNative } from "../lib/qorex";
import type { TxState } from "../lib/tx";
import type { ReactNode } from "react";

/** The active QoreX account on the native lane (qor1, 0x, coin 60 or 118). Re-read when the EVM account changes. */
export function useQorex() {
  const { address } = useAccount();
  return useQuery({
    queryKey: ["qorex", address],
    enabled: typeof window !== "undefined" && !!qorexNative(),
    retry: false,
    queryFn: qorexAccount,
  });
}

export const fmtFusd = (v: bigint) => Number(formatUnits(v, 6)).toLocaleString(undefined, { maximumFractionDigits: 6 });
export const fmtQor = (wei: bigint) => Number(formatUnits(wei, 18)).toLocaleString(undefined, { maximumFractionDigits: 4 });
export const short = (h: string, n = 6) => (h.length > 2 * n + 2 ? `${h.slice(0, n + 2)}…${h.slice(-n)}` : h);
export const same = (a?: string, b?: string) => !!a && !!b && a.toLowerCase() === b.toLowerCase();

export function Addr({ a, label }: { a: Address | string; label?: string }) {
  return (
    <a className="mono addr" href={addrUrl(a)} target="_blank" rel="noreferrer" title={a}>
      {label ? `${label} ` : ""}
      {short(a)}
    </a>
  );
}

export function TxLink({ hash }: { hash: string }) {
  return (
    <a className="mono" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {short(hash, 8)} ↗
    </a>
  );
}

export function Card({ title, children, aside }: { title: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="card">
      <header className="card-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

export function Check({ ok, warn, title, children }: { ok: boolean; warn?: boolean; title: string; children?: ReactNode }) {
  return (
    <li className={`check ${ok ? "ok" : warn ? "warn" : "bad"}`}>
      <span className="dot" aria-hidden>{ok ? "✓" : warn ? "!" : "×"}</span>
      <div>
        <strong>{title}</strong>
        {children && <div className="muted">{children}</div>}
      </div>
    </li>
  );
}

export function TxStatus({ s }: { s: TxState }) {
  if (s.phase === "idle") return null;
  if (s.phase === "error") return <p className="status bad">✗ {s.label}: {s.reason}</p>;
  if (s.phase === "done")
    return (
      <p className="status ok">
        ✓ {s.label}: <TxLink hash={s.hash} />
      </p>
    );
  const what = s.phase === "simulating" ? "simulating on the node" : s.phase === "signing" ? "approve in QoreX" : "waiting for the block";
  return <p className="status busy">… {s.label}: {what}</p>;
}

/** The exact string QoreX will show and sign, so the user can compare it with the wallet prompt. */
export function SignedString({ data }: { data: string }) {
  return (
    <div className="signed">
      <div className="muted small">QoreX will ask you to sign exactly:</div>
      <code className="mono">{data}</code>
      <div className="muted small">
        ML-DSA-87 covers <span className="mono">qorechain-msg-v1|qorechain-diana|</span> + this string, the bytes Countersign checks with the
        <span className="mono"> pqcVerify</span> precompile.
      </div>
    </div>
  );
}
