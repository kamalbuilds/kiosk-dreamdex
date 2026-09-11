import { parseAbi } from "viem";

/**
 * DreamDEX Event Contract ABIs, verified against Shannon testnet (chain 50312).
 *
 * The struct-carrying pool reads are transcribed from
 * ec-dreamdex-hackathon-template/solidity/src/IEventContracts.sol and confirmed by
 * live `eth_call` against pool 0x4143cD6dcBAc98D05a7e0406947d46Eb14651EC9.
 */
export const binaryPoolAbi = parseAbi([
  "struct OrderBookLevel { uint256 price; uint256 quantity; }",
  "struct BinaryPoolParams { address collateralToken; address market; address outcomeToken; uint256 yesId; uint256 noId; uint256 oneCollateral; uint256 setBacking; address feeRecipient; uint256 makerFeeBpsTimes1k; uint256 takerFeeBpsTimes1k; uint256 maxBuilderFeeBpsTimes1k; uint256 settlementFeeBpsTimes1k; address settlement; uint64 marketNonce; bool finalized; }",
  "struct OrderBookParams { uint256 tickSize; uint256 minQuantity; uint256 lotSize; }",
  "function getBookLevels(bool isBid, uint64 numLevels) view returns (OrderBookLevel[])",
  "function getBinaryPoolParams() view returns (BinaryPoolParams)",
  "function getOrderBookParameters() view returns (OrderBookParams)",
  "function marketExpiryNs() view returns (uint64)",
  "function finalized() view returns (bool)",
  // `price` is ALWAYS the YES-side price, for every kind: BUY_YES escrows
  // quantity*price, BUY_NO escrows quantity*(oneCollateral-price).
  // builderFeeBpsTimes1k must stay uint96 — it is selector-critical.
  "function placeBinaryOrder(uint8 kind, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k, uint64 userData) payable returns (bool success, uint128 id)",
  "function cancelOrder(uint128 orderId)",
  "function getWithdrawableBalance(address owner, address token) view returns (uint256)",
]);

/**
 * The order-book events a pool emits. `OrderPlaced` is the only place a receipt
 * carries the new order's id: `placeBinaryOrder`'s return value is unreadable
 * from a mined transaction.
 */
export const orderBookEventsAbi = parseAbi([
  "struct PlacedOrder { uint128 orderId; bool isBid; address owner; uint64 userData; uint256 price; uint256 fullQuantity; uint256 quantityRemaining; uint64 expireTimestampNs; }",
  "event OrderPlaced(uint128 indexed orderId, PlacedOrder placedOrder)",
  "event OrderFilled(uint128 indexed takerOrderId, uint128 indexed makerOrderId, uint256 quantityFilled, uint256 takerRemainingQuantity, uint256 makerRemainingQuantity, uint256 fillPrice)",
]);

/**
 * MarketCreated as emitted by the MarketCreator. Field-for-field identical to
 * `marketCreatorEventsAbi` in @somnia-chain/markets-sdk/dist/eventsAbi.js; that
 * module is not reachable through the package's `exports` map, so the event is
 * declared here instead of deep-imported. lib/verify.mjs asserts the two topic0
 * hashes match, so a drift in the SDK fails a check rather than silently
 * returning an empty market list.
 */
export const marketCreatedEvent = {
  type: "event",
  name: "MarketCreated",
  anonymous: false,
  inputs: [
    { name: "marketId", type: "bytes32", indexed: true },
    { name: "market", type: "address", indexed: true },
    { name: "pool", type: "address", indexed: true },
    { name: "yesId", type: "uint256", indexed: false },
    { name: "noId", type: "uint256", indexed: false },
    { name: "collateral", type: "address", indexed: false },
    { name: "asset", type: "string", indexed: false },
    { name: "strike", type: "uint256", indexed: false },
    { name: "tradingStart", type: "uint64", indexed: false },
    { name: "expiry", type: "uint64", indexed: false },
    { name: "oracleQuestionId", type: "uint256", indexed: false },
    { name: "question", type: "string", indexed: false },
    { name: "intervalSec", type: "uint64", indexed: false },
  ],
} as const;

/** KioskRouter, from contracts/src/KioskRouter.sol. */
export const kioskRouterAbi = parseAbi([
  "function route(bytes32 code, address pool, uint128 orderId, uint8 kind, uint256 price, uint256 quantity, uint256 notional) returns (uint256 fee)",
  "function quote(bytes32 code, uint256 notional) view returns (uint256 fee, uint256 integratorShare, uint256 platformShare)",
  "function stats(bytes32 code) view returns (uint256 notional, uint256 fees, uint256 orders, address payout, uint16 feeBps, bool active)",
  "function integrators(bytes32 code) view returns (address payout, uint16 feeBps, uint16 platformBps, bool active)",
  "function totalNotional() view returns (uint256)",
  "function totalFees() view returns (uint256)",
  "function totalOrders() view returns (uint256)",
  "function collateral() view returns (address)",
  "function platformPayout() view returns (address)",
  "event Routed(bytes32 indexed code, address indexed trader, address indexed pool, uint128 orderId, uint8 kind, uint256 price, uint256 quantity, uint256 notional, uint256 fee, uint256 integratorShare)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function transfer(address to, uint256 amount) returns (bool)",
  "function decimals() view returns (uint8)",
]);

/** The ERC-6909 singleton that holds every market's Up/Down as token ids. */
export const erc6909Abi = parseAbi([
  "function balanceOf(address owner, uint256 id) view returns (uint256)",
  "function isOperator(address owner, address spender) view returns (bool)",
  "function setOperator(address spender, bool approved) returns (bool)",
]);
