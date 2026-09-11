// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal surface of the collateral token (tUSDC is 6-decimals).
interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

/// @title KioskRouter
/// @notice The attribution and revenue rail for DreamDEX Event Contract order flow.
///
/// DreamDEX already designed a pay-the-router fee into the venue: every
/// `placeBinaryOrder` carries `(address builder, uint96 builderFeeBpsTimes1k)` and
/// each pool publishes `maxBuilderFeeBpsTimes1k`. Read on-chain 2026-09-11, that cap
/// is 0 on Event Contract pools on both Shannon testnet (block 485483251) and Somnia
/// mainnet (block 409688211) — the rail is wired but switched off.
///
/// Kiosk does not wait for that switch. An integrator embeds the widget, their
/// audience trades from their own wallets against the venue's own pools, and this
/// router takes a small fee in collateral and splits it with the integrator. The
/// order itself is never custodied here: the user signs `placeBinaryOrder` on the
/// pool themselves, so Kiosk can never hold, move, or misdirect a position. This
/// contract only prices and records the referral.
///
/// When the venue raises `maxBuilderFeeBpsTimes1k`, the same integrator address is
/// passed straight through as the `builder` argument and the venue pays it directly;
/// nothing here has to change.
contract KioskRouter {
    /// @dev Fees are bps of routed notional. 100 bps = 1%.
    uint16 public constant MAX_FEE_BPS = 100;
    uint16 public constant BPS = 10_000;

    struct Integrator {
        address payout;      // where the integrator's share lands
        uint16  feeBps;      // total fee charged on routed notional
        uint16  platformBps; // portion of feeBps that goes to the platform
        bool    active;
    }

    address public owner;
    address public platformPayout;
    IERC20  public immutable collateral;

    mapping(bytes32 => Integrator) public integrators;
    mapping(bytes32 => uint256) public routedNotional;
    mapping(bytes32 => uint256) public routedFees;
    mapping(bytes32 => uint256) public routedOrders;
    uint256 public totalNotional;
    uint256 public totalFees;
    uint256 public totalOrders;

    /// @notice One routed order. `pool` and `orderId` are the user's own order on the
    ///         venue, reported so an indexer can reconcile every fee against a real
    ///         fill rather than trusting this contract's own count.
    event Routed(
        bytes32 indexed code,
        address indexed trader,
        address indexed pool,
        uint128 orderId,
        uint8   kind,
        uint256 price,
        uint256 quantity,
        uint256 notional,
        uint256 fee,
        uint256 integratorShare
    );
    event IntegratorSet(bytes32 indexed code, address payout, uint16 feeBps, uint16 platformBps);
    event IntegratorDisabled(bytes32 indexed code);

    error NotOwner();
    error UnknownIntegrator();
    error FeeTooHigh();
    error BadSplit();
    error ZeroPayout();
    error FeeTransferFailed();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(address collateral_, address platformPayout_) {
        owner = msg.sender;
        collateral = IERC20(collateral_);
        platformPayout = platformPayout_;
    }

    /// @notice Register or update an integrator. `code` is the public slug the widget
    ///         is embedded with (e.g. keccak("degen-lounge")).
    function setIntegrator(bytes32 code, address payout, uint16 feeBps, uint16 platformBps)
        external
        onlyOwner
    {
        if (payout == address(0)) revert ZeroPayout();
        if (feeBps > MAX_FEE_BPS) revert FeeTooHigh();
        if (platformBps > feeBps) revert BadSplit();
        integrators[code] = Integrator(payout, feeBps, platformBps, true);
        emit IntegratorSet(code, payout, feeBps, platformBps);
    }

    function disableIntegrator(bytes32 code) external onlyOwner {
        integrators[code].active = false;
        emit IntegratorDisabled(code);
    }

    function setPlatformPayout(address p) external onlyOwner {
        if (p == address(0)) revert ZeroPayout();
        platformPayout = p;
    }

    /// @notice Quote the fee for a notional without sending anything.
    function quote(bytes32 code, uint256 notional)
        public
        view
        returns (uint256 fee, uint256 integratorShare, uint256 platformShare)
    {
        Integrator memory it = integrators[code];
        if (!it.active) return (0, 0, 0);
        fee = (notional * it.feeBps) / BPS;
        platformShare = (notional * it.platformBps) / BPS;
        integratorShare = fee - platformShare;
    }

    /// @notice Record a routed order and collect its fee.
    /// @dev Called by the trader in the same flow as their own `placeBinaryOrder`.
    ///      The fee is pulled from the trader, so the trader must have approved this
    ///      router for `fee` collateral. No position, no collateral beyond the fee,
    ///      and no order authority ever sits here.
    /// @param notional quantity * price, in collateral base units (1e6 = 1 tUSDC).
    function route(
        bytes32 code,
        address pool,
        uint128 orderId,
        uint8   kind,
        uint256 price,
        uint256 quantity,
        uint256 notional
    ) external returns (uint256 fee) {
        Integrator memory it = integrators[code];
        if (!it.active) revert UnknownIntegrator();

        uint256 integratorShare;
        uint256 platformShare;
        (fee, integratorShare, platformShare) = quote(code, notional);

        // Checked: a token that fails by returning false instead of reverting would
        // otherwise buy attribution and an integrator payout for nothing.
        if (platformShare > 0) {
            if (!collateral.transferFrom(msg.sender, platformPayout, platformShare)) revert FeeTransferFailed();
        }
        if (integratorShare > 0) {
            if (!collateral.transferFrom(msg.sender, it.payout, integratorShare)) revert FeeTransferFailed();
        }

        routedNotional[code] += notional;
        routedFees[code] += fee;
        routedOrders[code] += 1;
        totalNotional += notional;
        totalFees += fee;
        totalOrders += 1;

        emit Routed(code, msg.sender, pool, orderId, kind, price, quantity, notional, fee, integratorShare);
    }

    function stats(bytes32 code)
        external
        view
        returns (uint256 notional, uint256 fees, uint256 orders, address payout, uint16 feeBps, bool active)
    {
        Integrator memory it = integrators[code];
        return (routedNotional[code], routedFees[code], routedOrders[code], it.payout, it.feeBps, it.active);
    }
}
