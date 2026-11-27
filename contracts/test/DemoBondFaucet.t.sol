// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {DemoBondFaucet, IBondMint} from "../src/DemoBondFaucet.sol";
import {IHolderEligibility} from "asset-kit/interfaces/IHolderEligibility.sol";
import {CountersignFixture} from "./utils/CountersignFixture.sol";

contract DemoBondFaucetTest is CountersignFixture {
    DemoBondFaucet internal faucet;
    uint256 internal constant AMOUNT = 100;

    function setUp() public override {
        super.setUp();
        faucet = new DemoBondFaucet(IBondMint(address(bond)), IHolderEligibility(address(guard)), AMOUNT, 1 days);
        bytes32 minter = bond.MINTER_ROLE();
        vm.prank(issuer);
        bond.grantRole(minter, address(faucet));
    }

    function test_hybridHolderClaimsOncePerCooldown() public {
        address newcomer = makeAddr("newcomer");
        _register(newcomer);
        vm.prank(newcomer);
        faucet.claim();
        assertEq(bond.balanceOf(newcomer), AMOUNT);

        uint64 next = faucet.nextClaimAt(newcomer);
        vm.prank(newcomer);
        vm.expectRevert(abi.encodeWithSelector(DemoBondFaucet.TooSoon.selector, next));
        faucet.claim();

        vm.warp(next);
        vm.prank(newcomer);
        faucet.claim();
        assertEq(bond.balanceOf(newcomer), 2 * AMOUNT);
    }

    function test_walletWithoutPqKeyIsRefused() public {
        address classicalOnly = makeAddr("classical only");
        vm.prank(classicalOnly);
        vm.expectRevert(abi.encodeWithSelector(DemoBondFaucet.NotHybridHolder.selector, classicalOnly));
        faucet.claim();
    }

    function test_keyWithoutProofIsRefused() public {
        address unproven = makeAddr("unproven");
        // registered but possession not proven
        (bool ok,) = PQC_KEY_STATUS.call(
            abi.encodeWithSignature("setStatus(address,bool,uint8,bytes32,uint16,bool)", unproven, true, 1, _seed(unproven), 2592, false)
        );
        assertTrue(ok);
        vm.prank(unproven);
        vm.expectRevert(abi.encodeWithSelector(DemoBondFaucet.NotHybridHolder.selector, unproven));
        faucet.claim();
    }

    function test_withoutMinterRoleTheMintReverts() public {
        DemoBondFaucet noRole = new DemoBondFaucet(IBondMint(address(bond)), IHolderEligibility(address(guard)), AMOUNT, 1 days);
        vm.prank(seller);
        vm.expectRevert();
        noRole.claim();
    }

    function test_claimedBondsCanBeSoldThroughCountersign() public {
        address newSeller = makeAddr("new seller");
        _register(newSeller);
        vm.prank(newSeller);
        faucet.claim();
        // the newcomer sells 10 of the claimed bonds to the buyer
        seller = newSeller;
        _postNav(NAV_PRICE);
        bytes32 id = _affirmBoth(_defaultTerms());
        _lockBoth(_defaultTerms(), id);
        cs.settle(id);
        assertEq(bond.balanceOf(newSeller), AMOUNT - 10);
        assertEq(fusd.balanceOf(newSeller), 10 * NAV_PRICE);
    }

    function test_constructorRejectsBadConfig() public {
        vm.expectRevert(DemoBondFaucet.InvalidConfig.selector);
        new DemoBondFaucet(IBondMint(address(bond)), IHolderEligibility(address(guard)), 0, 1 days);
        vm.expectRevert(DemoBondFaucet.InvalidConfig.selector);
        new DemoBondFaucet(IBondMint(address(0)), IHolderEligibility(address(guard)), AMOUNT, 1 days);
        vm.expectRevert(DemoBondFaucet.InvalidConfig.selector);
        new DemoBondFaucet(IBondMint(address(bond)), IHolderEligibility(address(guard)), AMOUNT, 0);
    }
}
