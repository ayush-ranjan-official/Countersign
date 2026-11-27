// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IHolderEligibility} from "asset-kit/interfaces/IHolderEligibility.sol";

interface IBondMint {
    function mint(address account, uint256 value) external;
}

/// @title DemoBondFaucet
/// @notice TESTNET DEMO ONLY. Lets anyone whose wallet is a hybrid holder (a registered ML-DSA-87 key with proof of
/// possession, as the Asset Kit guard decides) claim a fixed amount of the DEMO bond once per cooldown, so any
/// QoreX user can act as a seller in Countersign without the issuer minting to them by hand.
///
/// It is not issuance and not an issuer console: the issuer grants it CMTAT MINTER_ROLE on the demo bond only, and
/// it can only mint `amountPerClaim` to the caller. The guard still refuses wallets without a PQ key (the CMTAT rule
/// re-checks the receiver on mint). No owner, no setters.
contract DemoBondFaucet {
    IBondMint public immutable bond;
    IHolderEligibility public immutable guard;
    uint256 public immutable amountPerClaim;
    uint64 public immutable cooldown;

    mapping(address account => uint64 timestamp) public lastClaim;

    event Claimed(address indexed account, uint256 amount);

    error InvalidConfig();
    error NotHybridHolder(address account);
    error TooSoon(uint64 nextClaimAt);

    constructor(IBondMint bond_, IHolderEligibility guard_, uint256 amountPerClaim_, uint64 cooldown_) {
        if (address(bond_) == address(0) || address(guard_) == address(0) || amountPerClaim_ == 0 || cooldown_ == 0) {
            revert InvalidConfig();
        }
        bond = bond_;
        guard = guard_;
        amountPerClaim = amountPerClaim_;
        cooldown = cooldown_;
    }

    /// When `account` may claim next (0: now).
    function nextClaimAt(address account) public view returns (uint64) {
        uint64 last = lastClaim[account];
        return last == 0 ? 0 : last + cooldown;
    }

    function claim() external {
        if (!guard.isEligible(msg.sender)) revert NotHybridHolder(msg.sender);
        uint64 next = nextClaimAt(msg.sender);
        if (block.timestamp < next) revert TooSoon(next);
        lastClaim[msg.sender] = uint64(block.timestamp);
        bond.mint(msg.sender, amountPerClaim);
        emit Claimed(msg.sender, amountPerClaim);
    }
}
