"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CHAIN_ID,
  listLiveMarkets,
  notionalOf,
  priceFromProbability,
  quantityFromContracts,
  quoteFee,
  placeAndRoute,
} from "@/lib/kiosk";
import { useMarketData, type ApiMarket } from "./useMarketData";
import { useWallet } from "./useWallet";
import {
  EXPLORER,
  formatCents,
  formatCollateral,
  formatCountdown,
  formatPrice,
  formatQty,
  readableError,
  shortAddress,
  type TradeErrorKind,
} from "./format";

type Side = "up" | "down";

type Leg = { kind: 0 | 2; pay: number; yes: number; depth: number };

type Quote = { fee: bigint; integratorShare: bigint; platformShare: bigint };

type Receipt = {
  orderHash: string;
  routeHash: string;
  approveHash?: string;
  orderId: bigint | null;
  fee: bigint;
  notional: bigint;
};

type Trade =
  | { status: "idle" }
  | { status: "working"; note: string }
  | { status: "done"; receipt: Receipt }
  | { status: "failed"; kind: TradeErrorKind; message: string };

const QUICK_SIZES = [5, 25, 100];

function useSecond(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, [active]);
  return now;
}

function grid(m: ApiMarket | null) {
  if (!m?.tick || !m.lot || !m.minQty) return null;
  try {
    return { tick: BigInt(m.tick), lot: BigInt(m.lot), minQty: BigInt(m.minQty) };
  } catch {
    return null;
  }
}

