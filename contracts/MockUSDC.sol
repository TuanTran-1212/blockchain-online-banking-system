// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title MockUSDC
 * @dev Mock USD Stablecoin for testing
 *   - ERC20, 6 decimals (like real USDC)
 *   - Anyone can mint freely (test-only faucet pattern)
 *   - No burn function (not needed for MVP)
 *   - No ownership/access control (test token, no real value)
 */
contract MockUSDC is ERC20 {
    constructor(uint256 initialMint) ERC20("MockUSDC", "mUSDC") {
        if (initialMint > 0) {
            _mint(msg.sender, initialMint);
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @dev Mint tokens to any address — unrestricted (test-only token)
     * @param to Recipient address
     * @param amount Amount in base units (6 decimals)
     */
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
