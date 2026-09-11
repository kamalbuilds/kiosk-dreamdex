/**
 * Kiosk — the chain layer.
 *
 * Everything here reads DreamDEX Event Contracts straight from Somnia Shannon
 * (chain 50312) over `eth_call` / `eth_getLogs`. Nothing is read from an indexer,
 * so a down indexer cannot make Kiosk render a stale or invented market.
 *
 * The write path (`placeAndRoute`) runs entirely in the browser against an
 * injected EIP-1193 wallet. The user signs their own `placeBinaryOrder` on the
 * venue's own pool and their own `KioskRouter.route`. Kiosk holds no key, no
 * position and no collateral beyond the routed fee.
 *
 * The project's tsconfig targets ES2017, where `1n` is a syntax error, so every
 * bigint in this file is constructed with `BigInt(...)`.
 */

import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  http,
  keccak256,
  stringToBytes,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { somniaTestnet } from "viem/chains";
import {
  binaryPoolAbi,
  erc20Abi,
  erc6909Abi,
  kioskRouterAbi,
  marketCreatedEvent,
  orderBookEventsAbi,
} from "./abi";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const CHAIN_ID = 50312;

const ZERO = BigInt(0);
const UNIT = BigInt(1);

/**
 * tUSDC, the collateral every Shannon Event Contract pool settles in. Identical
 * to `SOMNIA_TESTNET_ADDRESSES.testUsdc` in @somnia-chain/markets-sdk and to
 * `getBinaryPoolParams().collateralToken` on the live pools; lib/verify.mjs
 * asserts both, so a change in either fails a check instead of silently
 * filtering every market away.
 */
export const COLLATERAL: Address = "0x70a86D8842FB63C4Ad2b7cdddF530eBf1BB25d8E";

/** One whole contract: collateral and outcome tokens are 6-decimals. */
export const ONE = BigInt(1_000_000);

/**
 * Somnia caps `eth_getLogs` at 1000 blocks per call and mines at ~0.1s per
 * block, so one window is ~100 seconds of history. 60 windows is ~100 minutes,
 * which covers the creation of every live market including the 3600s series.
 */
export const LOG_WINDOW = BigInt(1000);
const DISCOVERY_WINDOWS = 60;

/**
 * The venue's builder rail. `maxBuilderFeeBpsTimes1k` reads 0 on every Shannon
 * Event Contract pool today, so an order carrying a non-zero builder fee is not
 * valid and these arguments must be exactly this. They stay threaded through the
 * order path as parameters: the moment the venue raises that cap, the integrator
 * address is passed straight through as `builder` and nothing else changes.
 */
export const ZERO_ADDRESS: Address = "0x0000000000000000000000000000000000000000";
export const DEFAULT_BUILDER: Address = ZERO_ADDRESS;
export const DEFAULT_BUILDER_FEE_BPS_TIMES_1K = ZERO;

/**
 * Refuse to place into a market this close to its expiry (seconds). Exported so
 * anything that renders a market as tradable uses the same bar `placeAndRoute`
 * enforces, instead of offering a trade the write path will refuse.
 */
export const MIN_SECONDS_BEFORE_EXPIRY = 45;

const NS_PER_SEC = BigInt(1_000_000_000);
const GWEI = BigInt(1_000_000_000);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Market = {
  marketId: `0x${string}`;
  market: `0x${string}`;
  pool: `0x${string}`;
  yesId: bigint;
  noId: bigint;
  asset: string;
  question: string;
  strike: bigint;
  expiry: number;
  tradingStart: number;
  intervalSec: number;
};

/** price is probability 0..1, quantity in whole contracts. */
export type BookLevel = { price: number; quantity: number };
export type Book = { bids: BookLevel[]; asks: BookLevel[] };

export type PoolStatus = {
  finalized: boolean;
  expiryNs: bigint;
  maxBuilderFeeBpsTimes1k: bigint;
  tick: bigint;
  lot: bigint;
  minQty: bigint;
};

/**
 * `kind`: 0 BUY_YES, 1 SELL_YES, 2 BUY_NO, 3 SELL_NO.
 *
 * `probability` is ALWAYS the YES probability, for every kind — that is the
 * pool's own convention for the `price` argument. Buying NO at a YES price of
 * 0.40 escrows 0.60 of collateral per contract.
 *
 * `orderType`: 0 LIMIT, 1 FILL_OR_KILL, 2 IOC, 3 POST_ONLY. Defaults to IOC so a
 * widget trade crosses the resting book or does nothing; a POST_ONLY that would
 * cross reverts with PostOnlyWouldCross().
 */
