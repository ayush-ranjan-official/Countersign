// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {SpikeEscrow} from "../src/spike/SpikeEscrow.sol";

/// @notice SPIKE ONLY. Deploys SpikeEscrow from the issuer. Writes deployments/spike-escrow-<chainid>.json.
contract DeploySpikeEscrow is Script {
    function run() external returns (SpikeEscrow escrow) {
        require(block.chainid != 9801, "testnet only");
        uint256 pk = vm.envUint("PRIVATE_KEY_ISSUER");
        vm.startBroadcast(pk);
        escrow = new SpikeEscrow();
        vm.stopBroadcast();
        console2.log("spikeEscrow", address(escrow));
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return escrow; // dry run: predicted address only
        vm.writeJson(
            vm.serializeAddress("spike", "spikeEscrow", address(escrow)),
            string.concat("deployments/spike-escrow-", vm.toString(block.chainid), ".json")
        );
    }
}
