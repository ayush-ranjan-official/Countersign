// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @notice Stand-in for the pqcVerify precompile (0x…0a01), etched with vm.etch (Foundry has no QoreChain
/// precompiles). Pattern from the Build Before Q-Day workshop 2 QDayVault test: a "signature" is valid when it has
/// the real ML-DSA-87 length (4,627 bytes) and its first 32 bytes equal keccak256(pubkey ‖ message). So a signature
/// only verifies for the exact key AND the exact message bytes, like the real precompile.
contract MockPqcVerify {
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        pure
        returns (bool)
    {
        if (signature.length != 4627) return false;
        return bytes32(signature[0:32]) == keccak256(abi.encodePacked(pubkey, message));
    }
}

/// @notice A precompile stand-in that answers success with EMPTY data, like an inactive precompile on mainnet.
contract EmptyReturn {
    fallback() external {
        assembly ("memory-safe") {
            return(0, 0)
        }
    }
}
