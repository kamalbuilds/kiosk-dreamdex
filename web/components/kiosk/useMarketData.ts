"use client";

import { useCallback, useEffect, useState } from "react";

export type ApiLevel = { price: number; quantity: number };

export type ApiMarket = {
  marketId: `0x${string}`;
  market: `0x${string}`;
  pool: `0x${string}`;
  asset: string;
  question: string;
  strike: string;
  strikeDisplay: string;
  expiry: number;
  tradingStart: number;
  intervalSec: number;
  secondsToExpiry: number;
  tradable: boolean;
  finalized?: boolean;
  tick?: string;
  lot?: string;
  minQty?: string;
  maxBuilderFeeBpsTimes1k?: string;
  expiryNs?: string;
  book?: {
    bestBid: ApiLevel | null;
    bestAsk: ApiLevel | null;
    mid: number | null;
    spread: number | null;
    bids: ApiLevel[];
    asks: ApiLevel[];
  };
  poolReadError?: string;
};

type Payload = { chainId: number; readAt: string; count: number; markets: ApiMarket[] };

export type Feed = {
  phase: "loading" | "ready" | "none" | "error";
  market: ApiMarket | null;
  readAt: string | null;
  error: string | null;
  reload: () => void;
};

/**
 * Pick the window a trader would actually want: the same asset, still tradable,
 * and the soonest one of those to expire. If none is tradable, keep the nearest
 * one anyway so the widget can say what happened instead of showing nothing.
 */
function choose(rows: ApiMarket[], asset: string): ApiMarket | null {
  const want = asset.trim().toUpperCase();
  const sameAsset = rows.filter((r) => (r.asset ?? "").toUpperCase() === want);
  const pool = sameAsset.length ? sameAsset : rows;
  if (!pool.length) return null;
  const open = pool
    .filter((r) => r.tradable && r.secondsToExpiry > 45)
    .sort((a, b) => a.secondsToExpiry - b.secondsToExpiry);
  if (open.length) return open[0];
  return [...pool].sort((a, b) => b.expiry - a.expiry)[0];
}

/** Reads GET /api/markets, which reads Somnia on every request. No cache. */
export function useMarketData(asset: string, pollMs = 6000): Feed {
  const [phase, setPhase] = useState<Feed["phase"]>("loading");
  const [market, setMarket] = useState<ApiMarket | null>(null);
  const [readAt, setReadAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;

    const tick = async () => {
      try {
        const res = await fetch("/api/markets", { cache: "no-store" });
        const body = (await res.json()) as Payload | { error: string; detail?: string };
        if (!live) return;
        if (!res.ok || "error" in body) {
          const e = body as { error: string; detail?: string };
          setError(e.detail || e.error || `GET /api/markets responded ${res.status}`);
          setPhase("error");
          return;
        }
        const rows = body.markets ?? [];
        setReadAt(body.readAt ?? null);
        const picked = choose(rows, asset);
        setMarket(picked);
        setError(null);
        setPhase(picked ? "ready" : "none");
      } catch (err) {
        if (!live) return;
        setError((err as Error).message || "The market feed could not be reached.");
        setPhase("error");
      }
    };

    void tick();
    const id = window.setInterval(tick, pollMs);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [asset, pollMs, nonce]);

  return { phase, market, readAt, error, reload };
}
