import {
  codeHash,
  formatUnits6,
  hasRouter,
  routerAddress,
  routerIntegrator,
  routerStats,
  routerTotals,
} from "@/lib/kiosk";

/**
 * GET /api/stats?code=slug
 *
 * One integrator's routed notional, fees and order count, plus the router-wide
 * totals, read from KioskRouter on Shannon at request time.
 *
 * With NEXT_PUBLIC_KIOSK_ROUTER unset there is no contract to read, so this
 * answers 503. It never substitutes zeroes, because a zero here would be
 * indistinguishable from a real integrator that has not routed yet.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "content-type": "application/json",
} as const;

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim().toLowerCase() ?? "";
  if (!code) {
    return new Response(
      JSON.stringify({ error: "missing code", detail: "Pass ?code=<integrator slug>." }),
      { status: 400, headers: NO_STORE },
    );
  }

  if (!hasRouter()) {
    return new Response(
      JSON.stringify({
        error: "router not deployed",
        detail:
          "NEXT_PUBLIC_KIOSK_ROUTER is unset, so there is no contract to read. " +
          "Deploy KioskRouter and set that env var.",
      }),
      { status: 503, headers: NO_STORE },
    );
  }

  try {
    const [stats, integrator, totals] = await Promise.all([
      routerStats(code),
      routerIntegrator(code),
      routerTotals(),
    ]);

    return new Response(
      JSON.stringify({
        chainId: 50312,
        router: routerAddress(),
        readAt: new Date().toISOString(),
        code,
        codeHash: codeHash(code),
        registered: integrator.active,
        integrator: {
          payout: integrator.payout,
          feeBps: integrator.feeBps,
          platformBps: integrator.platformBps,
          integratorBps: integrator.feeBps - integrator.platformBps,
          active: integrator.active,
        },
        routed: {
          orders: Number(stats.orders),
          notional: stats.notional.toString(),
          notionalDisplay: formatUnits6(stats.notional),
          fees: stats.fees.toString(),
          feesDisplay: formatUnits6(stats.fees),
        },
        totals: {
          orders: Number(totals.orders),
          notional: totals.notional.toString(),
          notionalDisplay: formatUnits6(totals.notional),
          fees: totals.fees.toString(),
          feesDisplay: formatUnits6(totals.fees),
        },
      }),
      { status: 200, headers: NO_STORE },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "router read failed",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: NO_STORE },
    );
  }
}
