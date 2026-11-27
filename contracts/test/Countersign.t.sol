// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Countersign} from "../src/Countersign.sol";
import {CountersignFixture} from "./utils/CountersignFixture.sol";
import {MockPqcKeyStatus} from "./mocks/MockPqcKeyStatus.sol";
import {MockPqcVerify, EmptyReturn} from "./mocks/MockPqcVerify.sol";
import {MockERC20, FeeOnTransferERC20, ReentrantERC20} from "./mocks/MockTokens.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

contract CountersignTest is CountersignFixture {
    // ================================================================ happy paths

    function test_happyPath_settlesBothLegsAtomically() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        _postNav(NAV_PRICE);

        uint256 sellerCash = fusd.balanceOf(seller);
        uint256 buyerBonds = bond.balanceOf(buyer);
        vm.expectEmit(true, true, true, true, address(cs));
        emit Countersign.Settled(id, seller, buyer, t.assetAmount, t.cashAmount);
        vm.prank(relayer); // anyone may settle
        cs.settle(id);

        assertEq(bond.balanceOf(buyer) - buyerBonds, t.assetAmount, "buyer got the bonds");
        assertEq(fusd.balanceOf(seller) - sellerCash, t.cashAmount, "seller got the cash");
        assertEq(bond.balanceOf(address(cs)), 0);
        assertEq(fusd.balanceOf(address(cs)), 0);
        Countersign.Trade memory tr = cs.getTrade(id);
        assertEq(uint8(tr.status), uint8(Countersign.Status.Settled));
        assertFalse(tr.assetLocked);
        assertFalse(tr.cashLocked);
    }

    function test_firstAffirmation_opensTradeAndEmitsTermsForDiscovery() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        bytes memory sig = _affirmSig(cs, seller, id);
        vm.expectEmit(true, true, true, true, address(cs));
        emit Countersign.TradeOpened(id, seller, buyer, t);
        vm.prank(relayer); // a relayer submits: the signature authorises, not the sender
        cs.affirm(t, seller, sig);
        Countersign.Trade memory tr = cs.getTrade(id);
        assertEq(uint8(tr.status), uint8(Countersign.Status.Open));
        assertTrue(tr.sellerAffirmed);
        assertFalse(tr.buyerAffirmed);
        assertEq(tr.terms.salt, t.salt);
    }

    function test_fourEyes_largeTradeNeedsOfficer() public {
        Countersign.Terms memory t = _terms(1_000, 1_000 * NAV_PRICE, 7); // 100,000 fUSD = threshold
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        _postNav(NAV_PRICE);
        vm.expectRevert(Countersign.OfficerApprovalRequired.selector); // A6
        cs.settle(id);

        bytes memory officerSig = _sign(officer, cs.signedBytes(cs.approveData(id)));
        vm.prank(relayer); // anyone may submit the officer's signature
        cs.approveLarge(id, officerSig);
        assertTrue(cs.getTrade(id).officerApproved);
        cs.settle(id);
        assertEq(bond.balanceOf(buyer), 1_000);
    }

    function test_fourEyes_smallTradeDoesNotNeedOfficer() public view {
        assertFalse(cs.requiresOfficer(THRESHOLD - 1));
        assertTrue(cs.requiresOfficer(THRESHOLD));
    }

    function test_officerApproval_forgedOrReplayedIsRejected() public {
        Countersign.Terms memory t = _terms(1_000, 1_000 * NAV_PRICE, 7);
        bytes32 id = _affirmBoth(t);
        // attacker signs with their own key
        bytes memory forged = _sign(attacker, cs.signedBytes(cs.approveData(id)));
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.approveLarge(id, forged);
        // an officer approval of a different trade does not transfer
        bytes32 other = keccak256("other trade");
        bytes memory otherSig = _sign(officer, cs.signedBytes(cs.approveData(other)));
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.approveLarge(id, otherSig);
        // an affirmation-type signature by the officer is not an approval (message type is bound)
        bytes memory wrongType = _sign(officer, cs.signedBytes(cs.affirmData(id)));
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.approveLarge(id, wrongType);
    }

    // ================================================================ NAV (fair price)

    function test_nav_missingIsStale() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        vm.expectRevert(Countersign.NavStale.selector);
        cs.settle(id);
    }

    function test_nav_staleIsRejected() public {
        // A7: stale price
        _postNav(NAV_PRICE);
        vm.warp(block.timestamp + MAX_NAV_AGE + 1); // the posted NAV is now too old
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        vm.expectRevert(Countersign.NavStale.selector);
        cs.settle(id);
    }

    function test_nav_offBandPriceIsRejected() public {
        // A7: trade price 3 % above NAV with a 2 % band
        Countersign.Terms memory t = _terms(10, 1_030e6, 3);
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        _postNav(NAV_PRICE);
        vm.expectRevert(abi.encodeWithSelector(Countersign.PriceOutOfBand.selector, 1_030e6, 1_000e6));
        cs.settle(id);
    }

    function test_nav_inBandPriceSettles() public {
        Countersign.Terms memory t = _terms(10, 1_020e6, 4); // exactly +2 %
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        _postNav(NAV_PRICE);
        cs.settle(id);
        assertEq(fusd.balanceOf(seller), 1_020e6);
    }

    function test_nav_replayAndRollbackAreRejected() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory sig = _sign(attestor, cs.signedBytes(cs.navData(address(bond), address(fusd), NAV_PRICE, ts, 42)));
        cs.postNav(address(bond), address(fusd), NAV_PRICE, ts, 42, sig);
        // same NAV again (nonce and timestamp reused)
        vm.expectRevert(Countersign.InvalidNav.selector);
        cs.postNav(address(bond), address(fusd), NAV_PRICE, ts, 42, sig);
        // newer timestamp but a used nonce
        vm.warp(block.timestamp + 10);
        uint64 ts2 = uint64(block.timestamp);
        bytes memory sig2 = _sign(attestor, cs.signedBytes(cs.navData(address(bond), address(fusd), 1, ts2, 42)));
        vm.expectRevert(Countersign.NavNonceUsed.selector);
        cs.postNav(address(bond), address(fusd), 1, ts2, 42, sig2);
        // an older, never-posted price cannot roll the NAV back
        bytes memory old = _sign(attestor, cs.signedBytes(cs.navData(address(bond), address(fusd), 1, ts - 5, 43)));
        vm.expectRevert(Countersign.InvalidNav.selector);
        cs.postNav(address(bond), address(fusd), 1, ts - 5, 43, old);
        // a future timestamp is refused
        bytes memory fut = _sign(attestor, cs.signedBytes(cs.navData(address(bond), address(fusd), 1, ts2 + 100, 44)));
        vm.expectRevert(Countersign.InvalidNav.selector);
        cs.postNav(address(bond), address(fusd), 1, ts2 + 100, 44, fut);
    }

    function test_nav_forgedAndWrongCashAreRejected() public {
        uint64 ts = uint64(block.timestamp);
        bytes memory forged = _sign(attacker, cs.signedBytes(cs.navData(address(bond), address(fusd), NAV_PRICE, ts, 1)));
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.postNav(address(bond), address(fusd), NAV_PRICE, ts, 1, forged);
        // a NAV signed for another quote currency does not apply to fUSD
        bytes memory otherCash = _sign(attestor, cs.signedBytes(cs.navData(address(bond), address(0xCA5), NAV_PRICE, ts, 1)));
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.postNav(address(bond), address(fusd), NAV_PRICE, ts, 1, otherCash);
        vm.expectRevert(Countersign.InvalidNav.selector);
        cs.postNav(address(bond), address(fusd), 0, ts, 1, forged); // zero price
    }

    function test_navData_isHumanReadable() public view {
        assertEq(
            cs.navData(address(0xAb), address(0xCd), 100e6, 1_790_000_000, 7),
            "countersign:v1:nav:asset=0x00000000000000000000000000000000000000ab;cash=0x00000000000000000000000000000000000000cd;price=100000000;ts=1790000000;nonce=7"
        );
    }

    // ================================================================ message format (QoreSign message-signing-v1)

    function test_messageFormat_matchesQoreXSpikeVector() public view {
        // The exact data string QoreX signed in spike S-2 (docs/spikes/s2-qorex-signArbitrary.json).
        bytes32 id = 0xfc3b816669bc91142c3b473954db1ea7e91104a5f235c995f23ba2cdbfe4f6ad;
        assertEq(cs.affirmData(id), "countersign:v1:affirm:0xfc3b816669bc91142c3b473954db1ea7e91104a5f235c995f23ba2cdbfe4f6ad");
        assertEq(
            string(cs.affirmMessage(id)),
            "qorechain-msg-v1|qorechain-diana|countersign:v1:affirm:0xfc3b816669bc91142c3b473954db1ea7e91104a5f235c995f23ba2cdbfe4f6ad"
        );
        assertEq(cs.approveData(bytes32(uint256(1))), "countersign:v1:approve:0x0000000000000000000000000000000000000000000000000000000000000001");
        assertEq(cs.nativeChainId(), "qorechain-diana");
    }

    function test_constructor_rejectsBadConfig() public {
        vm.expectRevert(Countersign.InvalidConfig.selector);
        new Countersign("", officer, THRESHOLD, attestor, MAX_NAV_AGE, MAX_DEV_BPS);
        vm.expectRevert(Countersign.InvalidConfig.selector);
        new Countersign("qorechain|diana", officer, THRESHOLD, attestor, MAX_NAV_AGE, MAX_DEV_BPS);
        vm.expectRevert(Countersign.InvalidConfig.selector);
        new Countersign(CHAIN, officer, THRESHOLD, attestor, 0, MAX_DEV_BPS);
        vm.expectRevert(Countersign.InvalidConfig.selector);
        new Countersign(CHAIN, officer, THRESHOLD, attestor, MAX_NAV_AGE, 10_001);
        // no attestor: price check disabled, age/band ignored
        new Countersign(CHAIN, address(0), 0, address(0), 0, 0);
    }

    // ================================================================ attacks A1–A10

    function test_A1_forgedAffirmationWithRandomKey() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        bytes memory forged = _signWithSeed(keccak256("attacker's own ML-DSA key"), cs.affirmMessage(id));
        vm.prank(attacker);
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.affirm(t, seller, forged);
    }

    function test_A2_classicalOnlyOrEmptySignature() public {
        Countersign.Terms memory t = _defaultTerms();
        vm.expectRevert(Countersign.BadSignatureLength.selector);
        cs.affirm(t, seller, "");
        bytes memory ecdsaSized = new bytes(65); // a secp256k1 signature
        vm.expectRevert(Countersign.BadSignatureLength.selector);
        cs.affirm(t, seller, ecdsaSized);
        bytes memory longer = bytes.concat(_affirmSig(cs, seller, cs.tradeIdOf(t)), hex"00");
        vm.expectRevert(Countersign.BadSignatureLength.selector);
        cs.affirm(t, seller, longer);
    }

    function test_A3_replayOnAnotherTrade() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(t));
        Countersign.Terms memory other = _terms(10, 10 * NAV_PRICE, 999);
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.affirm(other, seller, sig);
    }

    function test_A3_replayOnAnotherContract() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(t));
        Countersign cs2 = _deploy(CHAIN);
        assertTrue(cs2.tradeIdOf(t) != cs.tradeIdOf(t), "tradeId binds the contract");
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs2.affirm(t, seller, sig);
    }

    function test_A3_replayOnAnotherChain() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(t));
        // another EVM chain id: the tradeId changes
        uint256 chainBefore = block.chainid;
        vm.chainId(9801);
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.affirm(t, seller, sig);
        vm.chainId(chainBefore);
        // another native chain id in the QoreSign domain prefix
        Countersign vladi = _deploy("qorechain-vladi");
        bytes memory dianaSigForVladiId = _sign(seller, bytes.concat("qorechain-msg-v1|qorechain-diana|", bytes(vladi.affirmData(vladi.tradeIdOf(t)))));
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        vladi.affirm(t, seller, dianaSigForVladiId);
    }

    function test_A4_reclaimBeforeDeadlineReverts_afterPaysOriginalDepositorsOnly() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        uint256 sellerBonds = bond.balanceOf(seller);
        uint256 buyerCash = fusd.balanceOf(buyer);

        vm.prank(seller); // the seller's stolen classical key
        vm.expectRevert(Countersign.DeadlineNotPassed.selector);
        cs.reclaim(id);

        vm.warp(t.deadline + 1);
        vm.prank(attacker); // anyone may trigger it; funds still go to the depositors
        cs.reclaim(id);
        assertEq(bond.balanceOf(seller) - sellerBonds, t.assetAmount);
        assertEq(fusd.balanceOf(buyer) - buyerCash, t.cashAmount);
        assertEq(bond.balanceOf(attacker), 0);
        assertEq(fusd.balanceOf(attacker), 0);
        assertEq(uint8(cs.getTrade(id).status), uint8(Countersign.Status.Reclaimed));

        vm.expectRevert(Countersign.NotLocked.selector); // nothing left
        cs.reclaim(id);
        vm.expectRevert(Countersign.TradeClosed.selector);
        cs.settle(id);
    }

    function test_A4_classicalKeyCannotLockForTheOtherSide() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        vm.prank(attacker);
        vm.expectRevert(Countersign.NotParty.selector);
        cs.lockAsset(id);
        vm.prank(seller);
        vm.expectRevert(Countersign.NotParty.selector);
        cs.lockCash(id);
    }

    function test_A5_changedTermsMeanADifferentTrade() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        Countersign.Terms memory changed = t;
        changed.cashAmount = 1; // attacker wants the bonds for 1 base unit
        bytes32 changedId = cs.tradeIdOf(changed);
        assertTrue(changedId != id);
        bytes memory originalSig = _affirmSig(cs, seller, id);
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.affirm(changed, seller, originalSig);
        vm.prank(seller);
        vm.expectRevert(Countersign.NotAffirmed.selector);
        cs.lockAsset(changedId);
        changed.buyer = attacker; // redirect the bonds
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.affirm(changed, seller, originalSig);
    }

    function test_A8_keyWithoutProofOfPossession() public {
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(seller, true, 1, _seed(seller), 2592, false);
        Countersign.Terms memory t = _defaultTerms();
        bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(t));
        vm.expectRevert(abi.encodeWithSelector(Countersign.KeyNotProven.selector, seller));
        cs.affirm(t, seller, sig);
    }

    function test_keyNotRegistered_wrongAlgorithm_wrongLength() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        bytes memory sig = _affirmSig(cs, seller, id);
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(seller, false, 0, bytes32(0), 0, false);
        vm.expectRevert(abi.encodeWithSelector(Countersign.KeyNotRegistered.selector, seller));
        cs.affirm(t, seller, sig);
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(seller, true, 2, _seed(seller), 2592, true);
        vm.expectRevert(abi.encodeWithSelector(Countersign.UnsupportedKey.selector, seller));
        cs.affirm(t, seller, sig);
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(seller, true, 1, _seed(seller), 1312, true);
        vm.expectRevert(abi.encodeWithSelector(Countersign.UnsupportedKey.selector, seller));
        cs.affirm(t, seller, sig);
    }

    function test_A9_inactiveKeyStatusPrecompileFailsClosed() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(t));
        vm.etch(PQC_KEY_STATUS, ""); // mainnet today: no code, call succeeds with empty data
        vm.expectRevert(Countersign.PrecompileInactive.selector);
        cs.affirm(t, seller, sig);
        vm.etch(PQC_KEY_STATUS, address(new EmptyReturn()).code); // explicit empty return
        vm.expectRevert(Countersign.PrecompileInactive.selector);
        cs.affirm(t, seller, sig);
    }

    function test_A9_inactiveVerifyPrecompileFailsClosed() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(t));
        vm.etch(PQC_VERIFY, "");
        vm.expectRevert(Countersign.PrecompileInactive.selector);
        cs.affirm(t, seller, sig);
    }

    function test_A10_exactApproveAndPullLeaveZeroAllowance() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        assertEq(bond.allowance(seller, address(cs)), 0);
        assertEq(fusd.allowance(buyer, address(cs)), 0);
    }

    // ================================================================ state machine

    function test_doubleSettleReverts() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        _postNav(NAV_PRICE);
        cs.settle(id);
        vm.expectRevert(Countersign.AlreadySettled.selector);
        cs.settle(id);
        vm.warp(t.deadline + 1);
        vm.expectRevert(Countersign.AlreadySettled.selector);
        cs.reclaim(id);
    }

    function test_lockBeforeBothAffirmationsReverts() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        vm.prank(seller);
        vm.expectRevert(Countersign.NotAffirmed.selector);
        cs.lockAsset(id); // unknown trade
        cs.affirm(t, seller, _affirmSig(cs, seller, id));
        vm.startPrank(seller);
        bond.approve(address(cs), t.assetAmount);
        vm.expectRevert(Countersign.NotAffirmed.selector);
        cs.lockAsset(id); // buyer has not affirmed yet
        vm.stopPrank();
    }

    function test_doubleAffirmAndNonPartyAffirm() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        bytes memory sig = _affirmSig(cs, seller, id);
        cs.affirm(t, seller, sig);
        vm.expectRevert(Countersign.AlreadyAffirmed.selector);
        cs.affirm(t, seller, sig);
        bytes memory attackerSig = _affirmSig(cs, attacker, id);
        vm.expectRevert(Countersign.NotParty.selector);
        cs.affirm(t, attacker, attackerSig);
    }

    function test_doubleLockReverts() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        vm.startPrank(seller);
        bond.approve(address(cs), t.assetAmount);
        vm.expectRevert(Countersign.AlreadyLocked.selector);
        cs.lockAsset(id);
        vm.stopPrank();
    }

    function test_settleNeedsBothLegs() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _postNav(NAV_PRICE);
        vm.startPrank(seller);
        bond.approve(address(cs), t.assetAmount);
        cs.lockAsset(id);
        vm.stopPrank();
        vm.expectRevert(Countersign.NotLocked.selector);
        cs.settle(id);
    }

    function test_deadlinesAreEnforced() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        vm.warp(t.deadline); // settle is allowed AT the deadline
        _postNav(NAV_PRICE);
        uint256 snap = vm.snapshotState();
        cs.settle(id);
        vm.revertToState(snap);
        vm.warp(t.deadline + 1);
        vm.expectRevert(Countersign.DeadlinePassed.selector);
        cs.settle(id);
        // late affirmation / lock are refused too
        Countersign.Terms memory late = _defaultTerms(); // deadline = now + 1 day
        late.salt = 77;
        bytes32 lateId = cs.tradeIdOf(late);
        cs.affirm(late, seller, _affirmSig(cs, seller, lateId));
        vm.warp(late.deadline + 1);
        bytes memory buyerSig = _affirmSig(cs, buyer, lateId);
        vm.expectRevert(Countersign.DeadlinePassed.selector);
        cs.affirm(late, buyer, buyerSig);
    }

    function test_invalidTermsAreRejected() public {
        Countersign.Terms[] memory bad = new Countersign.Terms[](8);
        for (uint256 i; i < bad.length; ++i) {
            bad[i] = _defaultTerms(); // a fresh struct each time: memory assignment would alias
        }
        bad[0].seller = address(0);
        bad[1].buyer = seller;
        bad[2].asset = address(0);
        bad[3].cash = address(bond);
        bad[4].assetAmount = 0;
        bad[5].cashAmount = 0;
        bad[6].deadline = uint64(block.timestamp);
        bad[7].asset = address(cs);
        for (uint256 i; i < bad.length; ++i) {
            bytes memory sig = _affirmSig(cs, seller, cs.tradeIdOf(bad[i]));
            vm.expectRevert(Countersign.InvalidTerms.selector);
            cs.affirm(bad[i], seller, sig);
        }
    }

    function test_keyRotationIsPickedUp() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        bytes memory oldSig = _affirmSig(cs, seller, id);
        bytes32 newSeed = keccak256("rotated seller key");
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(seller, true, 1, newSeed, 2592, true);
        vm.expectRevert(Countersign.BadPqcSignature.selector);
        cs.affirm(t, seller, oldSig);
        cs.affirm(t, seller, _signWithSeed(newSeed, cs.affirmMessage(id)));
        assertTrue(cs.getTrade(id).sellerAffirmed);
    }

    function test_perLegReclaim_pausedBondDoesNotTrapCash() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        vm.prank(issuer);
        bond.pause(); // the issuer freezes the security
        vm.warp(t.deadline + 1);
        vm.expectRevert(); // the bond leg cannot move while paused
        cs.reclaim(id);
        uint256 buyerCash = fusd.balanceOf(buyer);
        cs.reclaimCash(id);
        assertEq(fusd.balanceOf(buyer) - buyerCash, t.cashAmount, "cash returned despite the paused bond");
        vm.expectRevert(Countersign.NotLocked.selector);
        cs.reclaimCash(id);
        vm.prank(issuer);
        bond.unpause();
        cs.reclaimAsset(id);
        assertEq(bond.balanceOf(address(cs)), 0);
    }

    function test_feeOnTransferTokenIsRefused() public {
        FeeOnTransferERC20 fee = new FeeOnTransferERC20();
        fee.mint(buyer, 1_000e6);
        Countersign c = new Countersign(CHAIN, officer, THRESHOLD, address(0), 0, 0);
        vm.prank(issuer);
        guard.setExempt(address(c), true, "test");
        Countersign.Terms memory t = _defaultTerms();
        t.cash = address(fee);
        bytes32 id = c.tradeIdOf(t);
        c.affirm(t, seller, _affirmSig(c, seller, id));
        c.affirm(t, buyer, _affirmSig(c, buyer, id));
        vm.startPrank(buyer);
        fee.approve(address(c), t.cashAmount);
        vm.expectRevert(Countersign.UnexpectedTransferAmount.selector);
        c.lockCash(id);
        vm.stopPrank();
    }

    function test_sealTicket() public {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        vm.prank(seller);
        vm.expectRevert(Countersign.NotAffirmed.selector);
        cs.sealTicket(id, hex"01");
        cs.affirm(t, seller, _affirmSig(cs, seller, id));
        vm.prank(attacker);
        vm.expectRevert(Countersign.NotParty.selector);
        cs.sealTicket(id, hex"01");
        vm.expectEmit(true, true, false, true, address(cs));
        emit Countersign.TicketSealed(id, seller, hex"c0ffee");
        vm.prank(seller);
        cs.sealTicket(id, hex"c0ffee");
    }

    // ================================================================ reentrancy

    function test_reentrancy_settleCannotBeReentered() public {
        ReentrantERC20 evil = new ReentrantERC20();
        Countersign c = new Countersign(CHAIN, officer, THRESHOLD, address(0), 0, 0);
        vm.prank(issuer);
        guard.setExempt(address(c), true, "test");
        evil.mint(buyer, 1_000e6);
        Countersign.Terms memory t = _defaultTerms();
        t.cash = address(evil);
        bytes32 id = c.tradeIdOf(t);
        c.affirm(t, seller, _affirmSig(c, seller, id));
        c.affirm(t, buyer, _affirmSig(c, buyer, id));
        vm.startPrank(seller);
        bond.approve(address(c), t.assetAmount);
        c.lockAsset(id);
        vm.stopPrank();
        vm.startPrank(buyer);
        evil.approve(address(c), t.cashAmount);
        c.lockCash(id);
        vm.stopPrank();

        evil.arm(address(c), id, true); // on the cash payout, try settle(id) again
        c.settle(id);
        assertEq(evil.attempts(), 1);
        assertEq(evil.blocked(), 1, "reentrant settle was blocked");
        assertEq(evil.balanceOf(seller), t.cashAmount, "paid once");
        assertEq(bond.balanceOf(buyer), t.assetAmount);
    }

    function test_reentrancy_reclaimCannotBeReentered() public {
        ReentrantERC20 evil = new ReentrantERC20();
        Countersign c = new Countersign(CHAIN, officer, THRESHOLD, address(0), 0, 0);
        evil.mint(buyer, 1_000e6);
        Countersign.Terms memory t = _defaultTerms();
        t.cash = address(evil);
        bytes32 id = c.tradeIdOf(t);
        c.affirm(t, seller, _affirmSig(c, seller, id));
        c.affirm(t, buyer, _affirmSig(c, buyer, id));
        vm.startPrank(buyer);
        evil.approve(address(c), t.cashAmount);
        c.lockCash(id);
        vm.stopPrank();
        vm.warp(t.deadline + 1);
        evil.arm(address(c), id, false); // on the refund, try reclaim(id) again
        c.reclaim(id);
        assertEq(evil.blocked(), 1, "reentrant reclaim was blocked");
        assertEq(evil.balanceOf(buyer), 1_000e6, "refunded once");
        assertEq(evil.balanceOf(address(c)), 0);
    }

    // ================================================================ fuzz

    function testFuzz_anyChangedFieldChangesTradeId(uint256 field, uint256 delta) public view {
        Countersign.Terms memory t = _defaultTerms();
        bytes32 id = cs.tradeIdOf(t);
        delta = bound(delta, 1, type(uint64).max);
        field = bound(field, 0, 8);
        if (field == 0) t.seller = address(uint160(t.seller) ^ uint160(delta));
        else if (field == 1) t.buyer = address(uint160(t.buyer) ^ uint160(delta));
        else if (field == 2) t.asset = address(uint160(t.asset) ^ uint160(delta));
        else if (field == 3) t.assetAmount += delta;
        else if (field == 4) t.cash = address(uint160(t.cash) ^ uint160(delta));
        else if (field == 5) t.cashAmount += delta;
        else if (field == 6) t.deadline = uint64(t.deadline ^ uint64(delta));
        else if (field == 7) t.ticketHash = bytes32(uint256(t.ticketHash) ^ delta);
        else t.salt += delta;
        assertTrue(cs.tradeIdOf(t) != id);
    }

    function testFuzz_settlementIsAllOrNothing(uint256 assetAmount, uint256 priceBps, uint256 salt, uint256 ttl) public {
        assetAmount = bound(assetAmount, 1, 900); // stays under the four-eyes threshold at NAV
        priceBps = bound(priceBps, 9_500, 10_500); // trade price within ±5 % of NAV
        ttl = bound(ttl, 1, 30 days);
        uint256 fair = NAV_PRICE * assetAmount;
        uint256 cashAmount = fair * priceBps / 10_000;
        Countersign.Terms memory t = _terms(assetAmount, cashAmount, salt);
        t.deadline = uint64(block.timestamp + ttl);
        bytes32 id = _affirmBoth(t);
        _lockBoth(t, id);
        _postNav(NAV_PRICE);
        uint256 sellerCash = fusd.balanceOf(seller);
        uint256 buyerBonds = bond.balanceOf(buyer);
        bool inBand = (cashAmount > fair ? cashAmount - fair : fair - cashAmount) * 10_000 <= uint256(MAX_DEV_BPS) * fair;
        try cs.settle(id) {
            assertTrue(inBand, "settled only in band");
            assertEq(bond.balanceOf(buyer) - buyerBonds, assetAmount);
            assertEq(fusd.balanceOf(seller) - sellerCash, cashAmount);
        } catch {
            assertFalse(inBand, "refused only out of band");
            assertEq(bond.balanceOf(buyer), buyerBonds, "no leg moved");
            assertEq(fusd.balanceOf(seller), sellerCash, "no leg moved");
            assertEq(bond.balanceOf(address(cs)), assetAmount);
            assertEq(fusd.balanceOf(address(cs)), cashAmount);
        }
    }
}
