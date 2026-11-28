import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { Address, Hex } from "viem";
import { toEvmAddress } from "@qorechain/evm";
import { useAccount, usePublicClient } from "wagmi";
import { DEPLOYMENT, FUSD, csAbi } from "../lib/config";
import { signData } from "../lib/qorex";
import { useChainNow, useKeyStatus, useNav } from "../lib/reads";
import { affirmData, encodeTerms, makeTicket, randomSalt, shareLink, sigToParam, tradeIdOf, type Terms } from "../lib/terms";
import { useTx } from "../lib/tx";
import { Card, CopyButton, SignedString, TxStatus, fmtFusd, same, useQorex } from "./ui";
import { readTradeAmounts, TradeReview, TradeTermsForm, type TradeDraft } from "./TradeProposal";

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
  const [draft, setDraft] = useState<TradeDraft>({ role: initialSide, qty: "10", price: "10", counterparty: "", hours: 24 });
  const { role, qty, price, counterparty, hours } = draft;
  const [reviewing, setReviewing] = useState(false);
  const reviewPanel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reviewing) reviewPanel.current?.focus();
  }, [reviewing]);
  const [salt] = useState(randomSalt);
  const [signing, setSigning] = useState(false);
  const [relay, setRelay] = useState<string | null>(null);
  const cpAddr = useMemo(() => parseCounterparty(counterparty), [counterparty]);
  const cpKey = useKeyStatus(cpAddr ?? undefined);

  const amounts = useMemo(() => readTradeAmounts(qty, price), [qty, price]);

  const terms = useMemo((): Terms | null => {
    if (!amounts || !me || !cpAddr || now.data === undefined || same(cpAddr, me.evm)) return null;
    const base = {
      seller: role === "seller" ? me.evm : cpAddr,
      buyer: role === "buyer" ? me.evm : cpAddr,
      asset: DEPLOYMENT.bond,
      cash: FUSD,
      ...amounts,
      deadline: now.data + BigInt(hours * 3600),
      salt,
    };
    return { ...base, ticketHash: makeTicket(base).hash };
    // deadline follows the chain clock; recompute only when inputs change, not on every block
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me, cpAddr, amounts, hours, role, salt, now.data === undefined]);

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

  const sameWallet = Boolean(cpAddr && same(cpAddr, me?.evm));
  const counterpartyHelp = sameWallet ? "Enter the other party’s wallet address." :
    counterparty && !cpAddr ? "Enter a valid QoreChain or Ethereum-style address." :
    cpKey.data ? cpKey.data.registered && cpKey.data.possessionProven ? "Counterparty’s signing key is verified." :
      "The counterparty needs to register their signing key before they can approve." :
      "Use the public address of the other party.";

  return (
    <div className="workspace new-trade-workspace">
      <Card title={reviewing ? "Review before signing" : "Trade terms"}>
        {!reviewing ? (
          <TradeTermsForm
            draft={draft}
            amounts={amounts}
            referencePrice={nav.data?.price ? `${fmtFusd(nav.data.price)} fUSD per bond` : nav.isLoading ? "loading…" : "unavailable"}
            counterpartyHelp={counterpartyHelp}
            counterpartyInvalid={Boolean(counterparty && (!cpAddr || sameWallet))}
            reviewReady={Boolean(terms && idsMatch)}
            verifying={Boolean(terms && contractId.isFetching)}
            onChange={(changes) => setDraft((current) => ({ ...current, ...changes }))}
            onReview={() => setReviewing(true)}
          >
            {!me && <p className="notice">Connect QoreX in the header to review and open this trade.</p>}
            {contractId.isError && <p className="notice" role="alert">Could not verify the terms on-chain. <button className="link" type="button" onClick={() => contractId.refetch()}>Try again</button></p>}
          </TradeTermsForm>
        ) : terms && id ? (
          <div className="stack" tabIndex={-1} ref={reviewPanel}>
            <TradeReview role={role} amounts={amounts} seller={terms.seller} buyer={terms.buyer}
              settleBy={new Date(Number(terms.deadline) * 1000).toLocaleString()}>
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
            </TradeReview>
          </div>
        ) : (
          <p className="muted">Your wallet or terms changed. <button className="link" onClick={() => setReviewing(false)}>Edit terms</button></p>
        )}
      </Card>
    </div>
  );
}
