// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Strings} from "@openzeppelin/contracts/utils/Strings.sol";
import {IQorePQC} from "./interfaces/IQorePQC.sol";

/// @title Countersign
/// @notice Post-quantum delivery-versus-payment (DvP) for tokenized securities on QoreChain.
///
/// A security leg (a CMTAT bond guarded by the Asset Kit hybrid-holder rule) and a cash leg (fUSD) swap in ONE
/// transaction, or not at all. Every approval is an ML-DSA-87 signature verified on chain by the pqcVerify
/// precompile against the key the signer registered on chain (pqcKeyStatus, with proof of possession). A stolen
/// or broken secp256k1 key alone cannot affirm, approve or price a trade.
///
/// Messages follow QoreSign message-signing-v1, exactly what QoreX `signArbitrary` signs:
///   pqcVerify bytes = "qorechain-msg-v1|" + nativeChainId + "|" + data
/// so the same contract accepts signatures from QoreX and from scripts (pqcSign + messagePqSignBytes).
///
/// No owner, no upgradeability, no setters: nobody can move escrowed funds except through settle / reclaim.
/// Pattern for the fail-closed precompile calls: QoreChain "Build Before Q-Day" workshop 2 (QDayVault).
contract Countersign is ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------- constants

    /// Lowercase on purpose: a mixed-case address literal fails the checksum check.
    address internal constant PQC_VERIFY = 0x0000000000000000000000000000000000000a01;
    address internal constant PQC_KEY_STATUS = 0x0000000000000000000000000000000000000a02;

    uint8 public constant ML_DSA_87 = 1;
    uint256 public constant PUBKEY_LENGTH = 2592;
    uint256 public constant SIGNATURE_LENGTH = 4627;
    uint256 internal constant BPS = 10_000;

    bytes32 public constant TERMS_TYPEHASH = keccak256(
        "Countersign.Terms(address seller,address buyer,address asset,uint256 assetAmount,address cash,uint256 cashAmount,uint64 deadline,bytes32 ticketHash,uint256 salt)"
    );

    // ---------------------------------------------------------------- types

    struct Terms {
        address seller;
        address buyer;
        address asset; // security leg (CMTAT bond)
        uint256 assetAmount;
        address cash; // cash leg (fUSD)
        uint256 cashAmount;
        uint64 deadline; // unix seconds; settle at or before, reclaim after
        bytes32 ticketHash; // keccak256 of the plaintext ticket JSON (QoreSeal); 0 if unused
        uint256 salt; // makes every tradeId unique
    }

    enum Status {
        None,
        Open,
        Settled,
        Reclaimed
    }

    struct Trade {
        Terms terms;
        Status status;
        bool sellerAffirmed;
        bool buyerAffirmed;
        bool officerApproved;
        bool assetLocked;
        bool cashLocked;
    }

    struct Nav {
        uint256 price; // cash base units per 1 asset unit
        uint64 timestamp;
    }

    // ---------------------------------------------------------------- immutable config

    /// The QoreSign domain prefix "qorechain-msg-v1|<nativeChainId>|", set once in the constructor.
    bytes internal domainPrefix;
    string public nativeChainId;
    /// Four-eyes approver for trades with cashAmount >= largeTradeThreshold (address(0): rule disabled).
    address public immutable officer;
    uint256 public immutable largeTradeThreshold;
    /// Signs NAV prices (address(0): no price check).
    address public immutable navAttestor;
    uint64 public immutable maxNavAge;
    uint16 public immutable maxDeviationBps;

    // ---------------------------------------------------------------- state

    mapping(bytes32 tradeId => Trade) internal trades;
    mapping(address asset => mapping(address cash => Nav)) public latestNav;
    mapping(uint256 nonce => bool) public navNonceUsed;

    // ---------------------------------------------------------------- events

    event TradeOpened(bytes32 indexed tradeId, address indexed seller, address indexed buyer, Terms terms);
    event Affirmed(bytes32 indexed tradeId, address indexed party);
    event ApprovedLarge(bytes32 indexed tradeId, address indexed officer);
    event NavPosted(address indexed asset, address indexed cash, uint256 price, uint64 timestamp, uint256 nonce);
    event Locked(bytes32 indexed tradeId, address indexed from, address indexed token, uint256 amount);
    event Settled(bytes32 indexed tradeId, address indexed seller, address indexed buyer, uint256 assetAmount, uint256 cashAmount);
    event Reclaimed(bytes32 indexed tradeId, address indexed to, address indexed token, uint256 amount);
    event TicketSealed(bytes32 indexed tradeId, address indexed by, bytes envelope);

    // ---------------------------------------------------------------- errors

    error InvalidConfig();
    error InvalidTerms();
    error KeyNotRegistered(address account);
    error KeyNotProven(address account);
    error UnsupportedKey(address account);
    error BadSignatureLength();
    error BadPqcSignature();
    error PrecompileInactive();
    error NotParty();
    error NotAffirmed();
    error AlreadyAffirmed();
    error AlreadyLocked();
    error NotLocked();
    error AlreadySettled();
    error TradeClosed();
    error DeadlinePassed();
    error DeadlineNotPassed();
    error OfficerApprovalRequired();
    error NoOfficer();
    error NavStale();
    error PriceOutOfBand(uint256 cashAmount, uint256 fairCash);
    error InvalidNav();
    error NavNonceUsed();
    error NoTicket();
    error UnexpectedTransferAmount();

    // ---------------------------------------------------------------- constructor

    constructor(
        string memory nativeChainId_,
        address officer_,
        uint256 largeTradeThreshold_,
        address navAttestor_,
        uint64 maxNavAge_,
        uint16 maxDeviationBps_
    ) {
        bytes memory id = bytes(nativeChainId_);
        if (id.length == 0 || id.length > 64) revert InvalidConfig();
        for (uint256 i; i < id.length; ++i) {
            bytes1 c = id[i];
            bool ok = (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || (c >= "0" && c <= "9") || c == "." || c == "_"
                || c == "-";
            if (!ok) revert InvalidConfig(); // same rule as QoreSign's checkChainId
        }
        if (navAttestor_ != address(0) && (maxNavAge_ == 0 || maxDeviationBps_ > BPS)) revert InvalidConfig();

        nativeChainId = nativeChainId_;
        domainPrefix = bytes.concat("qorechain-msg-v1|", id, "|");
        officer = officer_;
        largeTradeThreshold = largeTradeThreshold_;
        navAttestor = navAttestor_;
        maxNavAge = maxNavAge_;
        maxDeviationBps = maxDeviationBps_;
    }

    // ---------------------------------------------------------------- views: ids and messages

    /// tradeId binds every field of the terms, the chain and this contract.
    function tradeIdOf(Terms calldata t) public view returns (bytes32) {
        return keccak256(abi.encode(TERMS_TYPEHASH, block.chainid, address(this), t));
    }

    /// The string a party signs (what QoreX shows): "countersign:v1:affirm:0x<64 lowercase hex>".
    function affirmData(bytes32 tradeId) public pure returns (string memory) {
        return string.concat("countersign:v1:affirm:", Strings.toHexString(uint256(tradeId), 32));
    }

    /// The string the officer signs: "countersign:v1:approve:0x<64 lowercase hex>".
    function approveData(bytes32 tradeId) public pure returns (string memory) {
        return string.concat("countersign:v1:approve:", Strings.toHexString(uint256(tradeId), 32));
    }

    /// The string the NAV attestor signs. Human-readable (no blind signing in QoreX) and bound to the cash token.
    function navData(address asset, address cash, uint256 price, uint64 timestamp, uint256 nonce)
        public
        pure
        returns (string memory)
    {
        return string.concat(
            "countersign:v1:nav:asset=",
            Strings.toHexString(asset),
            ";cash=",
            Strings.toHexString(cash),
            ";price=",
            Strings.toString(price),
            ";ts=",
            Strings.toString(timestamp),
            ";nonce=",
            Strings.toString(nonce)
        );
    }

    /// The exact bytes pqcVerify checks for a given data string (QoreSign message-signing-v1).
    function signedBytes(string memory data) public view returns (bytes memory) {
        return bytes.concat(domainPrefix, bytes(data));
    }

    function affirmMessage(bytes32 tradeId) external view returns (bytes memory) {
        return signedBytes(affirmData(tradeId));
    }

    function getTrade(bytes32 tradeId) external view returns (Trade memory) {
        return trades[tradeId];
    }

    function requiresOfficer(uint256 cashAmount) public view returns (bool) {
        return officer != address(0) && cashAmount >= largeTradeThreshold;
    }

    // ---------------------------------------------------------------- affirm / approve / price

    /// Submit a party's ML-DSA-87 affirmation. Anyone may submit: the signature authorises, not the sender.
    /// The first valid affirmation opens the trade and records its terms (TradeOpened, for discovery).
    function affirm(Terms calldata t, address party, bytes calldata sig) external {
        bytes32 id = tradeIdOf(t);
        Trade storage tr = trades[id];
        if (tr.status == Status.None) {
            _validateTerms(t);
        } else if (tr.status != Status.Open) {
            revert TradeClosed();
        }
        if (block.timestamp > t.deadline) revert DeadlinePassed();

        bool isSeller = party == t.seller;
        if (!isSeller && party != t.buyer) revert NotParty();
        if (isSeller ? tr.sellerAffirmed : tr.buyerAffirmed) revert AlreadyAffirmed();

        _requirePqSignature(party, signedBytes(affirmData(id)), sig);

        if (tr.status == Status.None) {
            tr.terms = t;
            tr.status = Status.Open;
            emit TradeOpened(id, t.seller, t.buyer, t);
        }
        if (isSeller) tr.sellerAffirmed = true;
        else tr.buyerAffirmed = true;
        emit Affirmed(id, party);
    }

    /// The officer's ML-DSA-87 approval of a (large) trade. Anyone may submit it.
    function approveLarge(bytes32 tradeId, bytes calldata sig) external {
        if (officer == address(0)) revert NoOfficer();
        Trade storage tr = _openTrade(tradeId);
        if (block.timestamp > tr.terms.deadline) revert DeadlinePassed();
        if (tr.officerApproved) revert AlreadyAffirmed();
        _requirePqSignature(officer, signedBytes(approveData(tradeId)), sig);
        tr.officerApproved = true;
        emit ApprovedLarge(tradeId, officer);
    }

    /// Post an ML-DSA-87-signed NAV for (asset, cash). Anyone may submit it. Each nonce works once, and a NAV
    /// must be newer than the current one, so an old signed price cannot be replayed or posted out of order.
    function postNav(address asset, address cash, uint256 price, uint64 timestamp, uint256 nonce, bytes calldata sig)
        external
    {
        if (navAttestor == address(0)) revert InvalidConfig();
        if (price == 0 || timestamp > block.timestamp || timestamp <= latestNav[asset][cash].timestamp) {
            revert InvalidNav();
        }
        if (navNonceUsed[nonce]) revert NavNonceUsed();
        _requirePqSignature(navAttestor, signedBytes(navData(asset, cash, price, timestamp, nonce)), sig);
        navNonceUsed[nonce] = true;
        latestNav[asset][cash] = Nav(price, timestamp);
        emit NavPosted(asset, cash, price, timestamp, nonce);
    }

    // ---------------------------------------------------------------- lock / settle / reclaim

    /// The seller pulls in exactly assetAmount (after an exact approve). Needs both affirmations.
    function lockAsset(bytes32 tradeId) external nonReentrant {
        Trade storage tr = _lockable(tradeId);
        if (msg.sender != tr.terms.seller) revert NotParty();
        if (tr.assetLocked) revert AlreadyLocked();
        tr.assetLocked = true;
        _pullExact(IERC20(tr.terms.asset), msg.sender, tr.terms.assetAmount);
        emit Locked(tradeId, msg.sender, tr.terms.asset, tr.terms.assetAmount);
    }

    /// The buyer pulls in exactly cashAmount (after an exact approve). Needs both affirmations.
    function lockCash(bytes32 tradeId) external nonReentrant {
        Trade storage tr = _lockable(tradeId);
        if (msg.sender != tr.terms.buyer) revert NotParty();
        if (tr.cashLocked) revert AlreadyLocked();
        tr.cashLocked = true;
        _pullExact(IERC20(tr.terms.cash), msg.sender, tr.terms.cashAmount);
        emit Locked(tradeId, msg.sender, tr.terms.cash, tr.terms.cashAmount);
    }

    /// Delivery versus payment: asset to the buyer AND cash to the seller in this one transaction, or neither.
    /// Anyone may call it once every condition holds.
    function settle(bytes32 tradeId) external nonReentrant {
        Trade storage tr = _openTrade(tradeId);
        Terms memory t = tr.terms;
        if (block.timestamp > t.deadline) revert DeadlinePassed();
        if (!tr.sellerAffirmed || !tr.buyerAffirmed) revert NotAffirmed();
        if (!tr.assetLocked || !tr.cashLocked) revert NotLocked();
        if (requiresOfficer(t.cashAmount) && !tr.officerApproved) revert OfficerApprovalRequired();
        if (navAttestor != address(0)) _requireFairPrice(t);

        tr.status = Status.Settled;
        tr.assetLocked = false;
        tr.cashLocked = false;
        IERC20(t.asset).safeTransfer(t.buyer, t.assetAmount);
        IERC20(t.cash).safeTransfer(t.seller, t.cashAmount);
        emit Settled(tradeId, t.seller, t.buyer, t.assetAmount, t.cashAmount);
    }

    /// After the deadline, return every still-locked leg to its original depositor. Anyone may call it.
    function reclaim(bytes32 tradeId) external nonReentrant {
        Trade storage tr = _reclaimable(tradeId);
        if (!tr.assetLocked && !tr.cashLocked) revert NotLocked();
        if (tr.assetLocked) _refundAsset(tradeId, tr);
        if (tr.cashLocked) _refundCash(tradeId, tr);
    }

    /// Per-leg escape hatch: if one leg cannot move (e.g. the issuer paused the bond), the other still returns.
    function reclaimAsset(bytes32 tradeId) external nonReentrant {
        Trade storage tr = _reclaimable(tradeId);
        if (!tr.assetLocked) revert NotLocked();
        _refundAsset(tradeId, tr);
    }

    function reclaimCash(bytes32 tradeId) external nonReentrant {
        Trade storage tr = _reclaimable(tradeId);
        if (!tr.cashLocked) revert NotLocked();
        _refundCash(tradeId, tr);
    }

    /// Publish the QoreSeal envelope of the trade ticket. Recipients check what they decrypt against
    /// terms.ticketHash, so a forged envelope is detectable; only the payload is confidential.
    function sealTicket(bytes32 tradeId, bytes calldata envelope) external {
        Trade storage tr = trades[tradeId];
        if (tr.status == Status.None) revert NotAffirmed();
        if (msg.sender != tr.terms.seller && msg.sender != tr.terms.buyer) revert NotParty();
        if (tr.terms.ticketHash == bytes32(0)) revert NoTicket();
        emit TicketSealed(tradeId, msg.sender, envelope);
    }

    // ---------------------------------------------------------------- internals

    function _validateTerms(Terms calldata t) internal view {
        if (
            t.seller == address(0) || t.buyer == address(0) || t.seller == t.buyer || t.asset == address(0)
                || t.cash == address(0) || t.asset == t.cash || t.asset == address(this) || t.cash == address(this)
                || t.assetAmount == 0 || t.cashAmount == 0 || t.deadline <= block.timestamp
        ) revert InvalidTerms();
    }

    function _openTrade(bytes32 tradeId) internal view returns (Trade storage tr) {
        tr = trades[tradeId];
        if (tr.status == Status.None) revert NotAffirmed();
        if (tr.status == Status.Settled) revert AlreadySettled();
        if (tr.status != Status.Open) revert TradeClosed();
    }

    function _lockable(bytes32 tradeId) internal view returns (Trade storage tr) {
        tr = _openTrade(tradeId);
        if (block.timestamp > tr.terms.deadline) revert DeadlinePassed();
        if (!tr.sellerAffirmed || !tr.buyerAffirmed) revert NotAffirmed();
    }

    function _reclaimable(bytes32 tradeId) internal returns (Trade storage tr) {
        tr = trades[tradeId];
        if (tr.status == Status.None) revert NotAffirmed();
        if (tr.status == Status.Settled) revert AlreadySettled();
        if (block.timestamp <= tr.terms.deadline) revert DeadlineNotPassed();
        tr.status = Status.Reclaimed; // a trade past its deadline can never settle; mark it closed
    }

    function _refundAsset(bytes32 tradeId, Trade storage tr) internal {
        tr.assetLocked = false;
        IERC20(tr.terms.asset).safeTransfer(tr.terms.seller, tr.terms.assetAmount);
        emit Reclaimed(tradeId, tr.terms.seller, tr.terms.asset, tr.terms.assetAmount);
    }

    function _refundCash(bytes32 tradeId, Trade storage tr) internal {
        tr.cashLocked = false;
        IERC20(tr.terms.cash).safeTransfer(tr.terms.buyer, tr.terms.cashAmount);
        emit Reclaimed(tradeId, tr.terms.buyer, tr.terms.cash, tr.terms.cashAmount);
    }

    /// transferFrom exactly `amount` and check that exactly `amount` arrived (refuses fee-on-transfer tokens).
    function _pullExact(IERC20 token, address from, uint256 amount) internal {
        uint256 before = token.balanceOf(address(this));
        token.safeTransferFrom(from, address(this), amount);
        if (token.balanceOf(address(this)) - before != amount) revert UnexpectedTransferAmount();
    }

    function _requireFairPrice(Terms memory t) internal view {
        Nav memory nav = latestNav[t.asset][t.cash];
        if (nav.timestamp == 0 || block.timestamp - nav.timestamp > maxNavAge) revert NavStale();
        uint256 fair = nav.price * t.assetAmount;
        uint256 diff = t.cashAmount > fair ? t.cashAmount - fair : fair - t.cashAmount;
        if (diff * BPS > uint256(maxDeviationBps) * fair) revert PriceOutOfBand(t.cashAmount, fair);
    }

    /// Fail-closed ML-DSA-87 check against the key `account` registered on chain. The key is read on every
    /// call and never stored, so a key the account rotates on chain is picked up automatically.
    function _requirePqSignature(address account, bytes memory message, bytes calldata sig) internal view {
        if (sig.length != SIGNATURE_LENGTH) revert BadSignatureLength();

        (bool ok, bytes memory ret) = PQC_KEY_STATUS.staticcall(abi.encodeCall(IQorePQC.pqcKeyStatus, (account)));
        // An inactive precompile (mainnet today) answers success with empty data: fail closed.
        if (!ok || ret.length < 160) revert PrecompileInactive();
        (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven) =
            abi.decode(ret, (bool, uint8, bytes, bool));
        if (!registered) revert KeyNotRegistered(account);
        if (!possessionProven) revert KeyNotProven(account);
        if (algorithmId != ML_DSA_87 || pubkey.length != PUBKEY_LENGTH) revert UnsupportedKey(account);

        (ok, ret) = PQC_VERIFY.staticcall(abi.encodeCall(IQorePQC.pqcVerify, (pubkey, sig, message)));
        if (!ok || ret.length != 32) revert PrecompileInactive();
        if (!abi.decode(ret, (bool))) revert BadPqcSignature();
    }
}
