// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title MockUSDC
 * @dev Mock USD Stablecoin for testing
 *   - ERC20 + Ownable
 *   - 6 decimals (like real USDC)
 *   - Owner can mint freely (for testing faucets)
 *   - No burn function (not needed for MVP)
 */
contract MockUSDC is ERC20, Ownable {
    constructor(uint256 initialMint) ERC20("MockUSDC", "mUSDC") Ownable(msg.sender) {
        if (initialMint > 0) {
            _mint(msg.sender, initialMint);
        }
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /**
     * @dev Mint tokens to any address (owner only)
     * @param to Recipient address
     * @param amount Amount in base units (6 decimals)
     */
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
