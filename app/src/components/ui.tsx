import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { formatUnits, type Address } from "viem";
import { useAccount } from "wagmi";
import { addrUrl, CHAIN_ID, txUrl } from "../lib/config";
import { connectNativeQorex, qorexAccount, qorexNative, type QorexAccount } from "../lib/qorex";
import type { TxState } from "../lib/tx";
import type { ReactNode } from "react";

const nativeQorexKey = ["qorex-native"] as const;

/** The active QoreX account, read after an EVM connection or an explicit native connection. */
export function useQorex() {
  const { address, chainId, connector, isConnected } = useAccount();
  const connectedAddress = isConnected && connector?.id === "qorex" && chainId === CHAIN_ID ? address : undefined;
  const evm = useQuery({
    queryKey: ["qorex", connectedAddress],
    enabled: !!connectedAddress,
    retry: false,
    staleTime: 30_000,
    queryFn: () => connectedAddress ? qorexAccount(connectedAddress) : null,
  });
  const native = useQuery<QorexAccount | null>({ queryKey: nativeQorexKey, enabled: false });
  return { data: connectedAddress ? evm.data : native.data, isFetching: evm.isFetching };
}

export function NativeWalletConnect() {
  const { connector, isConnected, isConnecting, isReconnecting } = useAccount();
  const client = useQueryClient();
  const { data } = useQorex();
  const native = useMutation({
    mutationFn: connectNativeQorex,
    onSuccess: (account) => client.setQueryData(nativeQorexKey, account),
  });

  useEffect(() => {
    const onChange = () => {
      client.setQueryData(nativeQorexKey, null);
      void client.invalidateQueries({ queryKey: ["qorex"] });
    };
    window.addEventListener("qorex_keystorechange", onChange);
    return () => window.removeEventListener("qorex_keystorechange", onChange);
  }, [client]);

  if (!qorexNative() || isConnecting || isReconnecting || (isConnected && connector?.id === "qorex")) return null;
  return (
    <div className="copy-control">
      {data ? (
        <button className="ghost" type="button" onClick={() => client.setQueryData(nativeQorexKey, null)}>Disconnect native account</button>
      ) : (
        <button className="ghost" type="button" disabled={native.isPending} onClick={() => native.mutate()}>
          {native.isPending ? "Waiting for QoreX…" : "Connect native account"}
        </button>
      )}
      {native.isError && !data && <small role="status">{native.error.message}</small>}
    </div>
  );
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

export function TxLink({ hash, label }: { hash: string; label?: string }) {
  return (
    <a className="mono" href={txUrl(hash)} target="_blank" rel="noreferrer">
      {label ?? short(hash, 8)} ↗
    </a>
  );
}

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [message, setMessage] = useState("");
  return (
    <span className="copy-control">
      <button type="button" className="ghost" onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setMessage("Copied");
        } catch {
          setMessage("Copy was blocked by the browser.");
        }
      }}>{label}</button>
      {message && <small role="status">{message}</small>}
    </span>
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

export function TxStatus({ s }: { s: TxState }) {
  if (s.phase === "idle") return null;
  if (s.phase === "error") return <p className="status bad" role="alert">✗ {s.label}: {s.reason}</p>;
  if (s.phase === "done")
    return (
      <p className="status ok" role="status">
        ✓ {s.label}: <TxLink hash={s.hash} />
      </p>
    );
  const what = s.phase === "simulating" ? "Checking the transaction" : s.phase === "signing" ? "Approve in QoreX" : "Waiting for on-chain confirmation";
  return <p className="status busy" role="status">… {s.label}: {what}</p>;
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
