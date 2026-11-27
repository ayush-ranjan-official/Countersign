// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

/// @notice QoreChain post-quantum precompiles, active on the qorechain-diana testnet only.
/// On a network where they are not active, a call succeeds with EMPTY return data, so callers must check
/// the return length (Countersign uses low-level staticcalls and fails closed).
interface IQorePQC {
    /// ML-DSA-87 (FIPS 204) verification at 0x…0a01: 2,592-byte key, 4,627-byte signature.
    /// Cost: 25,000 gas + 8 per input byte.
    function pqcVerify(bytes calldata pubkey, bytes calldata signature, bytes calldata message)
        external
        view
        returns (bool valid);

    /// The ML-DSA-87 key an account registered on chain, at 0x…0a02. Cost: 2,500 gas.
    function pqcKeyStatus(address account)
        external
        view
        returns (bool registered, uint8 algorithmId, bytes memory pubkey, bool possessionProven);
}
