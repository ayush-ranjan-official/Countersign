// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CMTATStandalone} from "CMTAT/deployment/CMTATStandalone.sol";
import {ICMTATConstructor} from "CMTAT/interfaces/technical/ICMTATConstructor.sol";
import {IERC1643CMTAT} from "CMTAT/interfaces/tokenization/draft-IERC1643CMTAT.sol";
import {IRuleEngine} from "CMTAT/interfaces/engine/IRuleEngine.sol";
import {QoreChainHybridHolderGuard} from "asset-kit/guard/QoreChainHybridHolderGuard.sol";
import {QoreChainHybridHolderRule} from "asset-kit/cmtat/QoreChainHybridHolderRule.sol";
import {Countersign} from "../../src/Countersign.sol";
import {MockPqcKeyStatus} from "../mocks/MockPqcKeyStatus.sol";
import {MockPqcVerify} from "../mocks/MockPqcVerify.sol";
import {MockERC20} from "../mocks/MockTokens.sol";

/// Shared setup: the real Asset Kit CMTAT bond + hybrid-holder guard/rule, an fUSD stand-in, Countersign exempted
/// in the guard, and both QoreChain precompiles mocked with vm.etch (Foundry's EVM has none).
abstract contract CountersignFixture is Test {
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;
    string internal constant CHAIN = "qorechain-diana";

    uint256 internal constant THRESHOLD = 100_000e6; // four-eyes from 100k fUSD
    uint64 internal constant MAX_NAV_AGE = 1 days;
    uint16 internal constant MAX_DEV_BPS = 200; // 2 %
    uint256 internal constant NAV_PRICE = 100e6; // 1 bond = 100 fUSD

    address internal issuer = makeAddr("issuer");
    address internal seller = makeAddr("seller");
    address internal buyer = makeAddr("buyer");
    address internal officer = makeAddr("officer");
    address internal attestor = makeAddr("attestor");
    address internal attacker = makeAddr("attacker");
    address internal relayer = makeAddr("relayer");

    QoreChainHybridHolderGuard internal guard;
    CMTATStandalone internal bond;
    MockERC20 internal fusd;
    Countersign internal cs;
    uint256 internal navNonce;

    function setUp() public virtual {
        vm.warp(1_790_000_000);
        vm.etch(PQC_VERIFY, address(new MockPqcVerify()).code);
        vm.etch(PQC_KEY_STATUS, address(new MockPqcKeyStatus()).code);
        _register(seller);
        _register(buyer);
        _register(officer);
        _register(attestor);
        _register(attacker);

        vm.startPrank(issuer);
        guard = new QoreChainHybridHolderGuard(issuer);
        QoreChainHybridHolderRule rule = new QoreChainHybridHolderRule(guard);
        bond = new CMTATStandalone(
            address(0),
            issuer,
            ICMTATConstructor.ERC20Attributes({name: "Demo Bond", symbol: "CSB", decimalsIrrevocable: 0}),
            ICMTATConstructor.ExtraInformationAttributes({
                tokenId: "DEMO",
                terms: IERC1643CMTAT.DocumentInfo({name: "Terms", uri: "", documentHash: bytes32(0)}),
                information: ""
            }),
            ICMTATConstructor.Engine({ruleEngine: IRuleEngine(address(rule))})
        );
        vm.stopPrank();

        fusd = new MockERC20("FestUSD", "fUSD", 6);
        cs = _deploy(CHAIN);
        vm.prank(issuer);
        guard.setExempt(address(cs), true, "Countersign DvP escrow");

        vm.prank(issuer);
        bond.mint(seller, 1_000_000);
        fusd.mint(buyer, 10_000_000e6);
    }

    function _deploy(string memory chain) internal returns (Countersign) {
        return new Countersign(chain, officer, THRESHOLD, attestor, MAX_NAV_AGE, MAX_DEV_BPS);
    }

    // ------------------------------------------------------------ keys and signatures

    function _seed(address a) internal pure returns (bytes32) {
        return keccak256(abi.encode("ml-dsa-87 test key", a));
    }

    function _register(address a) internal {
        MockPqcKeyStatus(PQC_KEY_STATUS).setStatus(a, true, 1, _seed(a), 2592, true);
    }

    /// A mock ML-DSA-87 signature by the key with `seed` over `message` (see MockPqcVerify).
    function _signWithSeed(bytes32 seed, bytes memory message) internal pure returns (bytes memory sig) {
        bytes memory key = MockPqcKeyStatus(PQC_KEY_STATUS).keyOf(seed, 2592);
        bytes32 h = keccak256(abi.encodePacked(key, message));
        sig = new bytes(4627);
        assembly ("memory-safe") {
            mstore(add(sig, 32), h)
        }
    }

    function _sign(address signer, bytes memory message) internal pure returns (bytes memory) {
        return _signWithSeed(_seed(signer), message);
    }

    function _affirmSig(Countersign c, address party, bytes32 id) internal view returns (bytes memory) {
        return _sign(party, c.signedBytes(c.affirmData(id)));
    }

    // ------------------------------------------------------------ trade helpers

    function _terms(uint256 assetAmount, uint256 cashAmount, uint256 salt) internal view returns (Countersign.Terms memory) {
        return Countersign.Terms({
            seller: seller,
            buyer: buyer,
            asset: address(bond),
            assetAmount: assetAmount,
            cash: address(fusd),
            cashAmount: cashAmount,
            deadline: uint64(block.timestamp + 1 days),
            ticketHash: keccak256("ticket"),
            salt: salt
        });
    }

    function _defaultTerms() internal view returns (Countersign.Terms memory) {
        return _terms(10, 10 * NAV_PRICE, 1); // 10 bonds for 1,000 fUSD, exactly at NAV
    }

    function _affirmBoth(Countersign.Terms memory t) internal returns (bytes32 id) {
        id = cs.tradeIdOf(t);
        cs.affirm(t, t.seller, _affirmSig(cs, t.seller, id));
        cs.affirm(t, t.buyer, _affirmSig(cs, t.buyer, id));
    }

    function _lockBoth(Countersign.Terms memory t, bytes32 id) internal {
        vm.startPrank(t.seller);
        bond.approve(address(cs), t.assetAmount);
        cs.lockAsset(id);
        vm.stopPrank();
        vm.startPrank(t.buyer);
        fusd.approve(address(cs), t.cashAmount);
        cs.lockCash(id);
        vm.stopPrank();
    }

    function _postNav(uint256 price) internal {
        _postNavAt(price, uint64(block.timestamp));
    }

    function _postNavAt(uint256 price, uint64 ts) internal {
        uint256 nonce = ++navNonce;
        bytes memory sig = _sign(attestor, cs.signedBytes(cs.navData(address(bond), address(fusd), price, ts, nonce)));
        cs.postNav(address(bond), address(fusd), price, ts, nonce, sig);
    }

    function _approveLarge(bytes32 id) internal {
        cs.approveLarge(id, _sign(officer, cs.signedBytes(cs.approveData(id))));
    }
}