export type TradeParams = {
  market: Market;
  kind: 0 | 1 | 2 | 3;
  probability: number;
  contracts: number;
  code: string;
  orderType?: 0 | 1 | 2 | 3;
};

export type TradeResult = {
  approveHash?: `0x${string}`;
  orderHash: `0x${string}`;
  orderId: bigint | null;
  routeHash: `0x${string}`;
  fee: bigint;
  notional: bigint;
};

export class KioskConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KioskConfigError";
  }
}

export class KioskTradeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KioskTradeError";
  }
}

// ---------------------------------------------------------------------------
// Clients
// ---------------------------------------------------------------------------

/**
 * Shannon's public RPC unless overridden. NEXT_PUBLIC_SOMNIA_RPC_URL is the one
 * the browser can see; RPC_URL is the server-side name the repo's .env.example
 * already uses, and resolves to undefined in the browser bundle.
 */
const RPC_URL =
  process.env.NEXT_PUBLIC_SOMNIA_RPC_URL ||
  process.env.RPC_URL ||
  somniaTestnet.rpcUrls.default.http[0];

export const publicClient = createPublicClient({
  chain: somniaTestnet,
  transport: http(RPC_URL),
  batch: { multicall: true },
}) as PublicClient;

/**
 * The deployed KioskRouter. Set NEXT_PUBLIC_KIOSK_ROUTER to the address printed
 * by `forge script script/Deploy.s.sol`. Every caller goes through this, so an
 * unset env var raises a typed error at the call site instead of reading the
 * zero address and returning zeroes that look like a measurement.
 */
export function routerAddress(): Address {
  const raw = process.env.NEXT_PUBLIC_KIOSK_ROUTER;
  if (!raw || !/^0x[0-9a-fA-F]{40}$/.test(raw)) {
    throw new KioskConfigError(
      "NEXT_PUBLIC_KIOSK_ROUTER is not set to a deployed KioskRouter address. " +
        "Deploy contracts/src/KioskRouter.sol and set that env var.",
    );
  }
  return raw as Address;
}

export function hasRouter(): boolean {
  const raw = process.env.NEXT_PUBLIC_KIOSK_ROUTER;
  return !!raw && /^0x[0-9a-fA-F]{40}$/.test(raw);
}

// ---------------------------------------------------------------------------
// Encoding helpers
// ---------------------------------------------------------------------------

/**
 * keccak256 of the utf8 slug — the same bytes32 the deploy script registers with
 * `keccak256("kiosk-demo")`. Slugs are normalised to trimmed lowercase, so
 * "Kiosk-Demo" and "kiosk-demo " address the same integrator.
 */
export function codeHash(code: string): `0x${string}` {
  return keccak256(stringToBytes(code.trim().toLowerCase()));
}

/** probability 0..1 -> the pool's 1e6 price units, snapped down to a tick. */
export function priceFromProbability(probability: number, tick: bigint): bigint {
  if (!Number.isFinite(probability)) {
    throw new KioskTradeError("probability must be a finite number");
  }
  const raw = BigInt(Math.round(probability * Number(ONE)));
  const snapped = (raw / tick) * tick;
  const max = ONE - tick;
  if (snapped < tick) return tick;
  if (snapped > max) return max;
  return snapped;
}

/** whole contracts -> raw quantity, snapped down to a lot multiple. */
export function quantityFromContracts(contracts: number, lot: bigint, minQty: bigint): bigint {
  if (!Number.isFinite(contracts) || contracts <= 0) {
    throw new KioskTradeError("contracts must be a positive number");
  }
  const raw = BigInt(Math.round(contracts * Number(ONE)));
  const snapped = (raw / lot) * lot;
  if (snapped < minQty) {
    throw new KioskTradeError(
      `size too small: ${contracts} contracts rounds to ${snapped} base units, ` +
        `below the pool minimum of ${minQty}`,
    );
  }
  return snapped;
}

