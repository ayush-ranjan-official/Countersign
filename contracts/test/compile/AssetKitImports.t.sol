// SPDX-License-Identifier: Apache-2.0
pragma solidity 0.8.28;

import {Test} from "forge-std/Test.sol";
import {CMTATStandalone} from "CMTAT/deployment/CMTATStandalone.sol";
import {QoreChainHybridHolderGuard} from "asset-kit/guard/QoreChainHybridHolderGuard.sol";
import {QoreChainHybridHolderRule} from "asset-kit/cmtat/QoreChainHybridHolderRule.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/// Compile-only smoke test: the remappings resolve the Asset Kit CMTAT path and OpenZeppelin.
contract AssetKitImportsTest is Test {
    function test_importsResolve() public pure {
        assertTrue(type(CMTATStandalone).creationCode.length > 0);
        assertTrue(type(QoreChainHybridHolderGuard).creationCode.length > 0);
        assertTrue(type(QoreChainHybridHolderRule).creationCode.length > 0);
    }
}
