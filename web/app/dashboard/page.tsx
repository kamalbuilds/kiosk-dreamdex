import {
  KIND_LABEL,
  codeHash,
  formatUnits6,
  hasRouter,
  publicClient,
  recentRouted,
  routerAddress,
  routerIntegrator,
  routerStats,
  routerTotals,
  type RoutedEvent,
} from "@/lib/kiosk";
import { AutoRefresh } from "./AutoRefresh";

/**
 * The integrator dashboard.
 *
 * Every number on this page is a chain read taken while rendering: the counters
 * come from `KioskRouter.stats`, the split from `integrators`, the feed from
 * `Routed` logs. Nothing is cached and nothing is inferred. When an integrator
 * has routed nothing, the page says so instead of printing a zero that reads
 * like a measurement.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const EXPLORER = "https://shannon-explorer.somnia.network";

/** ~100 seconds of Somnia per 1000-block window. */
const FEED_WINDOWS = 40;

function short(addr: string): string {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border border-neutral-800 bg-neutral-950">
      <h2 className="border-b border-neutral-800 px-3 py-2 text-xs uppercase tracking-[0.2em] text-neutral-500">
        {title}
      </h2>
      <div className="p-3">{children}</div>
    </section>
  );
}

function Figure({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-neutral-800 p-3">
      <div className="text-[11px] uppercase tracking-[0.18em] text-neutral-500">{label}</div>
      <div className="mt-1 text-2xl text-neutral-100 tabular-nums">{value}</div>
      {sub ? <div className="mt-1 text-xs text-neutral-500">{sub}</div> : null}
    </div>
  );
}

function Notice({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <div className="border border-amber-700/60 bg-amber-950/20 p-4">
      <div className="text-sm text-amber-300">{title}</div>
      <div className="mt-2 text-sm leading-relaxed text-neutral-300">{body}</div>
    </div>
  );
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const rawCode = params.code;
  const code = (Array.isArray(rawCode) ? rawCode[0] : rawCode)?.trim().toLowerCase() || "kiosk-demo";

  return (
    <main className="min-h-[100dvh] bg-neutral-950 px-6 py-10 font-mono text-neutral-200">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-3 border-b border-neutral-800 pb-4">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-neutral-500">
              Kiosk · integrator dashboard
            </div>
            <h1 className="mt-1 text-3xl text-neutral-100">{code}</h1>
            <div className="mt-1 text-xs text-neutral-600">
              chain 50312 · Somnia Shannon · code hash {short(codeHash(code))}
            </div>
          </div>
          <AutoRefresh seconds={20} />
        </header>

        {hasRouter() ? (
          <Body code={code} />
        ) : (
          <Notice
            title="Router not deployed"
            body={
              <>
                <code className="text-neutral-100">NEXT_PUBLIC_KIOSK_ROUTER</code> is unset, so there
                is no KioskRouter to read. Deploy{" "}
                <code className="text-neutral-100">contracts/src/KioskRouter.sol</code> and set that
                variable. This page shows nothing rather than placeholder figures, because a zero
                here would be indistinguishable from a real integrator that has not routed yet.
              </>
            }
          />
        )}

        <footer className="border-t border-neutral-800 pt-4 text-xs leading-relaxed text-neutral-600">
          Fees are charged on routed notional, in tUSDC, and split between the integrator payout
          address and the platform at the bps registered on-chain. The trader signs their own
          <span className="text-neutral-400"> placeBinaryOrder </span>
          on the venue pool and their own
          <span className="text-neutral-400"> route </span>
          here, so Kiosk never holds a position.
        </footer>
      </div>
    </main>
  );
}

