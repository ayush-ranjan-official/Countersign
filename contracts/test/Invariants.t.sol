// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {CommonBase} from "forge-std/Base.sol";
import {StdUtils} from "forge-std/StdUtils.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Countersign} from "../src/Countersign.sol";
import {CountersignFixture} from "./utils/CountersignFixture.sol";
import {MockPqcKeyStatus} from "./mocks/MockPqcKeyStatus.sol";

/// Drives random affirm / lock / settle / reclaim / time-warp sequences over a fixed set of trades.
contract CountersignHandler is CommonBase, StdUtils {
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    Countersign public immutable cs;
    IERC20 public immutable bond;
    IERC20 public immutable fusd;
    address public immutable attestor;
    Countersign.Terms[] internal tradeTerms;
    uint256 internal navNonce;

    // ghosts
    bool public oneLegOnly; // a settle that moved exactly one leg
    bool public wrongRefund; // a reclaim that paid anyone but the original depositors
    uint256 public settles;
    uint256 public reclaims;

    constructor(Countersign cs_, IERC20 bond_, IERC20 fusd_, address attestor_) {
        cs = cs_;
        bond = bond_;
        fusd = fusd_;
        attestor = attestor_;
    }

    function addTrade(Countersign.Terms memory t) external {
        tradeTerms.push(t);
    }

    function tradeCount() external view returns (uint256) {
        return tradeTerms.length;
    }

    function termsAt(uint256 i) external view returns (Countersign.Terms memory) {
        return tradeTerms[i];
    }

    function _pick(uint256 i) internal view returns (Countersign.Terms memory t, bytes32 id) {
        t = tradeTerms[bound(i, 0, tradeTerms.length - 1)];
        id = cs.tradeIdOf(t);
    }

    function _sign(address signer, bytes memory message) internal pure returns (bytes memory sig) {
        bytes memory key = MockPqcKeyStatus(PQC_KEY_STATUS).keyOf(keccak256(abi.encode("ml-dsa-87 test key", signer)), 2592);
        bytes32 h = keccak256(abi.encodePacked(key, message));
        sig = new bytes(4627);
        assembly ("memory-safe") {
            mstore(add(sig, 32), h)
        }
    }

    // ------------------------------------------------------------ actions

    function affirm(uint256 i, bool asSeller) external {
        (Countersign.Terms memory t, bytes32 id) = _pick(i);
        address party = asSeller ? t.seller : t.buyer;
        bytes memory sig = _sign(party, cs.signedBytes(cs.affirmData(id)));
        try cs.affirm(t, party, sig) {} catch {}
    }

    function lock(uint256 i, bool assetLeg) external {
        (Countersign.Terms memory t, bytes32 id) = _pick(i);
        if (assetLeg) {
            vm.startPrank(t.seller);
            bond.approve(address(cs), t.assetAmount);
            try cs.lockAsset(id) {} catch {}
            bond.approve(address(cs), 0);
        } else {
            vm.startPrank(t.buyer);
            fusd.approve(address(cs), t.cashAmount);
            try cs.lockCash(id) {} catch {}
            fusd.approve(address(cs), 0);
        }
        vm.stopPrank();
    }

    function settle(uint256 i) external {
        (Countersign.Terms memory t, bytes32 id) = _pick(i);
        // keep a fresh NAV around so settle is reachable
        uint64 ts = uint64(block.timestamp);
        (, uint64 last) = cs.latestNav(t.asset, t.cash);
        if (ts > last) {
            uint256 nonce = ++navNonce;
            uint256 price = t.cashAmount / t.assetAmount;
            bytes memory sig = _sign(attestor, cs.signedBytes(cs.navData(t.asset, t.cash, price, ts, nonce)));
            try cs.postNav(t.asset, t.cash, price, ts, nonce, sig) {} catch {}
        }
        uint256 buyerBonds = bond.balanceOf(t.buyer);
        uint256 sellerCash = fusd.balanceOf(t.seller);
        try cs.settle(id) {
            settles++;
        } catch {}
        bool assetMoved = bond.balanceOf(t.buyer) != buyerBonds;
        bool cashMoved = fusd.balanceOf(t.seller) != sellerCash;
        if (assetMoved != cashMoved) oneLegOnly = true;
        if (assetMoved && bond.balanceOf(t.buyer) - buyerBonds != t.assetAmount) oneLegOnly = true;
        if (cashMoved && fusd.balanceOf(t.seller) - sellerCash != t.cashAmount) oneLegOnly = true;
    }

    function reclaim(uint256 i) external {
        (Countersign.Terms memory t, bytes32 id) = _pick(i);
        Countersign.Trade memory before = cs.getTrade(id);
        uint256 sellerBonds = bond.balanceOf(t.seller);
        uint256 buyerCash = fusd.balanceOf(t.buyer);
        try cs.reclaim(id) {
            reclaims++;
            if (before.assetLocked && bond.balanceOf(t.seller) - sellerBonds != t.assetAmount) wrongRefund = true;
            if (before.cashLocked && fusd.balanceOf(t.buyer) - buyerCash != t.cashAmount) wrongRefund = true;
        } catch {}
    }

    function warp(uint256 dt) external {
        vm.warp(block.timestamp + bound(dt, 0, 8 hours));
    }
}

