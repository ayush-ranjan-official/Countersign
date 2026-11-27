// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {CMTATStandalone} from "CMTAT/deployment/CMTATStandalone.sol";
import {QoreChainHybridHolderGuard} from "asset-kit/guard/QoreChainHybridHolderGuard.sol";
import {IHolderEligibility} from "asset-kit/interfaces/IHolderEligibility.sol";
import {Countersign} from "../src/Countersign.sol";
import {DemoBondFaucet, IBondMint} from "../src/DemoBondFaucet.sol";

/// @notice Deploys Countersign + DemoBondFaucet on top of the bond from DeployBond.s.sol, then (as the issuer, who
/// owns the guard and administers the CMTAT bond) exempts Countersign in the hybrid-holder guard and grants the faucet
/// MINTER_ROLE on the demo bond. Four txs from ISSUER; needs a deploy window (no allowedTargets).
///
///   forge script script/DeployCountersign.s.sol --rpc-url qorechain_testnet                    # dry run
///   forge script script/DeployCountersign.s.sol --rpc-url qorechain_testnet --broadcast --slow
///
/// Config (env, optional): CS_LABEL, CS_OFFICER, CS_THRESHOLD (cash base units), CS_ATTESTOR, CS_MAX_NAV_AGE (s),
/// CS_MAX_DEV_BPS, FAUCET_AMOUNT, FAUCET_COOLDOWN (s). Defaults: officer = OFFICER account, attestor = ISSUER.
/// Writes deployments/countersign-<chainid>.json on a real broadcast only.
contract DeployCountersign is Script {
    struct Config {
        address bond;
        address guard;
        address officer;
        address attestor;
        uint256 threshold;
        uint64 maxNavAge;
        uint16 maxDevBps;
        uint256 faucetAmount;
        uint64 faucetCooldown;
    }

    function config(address issuer) internal view returns (Config memory c) {
        string memory bondJson = vm.readFile(string.concat("deployments/bond-", vm.toString(block.chainid), ".json"));
        c.bond = vm.parseJsonAddress(bondJson, ".bond");
        c.guard = vm.parseJsonAddress(bondJson, ".guard");
        c.officer = vm.envOr("CS_OFFICER", vm.addr(vm.envUint("PRIVATE_KEY_OFFICER")));
        c.attestor = vm.envOr("CS_ATTESTOR", issuer);
        c.threshold = vm.envOr("CS_THRESHOLD", uint256(250e6)); // 250 fUSD
        c.maxNavAge = uint64(vm.envOr("CS_MAX_NAV_AGE", uint256(600)));
        c.maxDevBps = uint16(vm.envOr("CS_MAX_DEV_BPS", uint256(200)));
        c.faucetAmount = vm.envOr("FAUCET_AMOUNT", uint256(100));
        c.faucetCooldown = uint64(vm.envOr("FAUCET_COOLDOWN", uint256(1 days)));
    }

    function run() external returns (Countersign cs, DemoBondFaucet faucet) {
        require(block.chainid != 9801, "testnet only: the PQC precompiles are not active on mainnet");
        uint256 pk = vm.envUint("PRIVATE_KEY_ISSUER");
        Config memory c = config(vm.addr(pk));

        vm.startBroadcast(pk);
        cs = new Countersign("qorechain-diana", c.officer, c.threshold, c.attestor, c.maxNavAge, c.maxDevBps);
        faucet = new DemoBondFaucet(IBondMint(c.bond), IHolderEligibility(c.guard), c.faucetAmount, c.faucetCooldown);
        QoreChainHybridHolderGuard(c.guard).setExempt(address(cs), true, "Countersign DvP escrow");
        CMTATStandalone(c.bond).grantRole(CMTATStandalone(c.bond).MINTER_ROLE(), address(faucet));
        vm.stopBroadcast();

        console2.log("countersign", address(cs));
        console2.log("faucet", address(faucet));
        console2.log("officer", c.officer);
        console2.log("attestor", c.attestor);
        if (vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) record(c, address(cs), address(faucet)); // never on a dry run
    }

    function record(Config memory c, address cs, address faucet) internal {
        string memory o = "cs";
        vm.serializeString(o, "label", vm.envOr("CS_LABEL", string("preview-v0")));
        vm.serializeAddress(o, "countersign", cs);
        vm.serializeAddress(o, "faucet", faucet);
        vm.serializeAddress(o, "bond", c.bond);
        vm.serializeAddress(o, "guard", c.guard);
        vm.serializeAddress(o, "officer", c.officer);
        vm.serializeAddress(o, "attestor", c.attestor);
        vm.serializeUint(o, "largeTradeThreshold", c.threshold);
        vm.serializeUint(o, "maxNavAge", c.maxNavAge);
        vm.serializeUint(o, "maxDeviationBps", c.maxDevBps);
        vm.serializeUint(o, "faucetAmount", c.faucetAmount);
        string memory json = vm.serializeUint(o, "faucetCooldown", c.faucetCooldown);
        vm.writeJson(json, string.concat("deployments/countersign-", vm.toString(block.chainid), ".json"));
    }
}
