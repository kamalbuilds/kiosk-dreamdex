// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {KioskRouter} from "../src/KioskRouter.sol";

/// @notice Deploys KioskRouter to Shannon and registers the two launch integrators.
///
/// Somnia prices state creation aggressively and deploys cost far more than on
/// Ethereum, so gas is estimated by the node rather than pinned to an Ethereum
/// number. See docs/somnia-gas-differences.
///
///   forge script script/Deploy.s.sol --rpc-url shannon --broadcast
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address collateral = vm.envAddress("COLLATERAL");
        address platformPayout = vm.envOr("PLATFORM_PAYOUT", deployer);

        vm.startBroadcast(pk);
        KioskRouter router = new KioskRouter(collateral, platformPayout);

        // Launch integrators. 25 bps total, half to the platform, half to the host.
        router.setIntegrator(keccak256("kiosk-demo"), deployer, 25, 12);
        router.setIntegrator(keccak256("degen-lounge"), deployer, 25, 12);
        vm.stopBroadcast();

        console.log("KioskRouter", address(router));
        console.log("collateral ", collateral);
        console.log("platform   ", platformPayout);
    }
}
