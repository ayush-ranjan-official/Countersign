// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @notice Stand-in for the pqcKeyStatus precompile (0x…0a02), etched with vm.etch: Foundry's local EVM has no
/// QoreChain precompiles. Pattern from the Build Before Q-Day workshop 2 QDayVault test, extended to per-account keys.
///
/// Gas note: the real precompile costs a flat 2,500 gas, and callers cap it (the Asset Kit guard gives it 50,000).
/// So this mock must stay cheap: it stores a 32-byte seed per account (one slot) and expands the key in memory,
/// instead of storing 2,592 bytes (81 cold SLOADs, ~170k gas, which would run out of gas and fail closed).
contract MockPqcKeyStatus {
    struct Status {
        bool registered;
        uint8 algorithmId;
        bool possessionProven;
        uint16 keyLength;
        bytes32 keySeed;
    }

    mapping(address => Status) internal statusOf;

    function setStatus(address account, bool registered, uint8 algorithmId, bytes32 keySeed, uint16 keyLength, bool proven)
        external
    {
        statusOf[account] = Status(registered, algorithmId, proven, keyLength, keySeed);
    }

    /// The deterministic key a given seed expands to (tests use it to build matching signatures).
    function keyOf(bytes32 seed, uint256 length) public pure returns (bytes memory key) {
        key = new bytes(length);
        for (uint256 i = 0; i < length; i += 32) {
            bytes32 word = keccak256(abi.encode(seed, i));
            assembly ("memory-safe") {
                mstore(add(add(key, 32), i), word)
            }
        }
        assembly ("memory-safe") {
            mstore(key, length) // trim any overshoot of the last word
        }
    }

    function pqcKeyStatus(address account) external view returns (bool, uint8, bytes memory, bool) {
        Status memory s = statusOf[account];
        bytes memory key = s.registered ? keyOf(s.keySeed, s.keyLength) : bytes("");
        return (s.registered, s.algorithmId, key, s.possessionProven);
    }
}