const isBuy = (kind: 0 | 1 | 2 | 3) => kind === 0 || kind === 2;
const isYes = (kind: 0 | 1 | 2 | 3) => kind === 0 || kind === 1;

export const KIND_LABEL = ["BUY_YES", "SELL_YES", "BUY_NO", "SELL_NO"] as const;

/**
 * Collateral the order puts at risk, in the traded outcome's own terms — what
 * the router charges its fee on. A YES side is worth `price` per contract, a NO
 * side `1 - price`, which is exactly the escrow a buy locks in the pool.
 */
export function notionalOf(kind: 0 | 1 | 2 | 3, price: bigint, quantity: bigint): bigint {
  const unit = isYes(kind) ? price : ONE - price;
  return (quantity * unit + ONE - UNIT) / ONE;
}

export function midProbability(book: Book): number | null {
  const bid = book.bids[0]?.price;
  const ask = book.asks[0]?.price;
  if (bid === undefined || ask === undefined) return null;
  return (bid + ask) / 2;
}

/** 6-decimal base units as a plain decimal string. */
export function formatUnits6(v: bigint): string {
  const neg = v < ZERO;
  const abs = neg ? -v : v;
  const whole = abs / ONE;
  const frac = (abs % ONE).toString().padStart(6, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

function windowsBackFrom(head: bigint, count: number): { from: bigint; to: bigint }[] {
  const out: { from: bigint; to: bigint }[] = [];
  for (let i = 0; i < count; i++) {
    const to = head - BigInt(i) * LOG_WINDOW;
    if (to < ZERO) break;
    const from = to - (LOG_WINDOW - UNIT);
    out.push({ from: from < ZERO ? ZERO : from, to });
  }
  return out;
}

type DiscoveryCache = { at: number; markets: Market[] };
let discoveryCache: DiscoveryCache | null = null;
const DISCOVERY_TTL_MS = 8_000;

/**
 * Every tradable Event Contract market, discovered from `MarketCreated` logs.
 *
 * Walks backwards from the head in 1000-block windows (Somnia's getLogs cap),
 * keeps markets whose collateral is tUSDC and whose expiry is still ahead, and
 * sorts soonest-expiring first. A failed window is skipped rather than failing
 * the whole scan, which is also why the result is deduped by marketId.
 */
export async function listLiveMarkets(): Promise<Market[]> {
  const now = Date.now();
  if (discoveryCache && now - discoveryCache.at < DISCOVERY_TTL_MS) {
    return discoveryCache.markets;
  }

  const head = await publicClient.getBlockNumber();
  const batches = await Promise.all(
    windowsBackFrom(head, DISCOVERY_WINDOWS).map((w) =>
      publicClient
        .getLogs({ event: marketCreatedEvent, fromBlock: w.from, toBlock: w.to })
        .catch(() => []),
    ),
  );

  const nowSec = Math.floor(now / 1000);
  const seen = new Map<string, Market>();
  for (const logs of batches) {
    for (const log of logs) {
      const a = log.args;
      if (!a.marketId || !a.pool || !a.market || a.expiry === undefined) continue;
      if (a.collateral?.toLowerCase() !== COLLATERAL.toLowerCase()) continue;
      if (Number(a.expiry) <= nowSec) continue;
      seen.set(a.marketId, {
        marketId: a.marketId,
        market: a.market,
        pool: a.pool,
        yesId: a.yesId ?? ZERO,
        noId: a.noId ?? ZERO,
        asset: a.asset ?? "",
        question: a.question ?? "",
        strike: a.strike ?? ZERO,
        expiry: Number(a.expiry),
        tradingStart: Number(a.tradingStart ?? ZERO),
        intervalSec: Number(a.intervalSec ?? ZERO),
      });
    }
  }

  const markets = [...seen.values()].sort(
    (a, b) => a.expiry - b.expiry || a.intervalSec - b.intervalSec || a.asset.localeCompare(b.asset),
  );
  discoveryCache = { at: now, markets };
  return markets;
}

/** Both sides of a pool's resting book, in probability / whole-contract units. */
export async function readBook(pool: `0x${string}`, levels = 5): Promise<Book> {
  const depth = BigInt(Math.max(1, Math.floor(levels)));
  const [rawBids, rawAsks] = await Promise.all([
    publicClient.readContract({
      address: pool,
      abi: binaryPoolAbi,
      functionName: "getBookLevels",
      args: [true, depth],
    }),
    publicClient.readContract({
      address: pool,
      abi: binaryPoolAbi,
      functionName: "getBookLevels",
      args: [false, depth],
    }),
  ]);
  const toLevel = (l: { price: bigint; quantity: bigint }): BookLevel => ({
    price: Number(l.price) / Number(ONE),
    quantity: Number(l.quantity) / Number(ONE),
  });
  return { bids: rawBids.map(toLevel), asks: rawAsks.map(toLevel) };
}

/**
 * The pool's tradability and its order-book grid. `finalized` and `expiryNs` are
 * the two facts that decide whether an order can be placed at all; an expiry in
 * the future is not by itself enough.
 */
export async function readPoolStatus(pool: `0x${string}`): Promise<PoolStatus> {
  const [params, book, expiryNs] = await Promise.all([
    publicClient.readContract({
      address: pool,
      abi: binaryPoolAbi,
      functionName: "getBinaryPoolParams",
    }),
    publicClient.readContract({
      address: pool,
      abi: binaryPoolAbi,
      functionName: "getOrderBookParameters",
    }),
    publicClient.readContract({ address: pool, abi: binaryPoolAbi, functionName: "marketExpiryNs" }),
  ]);
  return {
    finalized: params.finalized,
    expiryNs,
    maxBuilderFeeBpsTimes1k: params.maxBuilderFeeBpsTimes1k,
    tick: book.tickSize,
    lot: book.lotSize,
    minQty: book.minQuantity,
  };
}

/** The pool's collateral and outcome-token ids, needed to escrow an order. */
export async function readPoolTokens(pool: `0x${string}`): Promise<{
  collateral: Address;
  outcomeToken: Address;
  yesId: bigint;
  noId: bigint;
  oneCollateral: bigint;
}> {
  const p = await publicClient.readContract({
    address: pool,
    abi: binaryPoolAbi,
    functionName: "getBinaryPoolParams",
  });
  return {
    collateral: p.collateralToken,
    outcomeToken: p.outcomeToken,
    yesId: p.yesId,
    noId: p.noId,
    oneCollateral: p.oneCollateral,
  };
}

export async function quoteFee(
  code: string,
  notionalRaw: bigint,
): Promise<{ fee: bigint; integratorShare: bigint; platformShare: bigint }> {
  const [fee, integratorShare, platformShare] = await publicClient.readContract({
    address: routerAddress(),
    abi: kioskRouterAbi,
    functionName: "quote",
    args: [codeHash(code), notionalRaw],
  });
  return { fee, integratorShare, platformShare };
}

export async function routerStats(code: string): Promise<{
  notional: bigint;
  fees: bigint;
  orders: bigint;
  payout: `0x${string}`;
  feeBps: number;
  active: boolean;
}> {
  const [notional, fees, orders, payout, feeBps, active] = await publicClient.readContract({
    address: routerAddress(),
    abi: kioskRouterAbi,
    functionName: "stats",
    args: [codeHash(code)],
  });
  return { notional, fees, orders, payout, feeBps: Number(feeBps), active };
}

/** The full registration for a code, including the platform half of the split. */
export async function routerIntegrator(code: string): Promise<{
  payout: `0x${string}`;
  feeBps: number;
  platformBps: number;
  active: boolean;
}> {
  const [payout, feeBps, platformBps, active] = await publicClient.readContract({
    address: routerAddress(),
    abi: kioskRouterAbi,
    functionName: "integrators",
    args: [codeHash(code)],
  });
  return { payout, feeBps: Number(feeBps), platformBps: Number(platformBps), active };
}

export async function routerTotals(): Promise<{ notional: bigint; fees: bigint; orders: bigint }> {
  const router = routerAddress();
  const [notional, fees, orders] = await Promise.all([
    publicClient.readContract({
      address: router,
      abi: kioskRouterAbi,
      functionName: "totalNotional",
    }),
    publicClient.readContract({ address: router, abi: kioskRouterAbi, functionName: "totalFees" }),
    publicClient.readContract({ address: router, abi: kioskRouterAbi, functionName: "totalOrders" }),
  ]);
  return { notional, fees, orders };
}

export type RoutedEvent = {
  blockNumber: bigint;
  txHash: `0x${string}`;
  trader: `0x${string}`;
  pool: `0x${string}`;
  orderId: bigint;
  kind: number;
  price: bigint;
  quantity: bigint;
  notional: bigint;
  fee: bigint;
  integratorShare: bigint;
};

const routedEventAbi = kioskRouterAbi.filter(
  (item): item is Extract<(typeof kioskRouterAbi)[number], { type: "event" }> =>
    item.type === "event" && item.name === "Routed",
);

/**
 * Recent `Routed` events on the router, newest first, optionally scoped to one
 * integrator code. Scans backwards from the head in 1000-block windows like
 * market discovery; each window is ~100 seconds of Somnia chain time.
 */
export async function recentRouted(
  code: string | null,
  windows = 60,
  limit = 25,
): Promise<RoutedEvent[]> {
  const router = routerAddress();
  const head = await publicClient.getBlockNumber();
  const event = routedEventAbi[0];

  const batches = await Promise.all(
    windowsBackFrom(head, windows).map((w) =>
      publicClient
        .getLogs({
          address: router,
          event,
          args: code ? { code: codeHash(code) } : {},
          fromBlock: w.from,
          toBlock: w.to,
        })
        .catch(() => []),
    ),
  );

  const rows: RoutedEvent[] = [];
  for (const logs of batches) {
    for (const log of logs) {
      const a = log.args;
      if (a.orderId === undefined || !a.trader || !a.pool) continue;
      rows.push({
        blockNumber: log.blockNumber ?? ZERO,
        txHash: log.transactionHash ?? "0x",
        trader: a.trader,
        pool: a.pool,
        orderId: a.orderId,
        kind: Number(a.kind ?? ZERO),
        price: a.price ?? ZERO,
        quantity: a.quantity ?? ZERO,
        notional: a.notional ?? ZERO,
        fee: a.fee ?? ZERO,
        integratorShare: a.integratorShare ?? ZERO,
      });
    }
  }
  rows.sort((a, b) => Number(b.blockNumber - a.blockNumber));
  return rows.slice(0, limit);
}

// ---------------------------------------------------------------------------
// Write path — browser wallet only
// ---------------------------------------------------------------------------

/** The slice of EIP-1193 Kiosk uses. Deliberately minimal: no wallet SDK. */
type InjectedProvider = {
  request: (args: { method: string; params?: unknown }) => Promise<unknown>;
};

function injectedProvider(): InjectedProvider {
  const w = globalThis as { ethereum?: InjectedProvider };
  if (typeof window === "undefined" || !w.ethereum) {
    throw new KioskTradeError(
      "No injected wallet found. Kiosk never signs for you: install a wallet and connect it.",
    );
  }
  return w.ethereum;
}

/**
 * Somnia prices state creation far above Ethereum and enforces a ~6 gwei minimum
 * base fee, so fees are read from the chain and given real headroom rather than
 * pinned to an Ethereum number.
 */
export async function suggestedFees(): Promise<{
  maxFeePerGas: bigint;
  maxPriorityFeePerGas: bigint;
}> {
  const block = await publicClient.getBlock({ blockTag: "latest" });
  const base = block.baseFeePerGas ?? GWEI * BigInt(6);
  const estimated = await publicClient.estimateMaxPriorityFeePerGas().catch(() => GWEI);
  const tip = estimated > ZERO ? estimated : GWEI;
  return { maxFeePerGas: base * BigInt(3) + tip, maxPriorityFeePerGas: tip };
}

type ContractCall = {
  address: Address;
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
};

/**
 * Estimate, then send from the user's own wallet. The estimate is what catches a
 * revert before the signature prompt; the 30% headroom covers Somnia's
 * state-creation pricing on a first write to fresh storage.
 */
async function sendFromWallet(
  wallet: WalletClient,
  account: Address,
  call: ContractCall,
): Promise<`0x${string}`> {
  const gas = await publicClient.estimateContractGas({
    account,
    ...call,
  } as Parameters<typeof publicClient.estimateContractGas>[0]);
  const fees = await suggestedFees();
  return wallet.writeContract({
    ...call,
    account,
    chain: somniaTestnet,
    gas: (gas * BigInt(13)) / BigInt(10),
    ...fees,
  } as Parameters<typeof wallet.writeContract>[0]);
}

/** Ensure the wallet is on Shannon, asking it to switch, or add, the chain. */
async function ensureChain(provider: InjectedProvider): Promise<void> {
  const current = await provider.request({ method: "eth_chainId" });
  if (parseInt(String(current), 16) === CHAIN_ID) return;

  const hexId = `0x${CHAIN_ID.toString(16)}`;
  try {
    await provider.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: hexId }],
    });
  } catch (err) {
    const code = (err as { code?: number })?.code;
    if (code !== 4902) throw err;
    await provider.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: hexId,
          chainName: somniaTestnet.name,
          nativeCurrency: somniaTestnet.nativeCurrency,
          rpcUrls: [RPC_URL],
          blockExplorerUrls: [somniaTestnet.blockExplorers.default.url],
        },
      ],
    });
  }

  const after = await provider.request({ method: "eth_chainId" });
  if (parseInt(String(after), 16) !== CHAIN_ID) {
    throw new KioskTradeError(`Wallet is not on Somnia Shannon (chain ${CHAIN_ID}).`);
  }
}

