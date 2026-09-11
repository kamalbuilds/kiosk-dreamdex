// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KioskRouter} from "../src/KioskRouter.sol";
import {MockFailingToken} from "./MockFailingToken.sol";

/// @notice A well-behaved 6-decimal collateral token, standing in for tUSDC.
contract MockUSDC {
    string public constant name = "Test USDC";
    string public constant symbol = "tUSDC";
    uint8 public constant decimals = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "allowance");
        require(balanceOf[from] >= amount, "balance");
        if (allowed != type(uint256).max) allowance[from][msg.sender] = allowed - amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract KioskRouterTest is Test {
    /// @dev Mirrors of the production events, so `vm.expectEmit` has a signature to match.
    event Routed(
        bytes32 indexed code,
        address indexed trader,
        address indexed pool,
        uint128 orderId,
        uint8 kind,
        uint256 price,
        uint256 quantity,
        uint256 notional,
        uint256 fee,
        uint256 integratorShare
    );
    event IntegratorSet(bytes32 indexed code, address payout, uint16 feeBps, uint16 platformBps);
    event IntegratorDisabled(bytes32 indexed code);

    KioskRouter internal router;
    MockUSDC internal usdc;

    address internal owner = address(this);
    address internal platform = makeAddr("platformPayout");
    address internal lounge = makeAddr("loungePayout");
    address internal arena = makeAddr("arenaPayout");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal stranger = makeAddr("stranger");
    address internal pool = makeAddr("eventContractPool");

    bytes32 internal constant CODE_A = keccak256("degen-lounge");
    bytes32 internal constant CODE_B = keccak256("prediction-arena");
    bytes32 internal constant CODE_UNKNOWN = keccak256("never-registered");

    // Code A: 25 bps total fee, of which 12 bps is the platform's.
    uint16 internal constant A_FEE_BPS = 25;
    uint16 internal constant A_PLATFORM_BPS = 12;
    // Code B: the 100 bps ceiling, of which 40 bps is the platform's.
    uint16 internal constant B_FEE_BPS = 100;
    uint16 internal constant B_PLATFORM_BPS = 40;

    uint256 internal constant ONE_USDC = 1_000_000;

    function setUp() public {
        usdc = new MockUSDC();
        router = new KioskRouter(address(usdc), platform);

        router.setIntegrator(CODE_A, lounge, A_FEE_BPS, A_PLATFORM_BPS);
        router.setIntegrator(CODE_B, arena, B_FEE_BPS, B_PLATFORM_BPS);

        usdc.mint(alice, 1_000 * ONE_USDC);
        usdc.mint(bob, 1_000 * ONE_USDC);

        vm.prank(alice);
        usdc.approve(address(router), type(uint256).max);
        vm.prank(bob);
        usdc.approve(address(router), type(uint256).max);
    }

    // --------------------------------------------------------------------
    // setIntegrator
    // --------------------------------------------------------------------

    function test_SetIntegrator_StoresFields() public view {
        (address payout, uint16 feeBps, uint16 platformBps, bool active) = router.integrators(CODE_A);
        assertEq(payout, lounge, "payout not stored");
        assertEq(feeBps, A_FEE_BPS, "feeBps not stored");
        assertEq(platformBps, A_PLATFORM_BPS, "platformBps not stored");
        assertTrue(active, "integrator should be active");
    }

    function test_SetIntegrator_EmitsIntegratorSet() public {
        bytes32 code = keccak256("fresh-code");
        vm.expectEmit(true, true, true, true, address(router));
        emit IntegratorSet(code, lounge, 33, 11);
        router.setIntegrator(code, lounge, 33, 11);
    }

    function test_SetIntegrator_Overwrites() public {
        router.setIntegrator(CODE_A, arena, 7, 3);
        (address payout, uint16 feeBps, uint16 platformBps, bool active) = router.integrators(CODE_A);
        assertEq(payout, arena, "payout not overwritten");
        assertEq(feeBps, 7, "feeBps not overwritten");
        assertEq(platformBps, 3, "platformBps not overwritten");
        assertTrue(active, "should stay active");
    }

    function test_SetIntegrator_AcceptsExactlyMaxFeeBps() public {
        router.setIntegrator(keccak256("at-the-cap"), lounge, router.MAX_FEE_BPS(), 0);
        (, uint16 feeBps,,) = router.integrators(keccak256("at-the-cap"));
        assertEq(feeBps, 100, "MAX_FEE_BPS must be accepted");
    }

    function test_SetIntegrator_RevertsFeeTooHigh() public {
        vm.expectRevert(KioskRouter.FeeTooHigh.selector);
        router.setIntegrator(CODE_A, lounge, 101, 0);
    }

    function test_SetIntegrator_RevertsFeeTooHighFarAboveCap() public {
        vm.expectRevert(KioskRouter.FeeTooHigh.selector);
        router.setIntegrator(CODE_A, lounge, 10_000, 0);
    }

    function test_SetIntegrator_RevertsBadSplit() public {
        vm.expectRevert(KioskRouter.BadSplit.selector);
        router.setIntegrator(CODE_A, lounge, 25, 26);
    }

    function test_SetIntegrator_AcceptsPlatformBpsEqualToFeeBps() public {
        router.setIntegrator(keccak256("all-platform"), lounge, 25, 25);
        (,, uint16 platformBps,) = router.integrators(keccak256("all-platform"));
        assertEq(platformBps, 25, "platformBps == feeBps must be accepted");
    }

    function test_SetIntegrator_RevertsZeroPayout() public {
        vm.expectRevert(KioskRouter.ZeroPayout.selector);
        router.setIntegrator(CODE_A, address(0), 25, 12);
    }

    function test_SetIntegrator_RevertsNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(KioskRouter.NotOwner.selector);
        router.setIntegrator(CODE_A, lounge, 25, 12);
    }

    function test_DisableIntegrator_RevertsNotOwner() public {
        vm.prank(stranger);
        vm.expectRevert(KioskRouter.NotOwner.selector);
        router.disableIntegrator(CODE_A);
    }

    function test_DisableIntegrator_ClearsActiveAndEmits() public {
        vm.expectEmit(true, true, true, true, address(router));
        emit IntegratorDisabled(CODE_A);
        router.disableIntegrator(CODE_A);

        (,,, bool active) = router.integrators(CODE_A);
        assertFalse(active, "integrator should be inactive");
    }

    function test_SetPlatformPayout_RevertsZeroPayout() public {
        vm.expectRevert(KioskRouter.ZeroPayout.selector);
        router.setPlatformPayout(address(0));
    }

    function test_SetPlatformPayout_RoutesToTheNewAddress() public {
        address newPlatform = makeAddr("newPlatformPayout");
        router.setPlatformPayout(newPlatform);
        assertEq(router.platformPayout(), newPlatform, "platformPayout not updated");

        vm.prank(alice);
        router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC);

        assertEq(usdc.balanceOf(newPlatform), 1_200, "new platform payout did not receive the platform share");
        assertEq(usdc.balanceOf(platform), 0, "old platform payout must receive nothing");
    }

    // --------------------------------------------------------------------
    // quote
    // --------------------------------------------------------------------

    /// 1 tUSDC at 25 bps: 2_500 total, 1_200 platform (12 bps), 1_300 integrator.
    function test_Quote_ExactForOneUsdc() public view {
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_A, ONE_USDC);
        assertEq(fee, 2_500, "fee");
        assertEq(platformShare, 1_200, "platformShare");
        assertEq(integratorShare, 1_300, "integratorShare");
        assertEq(integratorShare + platformShare, fee, "shares must sum to fee");
    }

    /// Notional small enough that both legs truncate: 1234 * 25 / 10000 = 3.085 -> 3,
    /// 1234 * 12 / 10000 = 1.4808 -> 1, leaving the integrator 2.
    function test_Quote_TruncatesBothLegs() public view {
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_A, 1_234);
        assertEq(fee, 3, "fee must truncate to 3");
        assertEq(platformShare, 1, "platformShare must truncate to 1");
        assertEq(integratorShare, 2, "integratorShare must be 2");
        assertEq(integratorShare + platformShare, fee, "shares must sum to fee");
    }

    /// 799 * 25 / 10000 = 1.99 -> 1, but 799 * 12 / 10000 = 0.958 -> 0, so the whole
    /// fee lands on the integrator and the platform leg is skipped entirely.
    function test_Quote_PlatformShareTruncatesToZero() public view {
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_A, 799);
        assertEq(fee, 1, "fee");
        assertEq(platformShare, 0, "platformShare must truncate to zero");
        assertEq(integratorShare, 1, "integratorShare takes the whole fee");
    }

    /// Below 400 base units the entire 25 bps fee truncates away.
    function test_Quote_WholeFeeTruncatesToZero() public view {
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_A, 399);
        assertEq(fee, 0, "fee");
        assertEq(integratorShare, 0, "integratorShare");
        assertEq(platformShare, 0, "platformShare");
    }

    function test_Quote_AtTheFeeCap() public view {
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_B, ONE_USDC);
        assertEq(fee, 10_000, "1% of 1 tUSDC");
        assertEq(platformShare, 4_000, "platformShare");
        assertEq(integratorShare, 6_000, "integratorShare");
    }

    function test_Quote_ZeroForUnknownCode() public view {
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_UNKNOWN, ONE_USDC);
        assertEq(fee, 0, "fee");
        assertEq(integratorShare, 0, "integratorShare");
        assertEq(platformShare, 0, "platformShare");
    }

    function test_Quote_ZeroForDisabledCode() public {
        router.disableIntegrator(CODE_A);
        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(CODE_A, ONE_USDC);
        assertEq(fee, 0, "fee");
        assertEq(integratorShare, 0, "integratorShare");
        assertEq(platformShare, 0, "platformShare");
    }

    function testFuzz_Quote_SharesSumToFee(uint256 notional, uint16 feeBps, uint16 platformBps) public {
        feeBps = uint16(bound(uint256(feeBps), 0, router.MAX_FEE_BPS()));
        platformBps = uint16(bound(uint256(platformBps), 0, feeBps));
        notional = bound(notional, 0, type(uint128).max);

        bytes32 code = keccak256("fuzz-code");
        router.setIntegrator(code, lounge, feeBps, platformBps);

        (uint256 fee, uint256 integratorShare, uint256 platformShare) = router.quote(code, notional);
        assertEq(integratorShare + platformShare, fee, "shares must sum to fee");
        assertEq(fee, (notional * feeBps) / router.BPS(), "fee formula");
        assertLe(fee, notional, "fee can never exceed notional");
    }

    // --------------------------------------------------------------------
    // route: money movement
    // --------------------------------------------------------------------

    function test_Route_SplitsFeeAndLeavesRouterEmpty() public {
        uint256 aliceBefore = usdc.balanceOf(alice);

        vm.prank(alice);
        uint256 fee = router.route(CODE_A, pool, 42, 1, 500_000, 2, ONE_USDC);

        assertEq(fee, 2_500, "returned fee");
        assertEq(usdc.balanceOf(platform), 1_200, "platform payout must receive exactly the platform share");
        assertEq(usdc.balanceOf(lounge), 1_300, "integrator payout must receive exactly the integrator share");
        assertEq(usdc.balanceOf(alice), aliceBefore - 2_500, "trader must be debited exactly the fee");
        assertEq(usdc.balanceOf(address(router)), 0, "router must hold zero collateral after routing");
    }

    function test_Route_RouterHoldsNothingAcrossManyRoutes() public {
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            router.route(CODE_A, pool, uint128(i), 0, 250_000, 4, ONE_USDC);
            vm.prank(bob);
            router.route(CODE_B, pool, uint128(i), 1, 100_000, 30, 3 * ONE_USDC);
            assertEq(usdc.balanceOf(address(router)), 0, "router must never accrue collateral");
        }
    }

    function test_Route_PaysNothingWhenBothSharesTruncateToZero() public {
        vm.prank(alice);
        uint256 fee = router.route(CODE_A, pool, 1, 0, 399, 1, 399);

        assertEq(fee, 0, "fee");
        assertEq(usdc.balanceOf(platform), 0, "platform must receive nothing");
        assertEq(usdc.balanceOf(lounge), 0, "integrator must receive nothing");
        assertEq(router.routedOrders(CODE_A), 1, "the order is still recorded");
        assertEq(router.routedNotional(CODE_A), 399, "notional is still recorded");
    }

    function test_Route_SkipsPlatformLegWhenPlatformShareIsZero() public {
        vm.prank(alice);
        uint256 fee = router.route(CODE_A, pool, 1, 0, 799, 1, 799);

        assertEq(fee, 1, "fee");
        assertEq(usdc.balanceOf(platform), 0, "platform share truncated to zero, so nothing moves");
        assertEq(usdc.balanceOf(lounge), 1, "integrator takes the whole fee");
        assertEq(usdc.balanceOf(address(router)), 0, "router must hold zero collateral");
    }

    function test_Route_RevertsWhenTraderHasNotApproved() public {
        address broke = makeAddr("unapproved");
        usdc.mint(broke, ONE_USDC);

        vm.prank(broke);
        vm.expectRevert(bytes("allowance"));
        router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC);
    }

    // --------------------------------------------------------------------
    // route: rejection paths
    // --------------------------------------------------------------------

    function test_Route_RevertsUnknownIntegrator() public {
        vm.prank(alice);
        vm.expectRevert(KioskRouter.UnknownIntegrator.selector);
        router.route(CODE_UNKNOWN, pool, 1, 0, 500_000, 2, ONE_USDC);
    }

    function test_Route_RevertsForDisabledIntegrator() public {
        router.disableIntegrator(CODE_A);

        vm.prank(alice);
        vm.expectRevert(KioskRouter.UnknownIntegrator.selector);
        router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC);
    }

    function test_Route_DisabledIntegratorRecordsNothing() public {
        router.disableIntegrator(CODE_A);

        vm.prank(alice);
        try router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC) {
            fail();
        } catch {}

        assertEq(router.routedOrders(CODE_A), 0, "no order may be recorded");
        assertEq(router.totalOrders(), 0, "no total may be recorded");
    }

    // --------------------------------------------------------------------
    // route: the silently-failing token, which is why transferFrom is checked
    // --------------------------------------------------------------------

    function _failingSetup() internal returns (KioskRouter failRouter, MockFailingToken bad) {
        bad = new MockFailingToken();
        failRouter = new KioskRouter(address(bad), platform);
        failRouter.setIntegrator(CODE_A, lounge, A_FEE_BPS, A_PLATFORM_BPS);

        bad.mint(alice, 1_000 * ONE_USDC);
        vm.prank(alice);
        bad.approve(address(failRouter), type(uint256).max);
    }

    function test_Route_RevertsFeeTransferFailed_PlatformLeg() public {
        (KioskRouter failRouter, MockFailingToken bad) = _failingSetup();
        bad.setFailOnCall(1); // the platform transfer returns false

        vm.prank(alice);
        vm.expectRevert(KioskRouter.FeeTransferFailed.selector);
        failRouter.route(CODE_A, pool, 7, 0, 500_000, 2, ONE_USDC);
    }

    function test_Route_RevertsFeeTransferFailed_IntegratorLeg() public {
        (KioskRouter failRouter, MockFailingToken bad) = _failingSetup();
        bad.setFailOnCall(2); // the platform leg succeeds, the integrator leg returns false

        vm.prank(alice);
        vm.expectRevert(KioskRouter.FeeTransferFailed.selector);
        failRouter.route(CODE_A, pool, 7, 0, 500_000, 2, ONE_USDC);
    }

    /// A false return must unwind everything: no attribution, no accounting, no payout.
    function test_Route_SilentTokenFailureBuysNoAttribution() public {
        (KioskRouter failRouter, MockFailingToken bad) = _failingSetup();
        bad.setFailOnCall(2);

        uint256 aliceBefore = bad.balanceOf(alice);

        vm.prank(alice);
        try failRouter.route(CODE_A, pool, 7, 0, 500_000, 2, ONE_USDC) {
            fail();
        } catch {}

        assertEq(bad.balanceOf(alice), aliceBefore, "trader must not be debited");
        assertEq(bad.balanceOf(platform), 0, "platform must not be paid");
        assertEq(bad.balanceOf(lounge), 0, "integrator must not be paid");
        assertEq(failRouter.routedNotional(CODE_A), 0, "no notional may be attributed");
        assertEq(failRouter.routedFees(CODE_A), 0, "no fee may be attributed");
        assertEq(failRouter.routedOrders(CODE_A), 0, "no order may be attributed");
        assertEq(failRouter.totalNotional(), 0, "no total notional");
        assertEq(failRouter.totalFees(), 0, "no total fees");
        assertEq(failRouter.totalOrders(), 0, "no total orders");
    }

    function test_Route_SucceedsOnTheSameTokenWhenItDoesNotFail() public {
        (KioskRouter failRouter, MockFailingToken bad) = _failingSetup();
        bad.setFailOnCall(0); // never fail

        vm.prank(alice);
        uint256 fee = failRouter.route(CODE_A, pool, 7, 0, 500_000, 2, ONE_USDC);

        assertEq(fee, 2_500, "fee");
        assertEq(bad.balanceOf(platform), 1_200, "platform share");
        assertEq(bad.balanceOf(lounge), 1_300, "integrator share");
        assertEq(failRouter.routedOrders(CODE_A), 1, "the order is recorded");
    }

    // --------------------------------------------------------------------
    // route: accounting
    // --------------------------------------------------------------------

    function test_Route_AccountingAcrossTradersAndCodes() public {
        vm.prank(alice);
        router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC); // fee 2500 / 1200 / 1300
        vm.prank(bob);
        router.route(CODE_A, pool, 2, 1, 250_000, 10, 2_500_000); // fee 6250 / 3000 / 3250
        vm.prank(alice);
        router.route(CODE_B, pool, 3, 0, 100_000, 50, 5_000_000); // fee 50000 / 20000 / 30000

        assertEq(router.routedNotional(CODE_A), 3_500_000, "routedNotional A");
        assertEq(router.routedFees(CODE_A), 8_750, "routedFees A");
        assertEq(router.routedOrders(CODE_A), 2, "routedOrders A");

        assertEq(router.routedNotional(CODE_B), 5_000_000, "routedNotional B");
        assertEq(router.routedFees(CODE_B), 50_000, "routedFees B");
        assertEq(router.routedOrders(CODE_B), 1, "routedOrders B");

        assertEq(router.totalNotional(), 8_500_000, "totalNotional");
        assertEq(router.totalFees(), 58_750, "totalFees");
        assertEq(router.totalOrders(), 3, "totalOrders");

        assertEq(usdc.balanceOf(platform), 24_200, "platform received every platform share");
        assertEq(usdc.balanceOf(lounge), 4_550, "lounge received every code A integrator share");
        assertEq(usdc.balanceOf(arena), 30_000, "arena received every code B integrator share");
        assertEq(usdc.balanceOf(address(router)), 0, "router must hold zero collateral");

        assertEq(
            usdc.balanceOf(platform) + usdc.balanceOf(lounge) + usdc.balanceOf(arena),
            router.totalFees(),
            "every recorded fee must be accounted for in a payout balance"
        );
    }

    function test_Route_PerCodeAccountingIsIsolated() public {
        vm.prank(alice);
        router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC);

        assertEq(router.routedNotional(CODE_B), 0, "code B notional must not move");
        assertEq(router.routedFees(CODE_B), 0, "code B fees must not move");
        assertEq(router.routedOrders(CODE_B), 0, "code B orders must not move");
    }

    function test_Stats_MatchesAccounting() public {
        vm.prank(alice);
        router.route(CODE_A, pool, 1, 0, 500_000, 2, ONE_USDC);
        vm.prank(bob);
        router.route(CODE_A, pool, 2, 1, 250_000, 10, 2_500_000);

        (uint256 notional, uint256 fees, uint256 orders, address payout, uint16 feeBps, bool active) =
            router.stats(CODE_A);

        assertEq(notional, 3_500_000, "stats notional");
        assertEq(fees, 8_750, "stats fees");
        assertEq(orders, 2, "stats orders");
        assertEq(payout, lounge, "stats payout");
        assertEq(feeBps, A_FEE_BPS, "stats feeBps");
        assertTrue(active, "stats active");
    }

    // --------------------------------------------------------------------
    // route: the Routed event
    // --------------------------------------------------------------------

    function test_Route_EmitsRoutedWithTheCallArguments() public {
        uint128 orderId = 987_654_321;
        uint8 kind = 3;
        uint256 price = 640_000;
        uint256 quantity = 7;
        uint256 notional = 4_480_000;

        // fee = 4_480_000 * 25 / 10_000 = 11_200; platform = 4_480_000 * 12 / 10_000 = 5_376.
        uint256 expectedFee = 11_200;
        uint256 expectedIntegratorShare = 11_200 - 5_376;

        vm.expectEmit(true, true, true, true, address(router));
        emit Routed(
            CODE_A, alice, pool, orderId, kind, price, quantity, notional, expectedFee, expectedIntegratorShare
        );

        vm.prank(alice);
        router.route(CODE_A, pool, orderId, kind, price, quantity, notional);
    }

    function test_Route_EmitsRoutedForASecondPoolAndTrader() public {
        address otherPool = makeAddr("otherPool");

        vm.expectEmit(true, true, true, true, address(router));
        emit Routed(CODE_B, bob, otherPool, 1, 0, 330_000, 10, 3_300_000, 33_000, 19_800);

        vm.prank(bob);
        router.route(CODE_B, otherPool, 1, 0, 330_000, 10, 3_300_000);
    }
}
