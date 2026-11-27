// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// fUSD stand-in: 6 decimals, open mint (tests only).
contract MockERC20 is ERC20 {
    uint8 internal immutable dec;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        dec = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return dec;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// Takes a 1% fee on every transfer: Countersign must refuse it (exact-amount check on lock).
contract FeeOnTransferERC20 is MockERC20 {
    constructor() MockERC20("Fee", "FEE", 6) {}

    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) {
            uint256 fee = value / 100;
            super._update(from, address(0xFEE), fee);
            value -= fee;
        }
        super._update(from, to, value);
    }
}

interface ICountersignReenter {
    function settle(bytes32 tradeId) external;
    function reclaim(bytes32 tradeId) external;
}

/// On an outgoing transfer from the target, tries to re-enter settle or reclaim and records whether the
/// reentrancy guard stopped it. It swallows the failure so the outer call can finish and be checked.
contract ReentrantERC20 is MockERC20 {
    address public target;
    bytes32 public tradeId;
    bool public armed;
    bool public reenterSettle;
    uint256 public attempts;
    uint256 public blocked;

    constructor() MockERC20("Reenter", "RE", 6) {}

    function arm(address target_, bytes32 tradeId_, bool settle_) external {
        target = target_;
        tradeId = tradeId_;
        reenterSettle = settle_;
        armed = true;
    }

    function _update(address from, address to, uint256 value) internal override {
        super._update(from, to, value);
        if (armed && from == target) {
            armed = false; // one attempt
            attempts++;
            try this.reenter() {} catch {
                blocked++;
            }
        }
    }

    function reenter() external {
        if (reenterSettle) ICountersignReenter(target).settle(tradeId);
        else ICountersignReenter(target).reclaim(tradeId);
    }
}