/**
 * Recover the order id from the receipt. `placeBinaryOrder`'s return value is
 * not readable from a mined transaction, so the id comes from the pool's own
 * `OrderPlaced`, or from `OrderFilled` when the order crossed immediately. Null
 * when neither is present, which is honest: no id was recoverable.
 */
function orderIdFromReceipt(
  logs: readonly { address: string; topics: readonly string[]; data: string }[],
  pool: Address,
): bigint | null {
  let filledTaker: bigint | null = null;
  for (const log of logs) {
    if (log.address.toLowerCase() !== pool.toLowerCase()) continue;
    try {
      const decoded = decodeEventLog({
        abi: orderBookEventsAbi,
        data: log.data as Hex,
        topics: log.topics as [Hex, ...Hex[]],
      });
      if (decoded.eventName === "OrderPlaced") return decoded.args.orderId;
      if (decoded.eventName === "OrderFilled" && filledTaker === null) {
        filledTaker = decoded.args.takerOrderId;
      }
    } catch {
      // Not an order-book event we model. Pools also emit settlement and
      // ERC-6909 transfer logs, and those carry no order id.
    }
  }
  return filledTaker;
}

/**
 * Place the user's own order on the venue, then record the referral on the
 * router. Both transactions are signed by the user's wallet.
 *
 * Order of operations, and why each step is there:
 *   1. force the wallet onto chain 50312
 *   2. refuse a finalized or about-to-expire pool (a future expiry alone does
 *      not make a market tradable)
 *   3. snap price to tickSize and quantity to lotSize, because the pool rejects
 *      anything off its grid
 *   4. authorise the escrow the pool pulls: a collateral allowance for a buy, an
 *      ERC-6909 operator grant on the outcome singleton for a sell
 *   5. send `placeBinaryOrder` with the pool's own `marketExpiryNs()` as the
 *      order expiry (nanoseconds; beyond it the pool reverts 0xd3dea628)
 *   6. approve the router for the fee if the allowance is short, then `route`
 *
 * `approveHash` is whichever authorisation this trade had to send: the pool
 * escrow approval or operator grant when one was needed, otherwise the router
 * fee approval. It is absent when both were already in place.
 */
