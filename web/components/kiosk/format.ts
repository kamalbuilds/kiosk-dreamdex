import { formatUnits } from "viem";

export const COLLATERAL_DECIMALS = 6;
export const EXPLORER = "https://shannon-explorer.somnia.network";

/** Collateral base units to a short human string. 6205000n -> "6.205" */
export function formatCollateral(raw: bigint, maxFrac = 4): string {
  const s = formatUnits(raw, COLLATERAL_DECIMALS);
  const [whole, frac = ""] = s.split(".");
  const cut = frac.slice(0, maxFrac).replace(/0+$/, "");
  return cut.length ? `${whole}.${cut}` : whole;
}

/** Probability 0..1 rendered the way a book is quoted: 62c */
export function formatCents(p: number): string {
  return `${Math.round(p * 100)}¢`;
}

export function formatPrice(p: number): string {
  return p.toFixed(3).replace(/0$/, "");
}

/** Book depth. Whole contracts stay whole; a partial lot keeps two places. */
export function formatQty(q: number): string {
  if (!Number.isFinite(q)) return "--";
  return Number.isInteger(q) ? String(q) : q.toFixed(2);
}

/** 252_000 -> "04:12". Over an hour -> "1:04:12". */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (x: number) => String(x).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}

/**
 * Pull something a human can act on out of a wallet or RPC rejection. A raw
 * viem error dump in a 320px widget is the same as no error at all.
 */
export function readableError(err: unknown): { kind: TradeErrorKind; message: string } {
  const e = err as
    | { code?: number; shortMessage?: string; details?: string; message?: string; cause?: unknown }
    | undefined;
  const parts: string[] = [];
  const walk = (x: unknown, depth: number) => {
    if (!x || depth > 4) return;
    const o = x as { shortMessage?: string; details?: string; message?: string; reason?: string; cause?: unknown };
    for (const k of ["reason", "shortMessage", "details", "message"] as const) {
      const v = o[k];
      if (typeof v === "string" && v && !parts.includes(v)) parts.push(v);
    }
    walk(o.cause, depth + 1);
  };
  walk(e, 0);
  const blob = parts.join(" | ");
  const low = blob.toLowerCase();

  if (e?.code === 4001 || low.includes("user rejected") || low.includes("user denied")) {
    return { kind: "rejected", message: "You cancelled the signature in your wallet." };
  }
  // 0xd48c4403 is ImmediateOrCancelNoFill(). The ticket sends a taker order, so when
  // nothing rests on the other side the venue rejects it outright rather than leaving
  // it resting. Without this case the raw selector reaches the reader, which is the
  // least useful sentence on the screen.
  if (low.includes("0xd48c4403") || low.includes("immediateorcancelnofill")) {
    return {
      kind: "book",
      message:
        "Nothing is resting on that side right now, so the order found no offer to cross. Try again once the book has a quote.",
    };
  }
  if (low.includes("insufficient allowance") || low.includes("erc20: insufficient allowance")) {
    return { kind: "allowance", message: "The collateral approval did not go through. Approve tUSDC and retry." };
  }
  if (
    low.includes("transfer amount exceeds balance") ||
    low.includes("insufficient balance") ||
    low.includes("insufficient funds") ||
    low.includes("not enough tusdc")
  ) {
    const exact = parts.find((p) => p.toLowerCase().includes("not enough tusdc"));
    return {
      kind: "collateral",
      message: exact ?? "Not enough tUSDC in this wallet to cover the order and the routing fee.",
    };
  }
  if (low.includes("unknownintegrator")) {
    return { kind: "revert", message: "This kiosk code is not registered on KioskRouter." };
  }
  if (low.includes("feetransferfailed")) {
    return { kind: "revert", message: "KioskRouter could not pull the routing fee (FeeTransferFailed)." };
  }
  const first = parts[0];
  return {
    kind: "revert",
    message: first ? first.slice(0, 220) : "The transaction reverted and the node returned no reason string.",
  };
}

export type TradeErrorKind = "rejected" | "allowance" | "collateral" | "book" | "revert";
