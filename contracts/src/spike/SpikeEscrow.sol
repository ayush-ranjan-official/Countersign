// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice SPIKE ONLY (Day-1 spikes S-3 and S-5): a stand-in for the Countersign escrow, used to check that
/// (a) the hybrid-holder guard refuses a transferFrom into a non-exempt contract and allows it after
/// `setExempt`, and (b) a scoped EVM window admits approve + lock to these targets and nothing else.
/// Not part of the product. Countersign.sol replaces it.
contract SpikeEscrow {
    using SafeERC20 for IERC20;

    mapping(address token => mapping(address depositor => uint256 amount)) public locked;

    event Locked(address indexed token, address indexed from, uint256 amount);
    event Unlocked(address indexed token, address indexed to, uint256 amount);

    function lock(IERC20 token, uint256 amount) external {
        locked[address(token)][msg.sender] += amount;
        token.safeTransferFrom(msg.sender, address(this), amount);
        emit Locked(address(token), msg.sender, amount);
    }

    function unlock(IERC20 token, uint256 amount) external {
        locked[address(token)][msg.sender] -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Unlocked(address(token), msg.sender, amount);
    }
}