async function Body({ code }: { code: string }) {
  let stats: Awaited<ReturnType<typeof routerStats>>;
  let integrator: Awaited<ReturnType<typeof routerIntegrator>>;
  let totals: Awaited<ReturnType<typeof routerTotals>>;
  let feed: RoutedEvent[];
  let head: bigint;

  try {
    [stats, integrator, totals, feed, head] = await Promise.all([
      routerStats(code),
      routerIntegrator(code),
      routerTotals(),
      recentRouted(code, FEED_WINDOWS, 25),
      publicClient.getBlockNumber(),
    ]);
  } catch (err) {
    return (
      <Notice
        title="Chain read failed"
        body={
          <>
            KioskRouter at{" "}
            <code className="text-neutral-100">{process.env.NEXT_PUBLIC_KIOSK_ROUTER}</code> did not
            answer: {err instanceof Error ? err.message : String(err)}. Nothing is rendered from
            memory, so this page stays empty until the chain answers.
          </>
        }
      />
    );
  }

  const router = routerAddress();
  const integratorBps = integrator.feeBps - integrator.platformBps;
  const earnedInFeed = feed.reduce((sum, r) => sum + r.integratorShare, BigInt(0));
  const routedOrders = Number(stats.orders);
  const feedMinutes = Math.round((FEED_WINDOWS * 1000 * 0.1) / 60);

  return (
    <div className="space-y-6">
      <Panel title="registration">
        {integrator.active ? (
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <div className="flex justify-between gap-4 border-b border-neutral-900 py-1">
              <dt className="text-neutral-500">payout address</dt>
              <dd className="text-neutral-200">
                <a
                  className="underline decoration-neutral-700 underline-offset-4 hover:decoration-neutral-400"
                  href={`${EXPLORER}/address/${integrator.payout}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {integrator.payout}
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-900 py-1">
              <dt className="text-neutral-500">router</dt>
              <dd className="text-neutral-200">
                <a
                  className="underline decoration-neutral-700 underline-offset-4 hover:decoration-neutral-400"
                  href={`${EXPLORER}/address/${router}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  {router}
                </a>
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-900 py-1">
              <dt className="text-neutral-500">total fee</dt>
              <dd className="text-neutral-200 tabular-nums">
                {integrator.feeBps} bps ({(integrator.feeBps / 100).toFixed(2)}% of notional)
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-neutral-900 py-1">
              <dt className="text-neutral-500">split</dt>
              <dd className="text-neutral-200 tabular-nums">
                {integratorBps} bps you · {integrator.platformBps} bps platform
              </dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm leading-relaxed text-neutral-400">
            <span className="text-amber-300">{code}</span> is not registered on the router at{" "}
            {short(router)}. Until the owner calls{" "}
            <code className="text-neutral-200">setIntegrator(keccak256(&quot;{code}&quot;), …)</code>{" "}
            the router rejects every route under this code, so there is nothing to measure.
          </p>
        )}
      </Panel>

      <Panel title="routed flow">
        {routedOrders === 0 ? (
          <p className="text-sm leading-relaxed text-neutral-400">
            No routed orders yet. The counters on{" "}
            <code className="text-neutral-200">KioskRouter.stats({short(codeHash(code))})</code> read
            zero, which means nothing has been routed under this code, not that the read failed.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure
              label="routed notional"
              value={`${formatUnits6(stats.notional)} tUSDC`}
              sub={`${routedOrders} order${routedOrders === 1 ? "" : "s"}`}
            />
            <Figure
              label="fees charged"
              value={`${formatUnits6(stats.fees)} tUSDC`}
              sub={`${integrator.feeBps} bps of notional, split ${integratorBps}/${integrator.platformBps}`}
            />
            <Figure
              label="your share, recent window"
              value={`${formatUnits6(earnedInFeed)} tUSDC`}
              sub={`summed from ${feed.length} Routed log${feed.length === 1 ? "" : "s"} in the last ~${feedMinutes} min`}
            />
          </div>
        )}
      </Panel>

      <Panel title={`recent Routed events · last ~${feedMinutes} min to block ${head}`}>
        {feed.length === 0 ? (
          <p className="text-sm leading-relaxed text-neutral-400">
            {routedOrders === 0
              ? "No routed orders yet."
              : `The router counts ${routedOrders} routed order${routedOrders === 1 ? "" : "s"} for this code, but none landed inside the last ~${feedMinutes} minutes of blocks scanned here. Somnia caps eth_getLogs at 1000 blocks per call, so this feed is a recent window, not the full history.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs tabular-nums">
              <thead className="text-neutral-500">
                <tr className="border-b border-neutral-800">
                  <th className="py-2 pr-4 font-normal">block</th>
                  <th className="py-2 pr-4 font-normal">trader</th>
                  <th className="py-2 pr-4 font-normal">side</th>
                  <th className="py-2 pr-4 font-normal">price</th>
                  <th className="py-2 pr-4 font-normal">size</th>
                  <th className="py-2 pr-4 font-normal">notional</th>
                  <th className="py-2 pr-4 font-normal">fee</th>
                  <th className="py-2 pr-4 font-normal">your share</th>
                  <th className="py-2 font-normal">tx</th>
                </tr>
              </thead>
              <tbody className="text-neutral-300">
                {feed.map((r) => (
                  <tr key={`${r.txHash}-${r.orderId}`} className="border-b border-neutral-900">
                    <td className="py-2 pr-4 text-neutral-500">{r.blockNumber.toString()}</td>
                    <td className="py-2 pr-4">{short(r.trader)}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={
                          r.kind === 0 || r.kind === 3 ? "text-emerald-400" : "text-orange-400"
                        }
                      >
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </span>
                    </td>
                    <td className="py-2 pr-4">{(Number(r.price) / 1e6).toFixed(3)}</td>
                    <td className="py-2 pr-4">{formatUnits6(r.quantity)}</td>
                    <td className="py-2 pr-4">{formatUnits6(r.notional)}</td>
                    <td className="py-2 pr-4">{formatUnits6(r.fee)}</td>
                    <td className="py-2 pr-4 text-emerald-300">
                      {formatUnits6(r.integratorShare)}
                    </td>
                    <td className="py-2">
                      <a
                        className="underline decoration-neutral-700 underline-offset-4 hover:decoration-neutral-400"
                        href={`${EXPLORER}/tx/${r.txHash}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {short(r.txHash)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Panel title="router totals, every integrator">
        {Number(totals.orders) === 0 ? (
          <p className="text-sm text-neutral-400">
            Nothing has been routed through this router yet.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Figure label="orders" value={totals.orders.toString()} />
            <Figure label="notional" value={`${formatUnits6(totals.notional)} tUSDC`} />
            <Figure label="fees" value={`${formatUnits6(totals.fees)} tUSDC`} />
          </div>
        )}
      </Panel>
    </div>
  );
}
