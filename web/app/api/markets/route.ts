import {
  MIN_SECONDS_BEFORE_EXPIRY,
  formatUnits6,
  listLiveMarkets,
  midProbability,
  readBook,
  readPoolStatus,
} from "@/lib/kiosk";

/**
 * GET /api/markets
 *
 * Live DreamDEX Event Contract markets on Shannon plus the top of each book,
 * every field read from the chain on this request: `MarketCreated` logs for
 * discovery, `getBinaryPoolParams` / `getOrderBookParameters` for tradability,
 * `getBookLevels` for the book. No indexer, no cache.
 *
 * A market whose pool read fails is still returned, flagged `tradable: false`
 * with the reason, rather than dropped silently or padded with a zero price.
 */
export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE = {
  "cache-control": "no-store, no-cache, must-revalidate",
  "content-type": "application/json",
} as const;

export async function GET() {
  try {
    const markets = await listLiveMarkets();
    const now = Math.floor(Date.now() / 1000);

    const rows = await Promise.all(
      markets.map(async (m) => {
        const base = {
          marketId: m.marketId,
          market: m.market,
          pool: m.pool,
          yesId: m.yesId.toString(),
          noId: m.noId.toString(),
          asset: m.asset,
          question: m.question,
          strike: m.strike.toString(),
          strikeDisplay: formatUnits6(m.strike),
          expiry: m.expiry,
          tradingStart: m.tradingStart,
          intervalSec: m.intervalSec,
          secondsToExpiry: m.expiry - now,
        };
        try {
          const [status, book] = await Promise.all([readPoolStatus(m.pool), readBook(m.pool, 5)]);
          const bestBid = book.bids[0] ?? null;
          const bestAsk = book.asks[0] ?? null;
          return {
            ...base,
            // The same bar placeAndRoute enforces, so nothing is offered as
            // tradable that the write path would then refuse.
            tradable: !status.finalized && m.expiry - now > MIN_SECONDS_BEFORE_EXPIRY,
            finalized: status.finalized,
            tick: status.tick.toString(),
            lot: status.lot.toString(),
            minQty: status.minQty.toString(),
            maxBuilderFeeBpsTimes1k: status.maxBuilderFeeBpsTimes1k.toString(),
            expiryNs: status.expiryNs.toString(),
            book: {
              bestBid,
              bestAsk,
              mid: midProbability(book),
              spread: bestBid && bestAsk ? Number((bestAsk.price - bestBid.price).toFixed(6)) : null,
              bids: book.bids,
              asks: book.asks,
            },
          };
        } catch (err) {
          return {
            ...base,
            tradable: false,
            poolReadError: err instanceof Error ? err.message : "pool read failed",
          };
        }
      }),
    );

    return new Response(
      JSON.stringify({ chainId: 50312, readAt: new Date().toISOString(), count: rows.length, markets: rows }),
      { status: 200, headers: NO_STORE },
    );
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: "chain read failed",
        detail: err instanceof Error ? err.message : String(err),
      }),
      { status: 502, headers: NO_STORE },
    );
  }
}