export async function placeAndRoute(params: TradeParams): Promise<TradeResult> {
  const router = routerAddress();
  const provider = injectedProvider();
  await ensureChain(provider);

  const accounts = (await provider.request({ method: "eth_requestAccounts" })) as Address[];
  const account = accounts?.[0];
  if (!account) throw new KioskTradeError("Wallet returned no account.");

  const wallet = createWalletClient({
    chain: somniaTestnet,
    transport: custom(provider),
  }) as WalletClient;
  const pool = params.market.pool;

  // 2. Is this pool actually tradable right now?
  const status = await readPoolStatus(pool);
  if (status.finalized) {
    throw new KioskTradeError("This market is finalized. Nothing can be traded into it.");
  }
  const expirySec = Number(status.expiryNs / NS_PER_SEC);
  const secondsLeft = expirySec - Math.floor(Date.now() / 1000);
  if (secondsLeft <= MIN_SECONDS_BEFORE_EXPIRY) {
    throw new KioskTradeError(
      `This market expires in ${Math.max(0, secondsLeft)}s. Pick one with more time on it.`,
    );
  }

  // 3. Snap to the pool's grid.
  const price = priceFromProbability(params.probability, status.tick);
  const quantity = quantityFromContracts(params.contracts, status.lot, status.minQty);
  const notional = notionalOf(params.kind, price, quantity);

  // 4. Authorise the escrow the pool pulls from the user.
  const tokens = await readPoolTokens(pool);
  let approveHash: `0x${string}` | undefined;

  if (isBuy(params.kind)) {
    const unit = isYes(params.kind) ? price : ONE - price;
    const escrow = (quantity * unit + ONE - UNIT) / ONE;
    const [balance, allowance] = await Promise.all([
      publicClient.readContract({
        address: tokens.collateral,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [account],
      }),
      publicClient.readContract({
        address: tokens.collateral,
        abi: erc20Abi,
        functionName: "allowance",
        args: [account, pool],
      }),
    ]);
    if (balance < escrow) {
      throw new KioskTradeError(
        `Not enough tUSDC: this order escrows ${formatUnits6(escrow)} and the wallet holds ` +
          `${formatUnits6(balance)}.`,
      );
    }
    if (allowance < escrow) {
      approveHash = await sendFromWallet(wallet, account, {
        address: tokens.collateral,
        abi: erc20Abi,
        functionName: "approve",
        args: [pool, escrow],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  } else {
    const id = isYes(params.kind) ? tokens.yesId : tokens.noId;
    const [held, isOperator] = await Promise.all([
      publicClient.readContract({
        address: tokens.outcomeToken,
        abi: erc6909Abi,
        functionName: "balanceOf",
        args: [account, id],
      }),
      publicClient.readContract({
        address: tokens.outcomeToken,
        abi: erc6909Abi,
        functionName: "isOperator",
        args: [account, pool],
      }),
    ]);
    if (held < quantity) {
      throw new KioskTradeError(
        `Not enough ${isYes(params.kind) ? "Up" : "Down"} contracts to sell: need ` +
          `${formatUnits6(quantity)}, hold ${formatUnits6(held)}.`,
      );
    }
    if (!isOperator) {
      approveHash = await sendFromWallet(wallet, account, {
        address: tokens.outcomeToken,
        abi: erc6909Abi,
        functionName: "setOperator",
        args: [pool, true],
      });
      await publicClient.waitForTransactionReceipt({ hash: approveHash });
    }
  }

  // 5. The user's own order, on the venue's own pool.
  const orderHash = await sendFromWallet(wallet, account, {
    address: pool,
    abi: binaryPoolAbi,
    functionName: "placeBinaryOrder",
    args: [
      params.kind,
      price,
      quantity,
      status.expiryNs,
      params.orderType ?? 2,
      0,
      DEFAULT_BUILDER,
      DEFAULT_BUILDER_FEE_BPS_TIMES_1K,
      ZERO,
    ],
  });
  const orderReceipt = await publicClient.waitForTransactionReceipt({ hash: orderHash });
  if (orderReceipt.status !== "success") {
    throw new KioskTradeError(`Order transaction reverted: ${orderHash}`);
  }
  const orderId = orderIdFromReceipt(orderReceipt.logs, pool);

  // 6. Pay the referral fee and record the route.
  const { fee } = await quoteFee(params.code, notional);
  if (fee > ZERO) {
    const allowance = await publicClient.readContract({
      address: tokens.collateral,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, router],
    });
    if (allowance < fee) {
      const feeApproveHash = await sendFromWallet(wallet, account, {
        address: tokens.collateral,
        abi: erc20Abi,
        functionName: "approve",
        args: [router, fee],
      });
      await publicClient.waitForTransactionReceipt({ hash: feeApproveHash });
      approveHash = approveHash ?? feeApproveHash;
    }
  }

  const routeHash = await sendFromWallet(wallet, account, {
    address: router,
    abi: kioskRouterAbi,
    functionName: "route",
    args: [codeHash(params.code), pool, orderId ?? ZERO, params.kind, price, quantity, notional],
  });
  const routeReceipt = await publicClient.waitForTransactionReceipt({ hash: routeHash });
  if (routeReceipt.status !== "success") {
    throw new KioskTradeError(`Route transaction reverted: ${routeHash}`);
  }

  return { approveHash, orderHash, orderId, routeHash, fee, notional };
}