contract CountersignInvariants is CountersignFixture {
    CountersignHandler internal handler;

    function setUp() public override {
        super.setUp();
        handler = new CountersignHandler(cs, IERC20(address(bond)), IERC20(address(fusd)), attestor);
        // six trades of different sizes and deadlines (all under the four-eyes threshold, priced at NAV)
        for (uint256 i; i < 6; ++i) {
            Countersign.Terms memory t = _terms(1 + i * 7, (1 + i * 7) * NAV_PRICE, 1000 + i);
            t.deadline = uint64(block.timestamp + 4 hours + i * 6 hours);
            handler.addTrade(t);
        }
        targetContract(address(handler));
        // Fuzz only the actions: addTrade is setup-only (random terms would pollute the fixed trade set).
        bytes4[] memory actions = new bytes4[](5);
        actions[0] = CountersignHandler.affirm.selector;
        actions[1] = CountersignHandler.lock.selector;
        actions[2] = CountersignHandler.settle.selector;
        actions[3] = CountersignHandler.reclaim.selector;
        actions[4] = CountersignHandler.warp.selector;
        targetSelector(FuzzSelector({addr: address(handler), selectors: actions}));
    }

    /// Countersign holds exactly the sum of the locked, unsettled, unreclaimed legs. Nothing more, nothing less.
    function invariant_escrowBalancesMatchLockedLegs() public view {
        uint256 bonds;
        uint256 cash;
        for (uint256 i; i < handler.tradeCount(); ++i) {
            Countersign.Terms memory t = handler.termsAt(i);
            Countersign.Trade memory tr = cs.getTrade(cs.tradeIdOf(t));
            if (tr.assetLocked) bonds += t.assetAmount;
            if (tr.cashLocked) cash += t.cashAmount;
        }
        assertEq(bond.balanceOf(address(cs)), bonds, "bond escrow");
        assertEq(fusd.balanceOf(address(cs)), cash, "cash escrow");
    }

    /// No settlement ever moves only one leg, and refunds only go to the original depositors.
    function invariant_allOrNothing() public view {
        assertFalse(handler.oneLegOnly(), "a settle moved one leg only");
        assertFalse(handler.wrongRefund(), "a reclaim paid the wrong account");
    }

    /// A settled or reclaimed trade holds nothing; a settled trade had both affirmations.
    function invariant_closedTradesHoldNothing() public view {
        for (uint256 i; i < handler.tradeCount(); ++i) {
            Countersign.Trade memory tr = cs.getTrade(cs.tradeIdOf(handler.termsAt(i)));
            if (tr.status == Countersign.Status.Settled) {
                assertFalse(tr.assetLocked || tr.cashLocked, "settled trade still holds a leg");
                assertTrue(tr.sellerAffirmed && tr.buyerAffirmed, "settled without both affirmations");
            }
            if (tr.status == Countersign.Status.Reclaimed) {
                assertFalse(tr.assetLocked || tr.cashLocked, "reclaimed trade still holds a leg");
            }
        }
    }

    /// The handler is not silently reverting everything: a scripted sequence through it settles and reclaims.
    function test_handlerReachesSettleAndReclaim() public {
        handler.affirm(0, true);
        handler.affirm(0, false);
        handler.lock(0, true);
        handler.lock(0, false);
        handler.settle(0);
        assertEq(handler.settles(), 1, "handler settle");

        handler.affirm(1, true);
        handler.affirm(1, false);
        handler.lock(1, false);
        vm.warp(handler.termsAt(1).deadline + 1);
        handler.reclaim(1);
        assertEq(handler.reclaims(), 1, "handler reclaim");
        invariant_escrowBalancesMatchLockedLegs();
        invariant_allOrNothing();
        invariant_closedTradesHoldNothing();
    }
}
