// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {VmSafe} from "forge-std/Vm.sol";
import {CMTATStandalone} from "CMTAT/deployment/CMTATStandalone.sol";
import {ICMTATConstructor} from "CMTAT/interfaces/technical/ICMTATConstructor.sol";
import {IERC1643CMTAT} from "CMTAT/interfaces/tokenization/draft-IERC1643CMTAT.sol";
import {IRuleEngine} from "CMTAT/interfaces/engine/IRuleEngine.sol";
import {QoreChainHybridHolderGuard} from "asset-kit/guard/QoreChainHybridHolderGuard.sol";
import {QoreChainHybridHolderRule} from "asset-kit/cmtat/QoreChainHybridHolderRule.sol";

/// @notice Deploys the demo bond: a CMTAT v3.2.0 token (standalone, no proxy) whose rule engine is the Asset Kit's
/// QoreChainHybridHolderRule, mapped to a new QoreChainHybridHolderGuard owned by the issuer.
/// Mirrors qorechain-asset-kit v0.1.0 contracts/script/DeployCmtat.s.sol (which is dry-run only) and broadcasts.
///
///   forge script script/DeployBond.s.sol --rpc-url qorechain_testnet            # dry run
///   forge script script/DeployBond.s.sol --rpc-url qorechain_testnet --broadcast --slow
/// The issuer (PRIVATE_KEY_ISSUER in .env) needs a registered ML-DSA-87 key and an open deploy window
/// (no allowedTargets: a targeted window refuses contract creation). Writes deployments/bond-<chainid>.json.
contract DeployBond is Script {
    function run() external returns (QoreChainHybridHolderGuard guard, QoreChainHybridHolderRule rule, CMTATStandalone bond) {
        require(block.chainid != 9801, "testnet only: the PQC precompiles are not active on mainnet");
        uint256 pk = vm.envUint("PRIVATE_KEY_ISSUER");
        address issuer = vm.addr(pk);

        vm.startBroadcast(pk);
        guard = new QoreChainHybridHolderGuard(issuer);
        rule = new QoreChainHybridHolderRule(guard);
        bond = new CMTATStandalone(
            address(0), // no ERC-2771 forwarder
            issuer,
            ICMTATConstructor.ERC20Attributes({
                name: vm.envOr("BOND_NAME", string("Countersign Demo Bond 2031")),
                symbol: vm.envOr("BOND_SYMBOL", string("CSB31")),
                decimalsIrrevocable: 0
            }),
            ICMTATConstructor.ExtraInformationAttributes({
                tokenId: vm.envOr("BOND_TOKEN_ID", string("DEMO-CSB-2031")),
                terms: IERC1643CMTAT.DocumentInfo({
                    name: "Terms",
                    uri: vm.envOr("BOND_TERMS_URI", string("https://github.com/ayush-ranjan-official/Countersign")),
                    documentHash: bytes32(0)
                }),
                information: "Countersign testnet demo bond. Issued with qorechain-asset-kit v0.1.0 (CMTAT v3.2.0). Not a real security."
            }),
            ICMTATConstructor.Engine({ruleEngine: IRuleEngine(address(rule))})
        );
        vm.stopBroadcast();

        console2.log("issuer", issuer);
        console2.log("guard", address(guard));
        console2.log("rule", address(rule));
        console2.log("bond", address(bond));

        // Only a real broadcast records addresses: a dry run's addresses are predictions, not deployments.
        if (!vm.isContext(VmSafe.ForgeContext.ScriptBroadcast)) return (guard, rule, bond);
        string memory o = "bond";
        vm.serializeAddress(o, "issuer", issuer);
        vm.serializeAddress(o, "guard", address(guard));
        vm.serializeAddress(o, "rule", address(rule));
        string memory json = vm.serializeAddress(o, "bond", address(bond));
        vm.writeJson(json, string.concat("deployments/bond-", vm.toString(block.chainid), ".json"));
    }
}