export function KioskUnit({ code, asset }: { code: string; asset: string }) {
  const feed = useMarketData(asset);
  const wallet = useWallet(CHAIN_ID);
  const [side, setSide] = useState<Side>("up");
  const [contracts, setContracts] = useState(10);
  const [quoted, setQuoted] = useState<{
    key: string;
    quote: Quote | null;
    error: string | null;
  } | null>(null);
  const [trade, setTrade] = useState<Trade>({ status: "idle" });

  const m = feed.market;
  const now = useSecond(feed.phase === "ready");
  const expiryMs = m ? m.expiry * 1000 : null;
  const remaining = expiryMs === null ? null : expiryMs - now;
  const expired = remaining !== null && remaining <= 0;
  const finalized = m?.finalized === true;
  const locked = finalized || expired;

  const bestBid = m?.book?.bestBid ?? null;
  const bestAsk = m?.book?.bestAsk ?? null;
  const mid = m?.book?.mid ?? null;
  const bookEmpty = Boolean(m) && !bestBid && !bestAsk;

  // Buying Up crosses the resting asks. Buying Down is a BUY_NO, which the pool
  // prices off the same yes book from the bid side, so it crosses the bids.
  const legs: Record<Side, Leg | null> = useMemo(
    () => ({
      up: bestAsk ? { kind: 0, pay: bestAsk.price, yes: bestAsk.price, depth: bestAsk.quantity } : null,
      down: bestBid
        ? { kind: 2, pay: 1 - bestBid.price, yes: bestBid.price, depth: bestBid.quantity }
        : null,
    }),
    [bestAsk, bestBid],
  );
  const leg = legs[side];

  const sizing = useMemo(() => {
    if (!leg) return { notional: null as bigint | null, problem: null as string | null };
    const g = grid(m);
    if (!g) {
      const raw = Math.round(contracts * leg.pay * 1e6);
      return { notional: raw > 0 ? BigInt(raw) : null, problem: null };
    }
    try {
      const price = priceFromProbability(leg.yes, g.tick);
      const qty = quantityFromContracts(contracts, g.lot, g.minQty);
      return { notional: notionalOf(leg.kind, price, qty), problem: null };
    } catch (err) {
      return { notional: null, problem: (err as Error).message };
    }
  }, [leg, m, contracts]);

  // The quote is stored against the notional it was priced for, so a stale fee
  // can never be shown next to a size the visitor has already changed.
  const notionalKey = sizing.notional === null ? null : sizing.notional.toString();

  useEffect(() => {
    if (notionalKey === null) return;
    const raw = BigInt(notionalKey);
    const id = window.setTimeout(() => {
      quoteFee(code, raw)
        .then((q) => setQuoted({ key: notionalKey, quote: q, error: null }))
        .catch((err: unknown) => {
          const detail = (err as Error).message ?? "";
          setQuoted({
            key: notionalKey,
            quote: null,
            error: detail.includes("NEXT_PUBLIC_KIOSK_ROUTER")
              ? "KioskRouter is not deployed in this environment, so the fee cannot be quoted."
              : detail || "Fee quote unavailable.",
          });
        });
    }, 250);
    return () => window.clearTimeout(id);
  }, [code, notionalKey]);

  const fresh = quoted && quoted.key === notionalKey ? quoted : null;
  const quote = fresh?.quote ?? null;
  const quoteError = fresh?.error ?? null;

  const submit = useCallback(async () => {
    if (!m || !leg) return;
    setTrade({ status: "working", note: "Loading the market" });
    try {
      const live = await listLiveMarkets();
      const signable = live.find((x) => x.marketId === m.marketId);
      if (!signable) {
        throw new Error("That window closed while the ticket was open. The next one is loading.");
      }
      setTrade({ status: "working", note: "Confirm in your wallet" });
      const res = await placeAndRoute({
        market: signable,
        kind: leg.kind,
        probability: leg.yes,
        contracts,
        code,
      });
      setTrade({
        status: "done",
        receipt: {
          orderHash: res.orderHash,
          routeHash: res.routeHash,
          approveHash: res.approveHash,
          orderId: res.orderId,
          fee: res.fee,
          notional: res.notional,
        },
      });
      feed.reload();
    } catch (err) {
      const { kind, message } = readableError(err);
      setTrade({ status: "failed", kind, message });
    }
  }, [m, leg, contracts, code, feed]);

  const intervalLabel = (() => {
    const n = m?.intervalSec ?? 0;
    if (!n) return "binary window";
    return n % 60 === 0 ? `${n / 60} min window` : `${n}s window`;
  })();

  return (
    <div className="w-full max-w-[420px] chassis rounded-kiosk overflow-hidden">
      <div className="awning" aria-hidden />
      <div className="valance" aria-hidden />

      <div className="flex items-center justify-between gap-3 px-4 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <span className="numerals inline-flex h-6 items-center rounded-plate border border-rule-2 bg-ink px-1.5 text-[11px] font-bold tracking-[0.14em] text-sodium">
            {(m?.asset || asset).toUpperCase()}
          </span>
          <span className="text-[11px] uppercase tracking-[0.18em] text-paper-3">{intervalLabel}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="lamp" aria-hidden />
          <span className="text-[11px] font-bold tracking-[0.24em] text-paper-2">KIOSK</span>
        </div>
      </div>

      <div className="h-px bg-rule" />

      {feed.phase === "loading" ? <LoadingFace /> : null}

      {feed.phase === "error" ? (
        <Notice
          tone="bad"
          title="Somnia did not answer"
          body={feed.error ?? "The market feed could not be read."}
          action={{ label: "Try again", onClick: feed.reload }}
        />
      ) : null}

      {feed.phase === "none" ? (
        <Notice
          tone="quiet"
          title={`No ${asset.toUpperCase()} window is open`}
          body="The venue rolls a fresh window every interval. This kiosk picks the next one up on its own."
          action={{ label: "Check again", onClick: feed.reload }}
        />
      ) : null}

      {feed.phase === "ready" && m ? (
        <>
          <div className="px-4 py-3">
            <p className="text-[15px] leading-snug font-medium text-paper">{m.question}</p>
            <p className="numerals mt-1.5 text-[11px] tracking-wide text-paper-3">
              {Number(m.strikeDisplay) > 0
                ? `strike ${m.strikeDisplay}`
                : "settles against the window's own opening price"}
            </p>
          </div>

          <div className="flex items-end justify-between gap-3 border-t border-rule bg-ink/60 px-4 py-2.5">
            <div>
              <div className="text-[10px] uppercase tracking-[0.2em] text-paper-3">
                {finalized ? "settled" : expired ? "closed" : "closes in"}
              </div>
              <div
                className={`numerals text-[26px] leading-none font-bold tracking-tight ${
                  locked
                    ? "text-paper-3"
                    : remaining !== null && remaining < 60_000
                      ? "text-sodium"
                      : "text-paper"
                }`}
              >
                {finalized ? "final" : remaining !== null ? formatCountdown(remaining) : "--:--"}
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] uppercase tracking-[0.2em] text-paper-3">mid</div>
              <div className="numerals text-[26px] leading-none font-bold tracking-tight text-paper">
                {mid === null ? "--" : formatCents(mid)}
              </div>
            </div>
          </div>

          {m.poolReadError ? (
            <p className="px-4 pt-3 text-[11px] leading-relaxed text-down">
              Pool read failed: {m.poolReadError}
            </p>
          ) : null}

          <OddsRow side={side} setSide={setSide} legs={legs} locked={locked} />

          <BookLine bestBid={bestBid} bestAsk={bestAsk} empty={bookEmpty} />

          <SizeRow contracts={contracts} setContracts={setContracts} disabled={locked} minQty={m.minQty} />

          <Ticket
            contracts={contracts}
            leg={leg}
            side={side}
            quote={quote}
            quoteError={quoteError}
            notional={sizing.notional}
            problem={sizing.problem}
          />

          <ActionZone
            trade={trade}
            setTrade={setTrade}
            wallet={wallet}
            submit={submit}
            finalized={finalized}
            expired={expired}
            leg={leg}
            side={side}
            contracts={contracts}
          />
        </>
      ) : null}

      <Plate code={code} market={m} readAt={feed.readAt} />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function LoadingFace() {
  return (
    <div className="space-y-3 px-4 py-5" aria-live="polite" aria-busy="true">
      <div className="h-4 w-4/5 rounded-plate bg-ink-3" />
      <div className="h-4 w-3/5 rounded-plate bg-ink-3" />
      <div className="grid grid-cols-2 gap-2 pt-1">
        <div className="h-16 rounded-kiosk bg-ink-3" />
        <div className="h-16 rounded-kiosk bg-ink-3" />
      </div>
      <p className="text-[11px] tracking-wide text-paper-3">Reading the open window from Somnia.</p>
    </div>
  );
}

function Notice({
  tone,
  title,
  body,
  action,
}: {
  tone: "bad" | "quiet";
  title: string;
  body: string;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="px-4 py-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden
          className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-plate ${tone === "bad" ? "bg-down" : "bg-paper-3"}`}
        />
        <div>
          <p className="text-[13px] font-semibold text-paper">{title}</p>
          <p className="mt-1 text-[12px] leading-relaxed text-paper-2">{body}</p>
          {action ? (
            <button
              type="button"
              onClick={action.onClick}
              className="key mt-3 px-3 py-1.5 text-[11px] font-semibold tracking-wide text-paper"
            >
              {action.label}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function OddsRow({
  side,
  setSide,
  legs,
  locked,
}: {
  side: Side;
  setSide: (s: Side) => void;
  legs: Record<Side, Leg | null>;
  locked: boolean;
}) {
  const up = legs.up?.pay ?? null;
  const down = legs.down?.pay ?? null;
  const upWidth =
    up !== null && down !== null
      ? Math.round((up / (up + down)) * 100)
      : up !== null
        ? 100
        : down !== null
          ? 0
          : 50;

  return (
    <div className="px-4 pt-3">
      <div className="grid grid-cols-2 gap-2">
        {(["up", "down"] as const).map((s) => {
          const p = legs[s]?.pay ?? null;
          return (
            <button
              key={s}
              type="button"
              disabled={locked}
              onClick={() => setSide(s)}
              data-on={side === s}
              data-side={s}
              aria-pressed={side === s}
              className="latch px-3 py-2.5 text-left disabled:opacity-45"
            >
              <span
                className={`block text-[11px] font-bold uppercase tracking-[0.18em] ${
                  s === "up" ? "text-up" : "text-down"
                }`}
              >
                {s}
              </span>
              <span className="numerals mt-0.5 block text-[22px] leading-none font-bold text-paper">
                {p === null ? "--" : formatCents(p)}
              </span>
              <span className="mt-1 block text-[10px] tracking-wide text-paper-3">
                {p === null ? "no offers" : "pays 1.00"}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-2 flex h-[5px] overflow-hidden rounded-plate bg-ink-4" aria-hidden>
        <div className="bg-up transition-[width] duration-500 ease-out" style={{ width: `${upWidth}%` }} />
        <div className="w-px bg-ink" />
        <div className="flex-1 bg-down" />
      </div>
    </div>
  );
}

function BookLine({
  bestBid,
  bestAsk,
  empty,
}: {
  bestBid: { price: number; quantity: number } | null;
  bestAsk: { price: number; quantity: number } | null;
  empty: boolean;
}) {
  if (empty) {
    return (
      <p className="px-4 pt-2.5 text-[11px] leading-relaxed text-paper-3">
        The book is empty. Nobody has quoted this window yet, so there is no price to show.
      </p>
    );
  }
  return (
    <div className="numerals mt-2.5 flex items-center gap-3 px-4 text-[11px] text-paper-3">
      <span>
        bid <span className="text-up">{bestBid ? formatPrice(bestBid.price) : "--"}</span>
        {bestBid ? <span> ×{formatQty(bestBid.quantity)}</span> : null}
      </span>
      <span className="h-3 w-px bg-rule-2" aria-hidden />
      <span>
        ask <span className="text-down">{bestAsk ? formatPrice(bestAsk.price) : "--"}</span>
        {bestAsk ? <span> ×{formatQty(bestAsk.quantity)}</span> : null}
      </span>
    </div>
  );
}

function SizeRow({
  contracts,
  setContracts,
  disabled,
  minQty,
}: {
  contracts: number;
  setContracts: (n: number) => void;
  disabled: boolean;
  minQty?: string;
}) {
  const min = (() => {
    if (!minQty) return 1;
    const n = Number(minQty) / 1e6;
    return Number.isFinite(n) && n >= 1 ? Math.ceil(n) : 1;
  })();
  const clamp = (n: number) => Math.max(min, Math.min(100_000, Math.floor(n)));

  return (
    <div className="mt-3 border-t border-rule px-4 pt-3">
      <div className="flex items-baseline justify-between">
        <label htmlFor="kiosk-size" className="text-[10px] uppercase tracking-[0.2em] text-paper-3">
          contracts
        </label>
        {min > 1 ? <span className="numerals text-[10px] text-paper-3">min {min}</span> : null}
      </div>
      <div className="mt-1.5 flex items-stretch gap-2">
        <button
          type="button"
          aria-label="One fewer contract"
          disabled={disabled || contracts <= min}
          onClick={() => setContracts(clamp(contracts - 1))}
          className="key w-10 text-lg leading-none text-paper"
        >
          −
        </button>
        <input
          id="kiosk-size"
          type="number"
          inputMode="numeric"
          min={min}
          step={1}
          disabled={disabled}
          value={contracts}
          onChange={(e) => setContracts(clamp(Number(e.target.value) || min))}
          className="numerals min-w-0 flex-1 rounded-kiosk border border-rule-2 bg-ink px-3 py-2 text-[18px] font-bold text-paper outline-none focus:border-sodium disabled:opacity-45"
        />
        <button
          type="button"
          aria-label="One more contract"
          disabled={disabled}
          onClick={() => setContracts(clamp(contracts + 1))}
          className="key w-10 text-lg leading-none text-paper"
        >
          +
        </button>
      </div>
      <div className="mt-2 flex gap-1.5">
        {QUICK_SIZES.map((n) => (
          <button
            key={n}
            type="button"
            disabled={disabled}
            onClick={() => setContracts(clamp(n))}
            className="numerals key px-2.5 py-1 text-[11px] text-paper-2"
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

function Ticket({
  contracts,
  leg,
  side,
  quote,
  quoteError,
  notional,
  problem,
}: {
  contracts: number;
  leg: Leg | null;
  side: Side;
  quote: Quote | null;
  quoteError: string | null;
  notional: bigint | null;
  problem: string | null;
}) {
  if (!leg) {
    return (
      <p className="mt-3 border-t border-rule px-4 pt-3 text-[11px] leading-relaxed text-paper-3">
        Nothing rests on the {side} side right now, so there is no offer to price against.
      </p>
    );
  }
  if (problem || !notional) {
    return (
      <p className="mt-3 border-t border-rule px-4 pt-3 text-[11px] leading-relaxed text-sodium">
        {problem ?? "This size does not land on the pool's grid."}
      </p>
    );
  }

  const total = quote ? notional + quote.fee : null;
  const payout = BigInt(contracts) * BigInt(1_000_000);
  // The fee is already floor(notional * bps / 10000) on chain, so re-deriving the rate
  // with BigInt division truncates a second time and a 25 bps integrator renders as
  // "24 bps". Round in floating point instead, which recovers the registered rate.
  const feeBps =
    notional > BigInt(0) && quote
      ? Math.round((Number(quote.fee) * 10_000) / Number(notional))
      : null;

  return (
    <dl className="numerals mt-3 space-y-1.5 border-t border-rule px-4 pt-3 text-[12px]">
      <Row label="order" value={`${contracts} × ${formatPrice(leg.pay)}`} />
      <Row label="collateral" value={`${formatCollateral(notional)} tUSDC`} />
      {quote ? (
        <>
          <Row
            label={`routing fee${feeBps !== null ? ` · ${feeBps} bps` : ""}`}
            value={`${formatCollateral(quote.fee)} tUSDC`}
          />
          <Row label="host earns" value={`${formatCollateral(quote.integratorShare)} tUSDC`} accent />
          <div className="tear my-1.5" aria-hidden />
          <Row label="you pay" value={`${formatCollateral(total!)} tUSDC`} strong />
        </>
      ) : quoteError ? (
        <p
          className={`text-[11px] leading-relaxed ${
            quoteError.includes("not deployed") ? "text-sodium" : "text-down"
          }`}
        >
          {quoteError}
        </p>
      ) : (
        <p className="text-[11px] text-paper-3">Pricing the routing fee.</p>
      )}
      <Row label="pays if right" value={`${formatCollateral(payout)} tUSDC`} />
      {leg.depth < contracts ? (
        <p className="pt-1 text-[11px] leading-relaxed text-sodium">
          Only {formatQty(leg.depth)} contracts rest at this price. The order is immediate-or-cancel, so the rest
          simply will not fill.
        </p>
      ) : null}
    </dl>
  );
}

function Row({
  label,
  value,
  strong,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-paper-3">{label}</dt>
      <dd className={strong ? "font-bold text-paper" : accent ? "font-semibold text-sodium" : "text-paper-2"}>
        {value}
      </dd>
    </div>
  );
}

function ActionZone({
  trade,
  setTrade,
  wallet,
  submit,
  finalized,
  expired,
  leg,
  side,
  contracts,
}: {
  trade: Trade;
  setTrade: (t: Trade) => void;
  wallet: ReturnType<typeof useWallet>;
  submit: () => void;
  finalized: boolean;
  expired: boolean;
  leg: Leg | null;
  side: Side;
  contracts: number;
}) {
  const bar = (node: React.ReactNode) => <div className="mt-3 border-t border-rule px-4 py-3">{node}</div>;

  if (trade.status === "done") {
    return bar(
      <>
        <p className="text-[12px] font-semibold text-up">Order placed and routed.</p>
        <dl className="numerals mt-2 space-y-1 text-[11px]">
          <Row label="order id" value={trade.receipt.orderId === null ? "not in receipt" : String(trade.receipt.orderId)} />
          <Row label="notional" value={`${formatCollateral(trade.receipt.notional)} tUSDC`} />
          <Row label="fee routed" value={`${formatCollateral(trade.receipt.fee)} tUSDC`} />
        </dl>
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {trade.receipt.approveHash ? <TxLink label="approve" hash={trade.receipt.approveHash} /> : null}
          <TxLink label="order" hash={trade.receipt.orderHash} />
          <TxLink label="route" hash={trade.receipt.routeHash} />
        </div>
        <button
          type="button"
          onClick={() => setTrade({ status: "idle" })}
          className="key mt-3 w-full py-2 text-[12px] font-semibold text-paper"
        >
          Place another
        </button>
      </>,
    );
  }

  if (finalized) {
    return bar(
      <p className="text-[12px] leading-relaxed text-paper-2">
        This window is settled on chain. Trading reopens when the venue rolls the next one.
      </p>,
    );
  }
  if (expired) {
    return bar(
      <p className="text-[12px] leading-relaxed text-paper-2">
        The window closed. The venue is settling it, and the next one opens on the interval.
      </p>,
    );
  }

  if (wallet.phase === "absent") {
    return bar(
      <>
        <p className="text-[12px] leading-relaxed text-paper-2">
          No injected wallet here. Kiosk never holds the position, so the order has to be signed by you.
        </p>
        <a
          href="https://metamask.io/download/"
          target="_blank"
          rel="noreferrer noopener"
          className="key mt-2 block w-full py-2 text-center text-[12px] font-semibold text-paper"
        >
          Install a wallet
        </a>
      </>,
    );
  }

  if (wallet.phase === "detecting" || wallet.phase === "disconnected" || wallet.phase === "connecting") {
    return bar(
      <>
        <button
          type="button"
          onClick={() => void wallet.connect()}
          disabled={wallet.phase !== "disconnected"}
          className="key key-sodium w-full py-2.5 text-[13px] font-bold tracking-wide"
        >
          {wallet.phase === "connecting" ? "Check your wallet" : "Connect wallet"}
        </button>
        {wallet.error ? <p className="mt-2 text-[11px] leading-relaxed text-down">{wallet.error}</p> : null}
      </>,
    );
  }

  if (wallet.phase === "wrong-network") {
    return bar(
      <>
        <p className="text-[12px] leading-relaxed text-paper-2">
          Wallet is on chain {wallet.chainId}. This market lives on Somnia Shannon, chain {CHAIN_ID}.
        </p>
        <button
          type="button"
          onClick={() => void wallet.switchNetwork()}
          className="key key-sodium mt-2 w-full py-2.5 text-[13px] font-bold tracking-wide"
        >
          Switch to Somnia
        </button>
        {wallet.error ? <p className="mt-2 text-[11px] leading-relaxed text-down">{wallet.error}</p> : null}
      </>,
    );
  }

  const blocked = !leg;

  return bar(
    <>
      <button
        type="button"
        onClick={submit}
        disabled={blocked || trade.status === "working"}
        className="key key-sodium w-full py-2.5 text-[13px] font-bold tracking-wide"
      >
        {trade.status === "working"
          ? trade.note
          : blocked
            ? "No offer to hit"
            : `Buy ${contracts} ${side.toUpperCase()}`}
      </button>
      {trade.status === "working" ? (
        <p className="mt-2 text-[11px] leading-relaxed text-paper-3">
          Your order goes to the venue pool first, then the routing record goes to KioskRouter.
        </p>
      ) : null}
      {trade.status === "failed" ? (
        <>
          <p
            className={`mt-2 text-[11px] leading-relaxed ${
              trade.kind === "rejected" ? "text-paper-2" : "text-down"
            }`}
          >
            {trade.message}
          </p>
          {trade.kind === "collateral" && wallet.address ? <Faucet address={wallet.address} /> : null}
        </>
      ) : null}
      {wallet.address ? (
        <p className="numerals mt-2 text-[11px] text-paper-3">signing as {shortAddress(wallet.address)}</p>
      ) : null}
    </>,
  );
}

function Faucet({ address }: { address: string }) {
  const [state, setState] = useState<{ phase: "idle" | "working" | "done"; note: string | null }>({
    phase: "idle",
    note: null,
  });

  const drip = async () => {
    setState({ phase: "working", note: null });
    try {
      const res = await fetch("/api/faucet", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address }),
      });
      const body = (await res.json()) as { detail?: string; error?: string; sent?: { tusdcDisplay?: string } };
      setState({
        phase: "done",
        note: res.ok
          ? `Sent ${body.sent?.tusdcDisplay ?? "test"} tUSDC. Try the order again.`
          : (body.detail ?? body.error ?? "The faucet refused."),
      });
    } catch (err) {
      setState({ phase: "done", note: (err as Error).message });
    }
  };

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => void drip()}
        disabled={state.phase === "working"}
        className="key w-full py-2 text-[12px] font-semibold text-paper"
      >
        {state.phase === "working" ? "Asking the faucet" : "Get test tUSDC"}
      </button>
      {state.note ? <p className="mt-2 text-[11px] leading-relaxed text-paper-2">{state.note}</p> : null}
    </div>
  );
}

function TxLink({ label, hash }: { label: string; hash: string }) {
  return (
    <a
      href={`${EXPLORER}/tx/${hash}`}
      target="_blank"
      rel="noreferrer noopener"
      className="numerals text-sodium underline decoration-sodium/40 underline-offset-2 hover:decoration-sodium"
    >
      {label} {shortAddress(hash)}
    </a>
  );
}

function Plate({
  code,
  market,
  readAt,
}: {
  code: string;
  market: ApiMarket | null;
  readAt: string | null;
}) {
  return (
    <div className="plate mt-3 flex items-center justify-between gap-2 px-4 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="rivet shrink-0" aria-hidden />
        <span className="min-w-0 truncate">
          {code} · somnia {CHAIN_ID}
          {market ? ` · pool ${shortAddress(market.pool)}` : ""}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {readAt ? <span>read {readAt.slice(11, 19)}</span> : null}
        <span className="rivet" aria-hidden />
      </div>
    </div>
  );
}
