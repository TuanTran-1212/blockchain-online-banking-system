// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

/**
 * @title VaultManager
 * @dev Manages the liquidity pool for the Online Banking System
 *   - Holds USDC as liquidity for user deposits
 *   - Owner can fund/withdraw to manage reserves
 *   - SavingCore calls depositToVault/withdrawFromVault
 *   - Pausable for emergency stops
 *   - ReentrancyGuard on all external transfers
 */
contract VaultManager is Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public immutable usdc;
    uint256 public totalDeposits;     // Sum of all user deposits tracked
    uint256 public totalOwedInterest; // Total interest owed to active deposits (C2: Solvency Guard)

    event VaultFunded(address indexed owner, uint256 amount);
    event VaultWithdrawn(address indexed owner, uint256 amount);
    event DepositRecorded(uint256 amount);
    event WithdrawalRecorded(uint256 amount);
    event InterestOwedRecorded(uint256 amount);
    event InterestOwedReleased(uint256 amount);
    event PausedByOwner();
    event UnpausedByOwner();

    constructor(address _usdc) Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC address");
        usdc = IERC20(_usdc);
    }

    // ========================
    // Owner Functions
    // ========================

    /**
     * @dev Owner deposits USDC into vault as liquidity reserve
     * @param amount Amount of USDC to deposit
     */
    function fund(uint256 amount) external onlyOwner whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        usdc.safeTransferFrom(msg.sender, address(this), amount);
        emit VaultFunded(msg.sender, amount);
    }

    /**
     * @dev Owner withdraws USDC from vault
     * @param amount Amount of USDC to withdraw
     */
    function withdraw(uint256 amount) external onlyOwner nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(
            usdc.balanceOf(address(this)) - totalDeposits - totalOwedInterest >= amount,
            "Insufficient free balance"
        );
        usdc.safeTransfer(msg.sender, amount);
        emit VaultWithdrawn(msg.sender, amount);
    }

    // ========================
    // SavingCore Callbacks
    // ========================

    /**
     * @dev Called by SavingCore when a user opens a deposit
     *      Records the deposit and accepts USDC transfer
     * @param amount Amount deposited by user
     */
    function depositToVault(uint256 amount) external whenNotPaused {
        require(amount > 0, "Amount must be > 0");
        totalDeposits += amount;
        // USDC is transferred to VaultManager by SavingCore before calling this
        emit DepositRecorded(amount);
    }

    /**
     * @dev Called by SavingCore when a user withdraws principal
     *      Transfers USDC back to the user and reduces tracked deposits
     * @param to Recipient address
     * @param amount Amount to withdraw (principal)
     */
    function withdrawFromVault(address to, uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(totalDeposits >= amount, "Insufficient deposits tracked");
        totalDeposits -= amount;
        usdc.safeTransfer(to, amount);
        emit WithdrawalRecorded(amount);
    }

    /**
     * @dev Called by SavingCore to pay interest from vault reserves
     *      Does NOT reduce totalDeposits (interest comes from owner-funded liquidity)
     * @param to Recipient address
     * @param amount Interest amount to pay
     */
    function withdrawInterest(address to, uint256 amount) external whenNotPaused nonReentrant {
        require(amount > 0, "Amount must be > 0");
        require(
            usdc.balanceOf(address(this)) >= totalDeposits + amount,
            "Insufficient vault balance for interest"
        );
        usdc.safeTransfer(to, amount);
        emit WithdrawalRecorded(amount);
    }

    // ========================
    // Interest Owed Tracking (C2: Solvency Guard)
    // ========================

    /**
     * @dev Called by SavingCore when a deposit is opened
     *      Records the expected interest obligation
     * @param amount Expected interest for the deposit
     */
    function recordInterestOwed(uint256 amount) external {
        totalOwedInterest += amount;
        emit InterestOwedRecorded(amount);
    }

    /**
     * @dev Called by SavingCore when a deposit is settled (withdrawn, renewed, etc.)
     *      Releases the interest obligation
     * @param amount Interest obligation to release
     */
    function releaseInterestOwed(uint256 amount) external {
        require(totalOwedInterest >= amount, "Invalid release amount");
        totalOwedInterest -= amount;
        emit InterestOwedReleased(amount);
    }

    // ========================
    // Pause / Unpause
    // ========================

    function pause() external onlyOwner {
        _pause();
        emit PausedByOwner();
    }

    function unpause() external onlyOwner {
        _unpause();
        emit UnpausedByOwner();
    }

    // ========================
    // View Functions
    // ========================

    /**
     * @dev Actual USDC balance held by this contract
     */
    function vaultBalance() external view returns (uint256) {
        return usdc.balanceOf(address(this));
    }

    /**
     * @dev Vault is solvent if actual balance >= total tracked deposits + owed interest
     */
    function isSolvent() external view returns (bool) {
        return usdc.balanceOf(address(this)) >= totalDeposits + totalOwedInterest;
    }

    /**
     * @dev Available liquidity = actual balance - tracked deposits - owed interest
     *      This is the "free" USDC owner funded but not yet committed to deposits/interest
     */
    function getAvailableLiquidity() external view returns (uint256) {
        return usdc.balanceOf(address(this)) - totalDeposits - totalOwedInterest;
    }
}
