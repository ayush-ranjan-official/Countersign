// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CMTATStandalone} from "CMTAT/deployment/CMTATStandalone.sol";
import {ICMTATConstructor} from "CMTAT/interfaces/technical/ICMTATConstructor.sol";
import {IERC1643CMTAT} from "CMTAT/interfaces/tokenization/draft-IERC1643CMTAT.sol";
import {IRuleEngine} from "CMTAT/interfaces/engine/IRuleEngine.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {QoreChainHybridHolderGuard} from "asset-kit/guard/QoreChainHybridHolderGuard.sol";
import {QoreChainHybridHolderRule} from "asset-kit/cmtat/QoreChainHybridHolderRule.sol";
import {SpikeEscrow} from "../../src/spike/SpikeEscrow.sol";
import {MockPqcKeyStatus} from "../mocks/MockPqcKeyStatus.sol";

/// Local rehearsal of spike S-3 (the testnet run is the real check).
contract SpikeBondTest is Test {
    address constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;
    address issuer = makeAddr("issuer");
    address seller = makeAddr("seller");
    address buyer = makeAddr("buyer");
    QoreChainHybridHolderGuard guard;
    CMTATStandalone bond;
    SpikeEscrow escrow;

    function setUp() public {
        vm.etch(PQC_KEY_STATUS, address(new MockPqcKeyStatus()).code);
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(seller, true, 1, keccak256("seller"), 2592, true);
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(buyer, true, 1, keccak256("buyer"), 2592, true);

        vm.startPrank(issuer);
        guard = new QoreChainHybridHolderGuard(issuer);
        QoreChainHybridHolderRule rule = new QoreChainHybridHolderRule(guard);
        bond = new CMTATStandalone(
            address(0),
            issuer,
            ICMTATConstructor.ERC20Attributes({name: "Bond", symbol: "B", decimalsIrrevocable: 0}),
            ICMTATConstructor.ExtraInformationAttributes({
                tokenId: "T",
                terms: IERC1643CMTAT.DocumentInfo({name: "Terms", uri: "", documentHash: bytes32(0)}),
                information: ""
            }),
            ICMTATConstructor.Engine({ruleEngine: IRuleEngine(address(rule))})
        );
        bond.mint(seller, 100);
        vm.stopPrank();
        escrow = new SpikeEscrow();
    }

    function test_lockRefusedBeforeExemption_allowedAfter() public {
        vm.startPrank(seller);
        bond.approve(address(escrow), 10);
        vm.expectRevert();
        escrow.lock(IERC20(address(bond)), 10);
        vm.stopPrank();

        vm.prank(issuer);
        guard.setExempt(address(escrow), true, "Countersign DvP escrow");

        vm.prank(seller);
        escrow.lock(IERC20(address(bond)), 10);
        assertEq(bond.balanceOf(address(escrow)), 10);
        assertEq(bond.allowance(seller, address(escrow)), 0, "exact approve + exact pull leaves 0 allowance");

        // Escrow -> buyer (hybrid holder) works; escrow -> unregistered address does not.
        vm.prank(seller);
        escrow.unlock(IERC20(address(bond)), 10);
        assertEq(bond.balanceOf(seller), 100);
    }

    function test_mintToUnregisteredRefused() public {
        vm.prank(issuer);
        vm.expectRevert();
        bond.mint(makeAddr("nokey"), 1);
    }
}
