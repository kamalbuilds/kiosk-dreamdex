"use client";

import { useEffect, useState } from "react";

type Stats = {
  router: `0x${string}`;
  readAt: string;
  code: string;
  registered: boolean;
  integrator: { payout: string; feeBps: number; platformBps: number; integratorBps: number; active: boolean };
  routed: { orders: number; notionalDisplay: string; feesDisplay: string };
  totals: { orders: number; notionalDisplay: string; feesDisplay: string };
};

type State =
  | { phase: "loading" }
  | { phase: "ok"; data: Stats }
  | { phase: "down"; reason: string };

export function RouterStats({ code }: { code: string }) {
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    let live = true;
    fetch(`/api/stats?code=${encodeURIComponent(code)}`, { cache: "no-store" })
      .then(async (res) => {
        const body = (await res.json()) as Stats | { error: string; detail?: string };
        if (!res.ok || "error" in body) {
          const e = body as { error: string; detail?: string };
          throw new Error(e.detail || e.error);
        }
        return body;
      })
      .then((data) => {
        if (live) setState({ phase: "ok", data });
      })
      .catch((err: Error) => {
        if (live) setState({ phase: "down", reason: err.message });
      });
    return () => {
      live = false;
    };
  }, [code]);

  if (state.phase === "loading") {
    return (
      <div className="rounded-kiosk border border-rule bg-ink-2 px-4 py-5 text-[13px] text-paper-3">
        Reading KioskRouter for {code}.
      </div>
    );
  }

  if (state.phase === "down") {
    return (
      <div className="rounded-kiosk border border-rule bg-ink-2 px-4 py-5">
        <p className="text-[13px] leading-relaxed text-paper-2">
          KioskRouter is not readable from here right now: {state.reason}
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-paper-3">
          Nothing is shown in place of the counters, because a zero here would be indistinguishable
          from a real code that has not routed yet.
        </p>
      </div>
    );
  }

  const { data } = state;
  const rows = [
    { k: "orders routed", v: String(data.routed.orders) },
    { k: "notional", v: data.routed.notionalDisplay },
    { k: "fees", v: data.routed.feesDisplay },
  ];

  return (
    <div>
      <dl className="grid grid-cols-3 gap-px overflow-hidden rounded-kiosk border border-rule bg-rule">
        {rows.map((row) => (
          <div key={row.k} className="bg-ink-2 px-3 py-3 sm:px-4">
            <dt className="text-[10px] uppercase tracking-[0.16em] text-paper-3">{row.k}</dt>
            <dd className="numerals mt-1 text-[20px] leading-none font-bold text-paper">{row.v}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[12px] leading-relaxed text-paper-3">
        {data.registered
          ? `${data.code} is registered at ${data.integrator.feeBps} bps, ${data.integrator.integratorBps} of which is the host share.`
          : `${data.code} is not registered on this router.`}{" "}
        {data.routed.orders === 0
          ? "It has routed no orders yet, so these counters stay at zero until one lands."
          : `Router-wide: ${data.totals.orders} orders, ${data.totals.feesDisplay} tUSDC in fees.`}
      </p>
    </div>
  );
}
