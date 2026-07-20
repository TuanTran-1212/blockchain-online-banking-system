// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import "./VaultManager.sol";

/**
 * @title SavingCore
 * @dev Core business logic for the Online Banking System
 *   - Manages deposit plans (create, update, enable/disable)
 *   - Handles user deposits with ERC721 NFT certificates
 *   - Supports normal withdraw, early withdraw, manual renew, auto-renew
 *   - Simple interest calculated from vault
 */
contract SavingCore is ERC721, Ownable, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ========================
    // Constants
    // ========================
    uint256 public constant SECONDS_PER_YEAR = 365 days;
    uint256 public constant BPS_DENOMINATOR = 10_000;
    uint256 public constant GRACE_PERIOD_DAYS = 3; // Personal Variant: (7 mod 3) + 2 = 3

    // ========================
    // Enums & Structs
    // ========================
    enum DepositStatus { Active, Withdrawn, ManualRenewed, AutoRenewed }

    struct Plan {
        uint256 tenorDays;
        uint256 aprBps;
        uint256 minDeposit;
        uint256 maxDeposit; // 0 = unlimited
        uint256 earlyWithdrawPenaltyBps;
        bool enabled;
    }

    struct Deposit {
        uint256 planId;
        address owner;
        uint256 principal;
        uint256 startAt;
        uint256 maturityAt;
        uint256 aprBpsAtOpen;       // Snapshot APR at deposit time
        uint256 penaltyBpsAtOpen;   // Snapshot penalty at deposit time
        DepositStatus status;
    }

    // ========================
    // State
    // ========================
    VaultManager public immutable vaultManager;
    IERC20 public immutable usdc;
    address public feeReceiver; // Receives early withdraw penalties

    mapping(uint256 => Plan) public plans;
    uint256 public planCount;

    mapping(uint256 => Deposit) public deposits;
    uint256 public depositCount;

    // Token URI metadata per deposit
    mapping(uint256 => string) private _tokenURIs;

    // ========================
    // Events
    // ========================
    event PlanCreated(uint256 indexed planId, uint256 tenorDays, uint256 aprBps, uint256 minDeposit, uint256 maxDeposit, uint256 penaltyBps);
    event PlanAprUpdated(uint256 indexed planId, uint256 oldApr, uint256 newApr);
    event PlanEnabled(uint256 indexed planId);
    event PlanDisabled(uint256 indexed planId);
    event DepositOpened(uint256 indexed depositId, uint256 indexed planId, address owner, uint256 principal, uint256 maturityAt);
    event DepositWithdrawn(uint256 indexed depositId, uint256 principal, uint256 interest);
    event DepositEarlyWithdrawn(uint256 indexed depositId, uint256 principal, uint256 penalty);
    event DepositRenewed(uint256 indexed oldDepositId, uint256 indexed newDepositId, uint256 newPrincipal);
    event FeeReceiverUpdated(address oldReceiver, address newReceiver);

    // ========================
    // Constructor
    // ========================
    constructor(
        address _usdc,
        address _vaultManager,
        address _feeReceiver
    ) ERC721("SavingCertificate", "SCERT") Ownable(msg.sender) {
        require(_usdc != address(0), "Invalid USDC");
        require(_vaultManager != address(0), "Invalid VaultManager");
        require(_feeReceiver != address(0), "Invalid feeReceiver");
        usdc = IERC20(_usdc);
        vaultManager = VaultManager(_vaultManager);
        feeReceiver = _feeReceiver;
    }

    // ========================
    // Admin Functions
    // ========================

    /**
     * @dev Create a new deposit plan
     */
    function createPlan(
        uint256 tenorDays,
        uint256 aprBps,
        uint256 minDeposit,
        uint256 maxDeposit,
        uint256 earlyWithdrawPenaltyBps
    ) external onlyOwner returns (uint256) {
        require(tenorDays > 0, "Tenor must be > 0");
        require(aprBps > 0 && aprBps <= 5000, "Invalid APR");
        require(earlyWithdrawPenaltyBps <= 2000, "Invalid penalty");
        require(minDeposit > 0, "minDeposit must be > 0");

        uint256 planId = planCount;
        plans[planId] = Plan({
            tenorDays: tenorDays,
            aprBps: aprBps,
            minDeposit: minDeposit,
            maxDeposit: maxDeposit,
            earlyWithdrawPenaltyBps: earlyWithdrawPenaltyBps,
            enabled: true
        });
        planCount++;

        emit PlanCreated(planId, tenorDays, aprBps, minDeposit, maxDeposit, earlyWithdrawPenaltyBps);
        return planId;
    }

    /**
     * @dev Update only the APR of an existing plan
     *      Does NOT affect deposits already opened (snapshot)
     */
    function updatePlanApr(uint256 planId, uint256 newAprBps) external onlyOwner {
        require(planId < planCount, "Plan does not exist");
        require(newAprBps > 0 && newAprBps <= 5000, "Invalid APR");

        uint256 oldApr = plans[planId].aprBps;
        plans[planId].aprBps = newAprBps;

        emit PlanAprUpdated(planId, oldApr, newAprBps);
    }

    function enablePlan(uint256 planId) external onlyOwner {
        require(planId < planCount, "Plan does not exist");
        require(!plans[planId].enabled, "Already enabled");
        plans[planId].enabled = true;
        emit PlanEnabled(planId);
    }

    function disablePlan(uint256 planId) external onlyOwner {
        require(planId < planCount, "Plan does not exist");
        require(plans[planId].enabled, "Already disabled");
        plans[planId].enabled = false;
        emit PlanDisabled(planId);
    }

    function setFeeReceiver(address newReceiver) external onlyOwner {
        require(newReceiver != address(0), "Invalid address");
        emit FeeReceiverUpdated(feeReceiver, newReceiver);
        feeReceiver = newReceiver;
    }

    // ========================
    // User Functions
    // ========================

    /**
     * Flow 1: openDeposit — Open a new term deposit
     * @param planId Plan to deposit into
     * @param amount Amount of USDC to deposit
     * @return depositId The ID of the new deposit (also the NFT tokenId)
     */
    function openDeposit(uint256 planId, uint256 amount) external whenNotPaused nonReentrant returns (uint256) {
        require(planId < planCount, "Plan does not exist");
        Plan storage plan = plans[planId];
        require(plan.enabled, "Plan is disabled");
        require(amount >= plan.minDeposit, "Below minimum deposit");
        require(plan.maxDeposit == 0 || amount <= plan.maxDeposit, "Exceeds maximum deposit");

        uint256 depositId = depositCount;
        uint256 maturityAt = block.timestamp + (plan.tenorDays * 1 days);

        deposits[depositId] = Deposit({
            planId: planId,
            owner: msg.sender,
            principal: amount,
            startAt: block.timestamp,
            maturityAt: maturityAt,
            aprBpsAtOpen: plan.aprBps,
            penaltyBpsAtOpen: plan.earlyWithdrawPenaltyBps,
            status: DepositStatus.Active
        });
        depositCount++;

        // Transfer USDC from user to VaultManager
        usdc.safeTransferFrom(msg.sender, address(vaultManager), amount);
        vaultManager.depositToVault(amount);

        // Mint ERC721 NFT certificate
        _mint(msg.sender, depositId);
        _tokenURIs[depositId] = "";

        emit DepositOpened(depositId, planId, msg.sender, amount, maturityAt);
        return depositId;
    }

    /**
     * Flow 2: withdrawAtMaturity — Withdraw after maturity with simple interest
     *      Interest comes from VaultManager (not from principal pool)
     * @param depositId The deposit to withdraw
     */
    function withdrawAtMaturity(uint256 depositId) external whenNotPaused nonReentrant {
        require(depositId < depositCount, "Deposit does not exist");
        Deposit storage dep = deposits[depositId];
        require(dep.owner == msg.sender, "Not your deposit");
        require(dep.status == DepositStatus.Active, "Not active");
        require(block.timestamp >= dep.maturityAt, "Not yet matured");

        // Calculate simple interest
        uint256 interest = calculateInterest(dep.principal, dep.aprBpsAtOpen, dep.maturityAt - dep.startAt);

        // Withdraw principal from tracked deposits, interest from vault reserves
        vaultManager.withdrawFromVault(msg.sender, dep.principal);
        if (interest > 0) {
            vaultManager.withdrawInterest(msg.sender, interest);
        }

        dep.status = DepositStatus.Withdrawn;

        // Burn NFT
        _burn(depositId);

        emit DepositWithdrawn(depositId, dep.principal, interest);
    }

    /**
     * Flow 3: earlyWithdraw — Withdraw before maturity with penalty, 0 interest
     *      Penalty goes to feeReceiver
     * @param depositId The deposit to withdraw early
     */
    function earlyWithdraw(uint256 depositId) external whenNotPaused nonReentrant {
        require(depositId < depositCount, "Deposit does not exist");
        Deposit storage dep = deposits[depositId];
        require(dep.owner == msg.sender, "Not your deposit");
        require(dep.status == DepositStatus.Active, "Not active");

        // Calculate penalty: principal * penaltyBps / 10000
        uint256 penalty = (dep.principal * dep.penaltyBpsAtOpen) / BPS_DENOMINATOR;

        // User gets principal - penalty, feeReceiver gets penalty
        uint256 userPayout = dep.principal - penalty;

        if (penalty > 0) {
            vaultManager.withdrawFromVault(feeReceiver, penalty);
        }
        vaultManager.withdrawFromVault(msg.sender, userPayout);

        dep.status = DepositStatus.Withdrawn;

        // Burn NFT
        _burn(depositId);

        emit DepositEarlyWithdrawn(depositId, dep.principal, penalty);
    }

    /**
     * Flow 4: renewDeposit — Manual renew with new plan
     *      Interest from old deposit is added to new principal
     *      New deposit gets its own snapshot of current plan APR/penalty
     * @param depositId The matured deposit to renew
     * @param newPlanId The new plan to deposit into
     * @return newDepositId The ID of the new deposit
     */
    function renewDeposit(uint256 depositId, uint256 newPlanId) external whenNotPaused nonReentrant returns (uint256) {
        require(depositId < depositCount, "Deposit does not exist");
        Deposit storage oldDep = deposits[depositId];
        require(oldDep.owner == msg.sender, "Not your deposit");
        require(oldDep.status == DepositStatus.Active, "Not active");
        require(block.timestamp >= oldDep.maturityAt, "Not yet matured");
        require(newPlanId < planCount, "New plan does not exist");
        require(plans[newPlanId].enabled, "New plan is disabled");

        // Calculate interest from old deposit
        uint256 interest = calculateInterest(oldDep.principal, oldDep.aprBpsAtOpen, oldDep.maturityAt - oldDep.startAt);
        uint256 newPrincipal = oldDep.principal + interest;

        // Check new plan constraints
        Plan storage newPlan = plans[newPlanId];
        require(newPrincipal >= newPlan.minDeposit, "New principal below minimum");
        require(newPlan.maxDeposit == 0 || newPrincipal <= newPlan.maxDeposit, "New principal exceeds maximum");

        // Mark old deposit as renewed
        oldDep.status = DepositStatus.ManualRenewed;
        _burn(depositId);

        // Create new deposit
        uint256 newDepositId = depositCount;
        uint256 newMaturityAt = block.timestamp + (newPlan.tenorDays * 1 days);

        deposits[newDepositId] = Deposit({
            planId: newPlanId,
            owner: msg.sender,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: newMaturityAt,
            aprBpsAtOpen: newPlan.aprBps,
            penaltyBpsAtOpen: newPlan.earlyWithdrawPenaltyBps,
            status: DepositStatus.Active
        });
        depositCount++;

        // Mint new NFT
        _mint(msg.sender, newDepositId);

        emit DepositRenewed(depositId, newDepositId, newPrincipal);
        return newDepositId;
    }

    /**
     * Flow 5: autoRenewDeposit — Auto-renew after grace period
     *      Only callable after maturityAt + GRACE_PERIOD_DAYS
     *      Keeps original APR/penalty snapshot, same plan
     * @param depositId The deposit to auto-renew
     * @return newDepositId The ID of the new deposit
     */
    function autoRenewDeposit(uint256 depositId) external whenNotPaused nonReentrant returns (uint256) {
        require(depositId < depositCount, "Deposit does not exist");
        Deposit storage oldDep = deposits[depositId];
        require(oldDep.status == DepositStatus.Active, "Not active");

        uint256 gracePeriodEnd = oldDep.maturityAt + (GRACE_PERIOD_DAYS * 1 days);
        require(block.timestamp >= gracePeriodEnd, "Grace period not ended");

        // Calculate interest from old deposit
        uint256 interest = calculateInterest(oldDep.principal, oldDep.aprBpsAtOpen, oldDep.maturityAt - oldDep.startAt);
        uint256 newPrincipal = oldDep.principal + interest;

        // Same plan, same APR, same penalty (snapshots from original)
        Plan storage currentPlan = plans[oldDep.planId];

        // Mark old deposit as auto-renewed
        oldDep.status = DepositStatus.AutoRenewed;
        _burn(depositId);

        // Create new deposit with original snapshots
        uint256 newDepositId = depositCount;
        uint256 newMaturityAt = block.timestamp + (currentPlan.tenorDays * 1 days);

        deposits[newDepositId] = Deposit({
            planId: oldDep.planId,
            owner: oldDep.owner,
            principal: newPrincipal,
            startAt: block.timestamp,
            maturityAt: newMaturityAt,
            aprBpsAtOpen: oldDep.aprBpsAtOpen,     // Keep original APR
            penaltyBpsAtOpen: oldDep.penaltyBpsAtOpen, // Keep original penalty
            status: DepositStatus.Active
        });
        depositCount++;

        // Mint new NFT for original owner
        _mint(oldDep.owner, newDepositId);

        emit DepositRenewed(depositId, newDepositId, newPrincipal);
        return newDepositId;
    }

    // ========================
    // View Functions
    // ========================

    function calculateInterest(uint256 principal, uint256 aprBps, uint256 tenorSeconds) public pure returns (uint256) {
        return (principal * aprBps * tenorSeconds) / (SECONDS_PER_YEAR * BPS_DENOMINATOR);
    }

    function getDeposit(uint256 depositId) external view returns (Deposit memory) {
        require(depositId < depositCount, "Deposit does not exist");
        return deposits[depositId];
    }

    function getPlan(uint256 planId) external view returns (Plan memory) {
        require(planId < planCount, "Plan does not exist");
        return plans[planId];
    }

    function getUserDeposits(address user) external view returns (uint256[] memory) {
        uint256 count = 0;
        for (uint256 i = 0; i < depositCount; i++) {
            if (deposits[i].owner == user) count++;
        }

        uint256[] memory result = new uint256[](count);
        uint256 idx = 0;
        for (uint256 i = 0; i < depositCount; i++) {
            if (deposits[i].owner == user) {
                result[idx] = i;
                idx++;
            }
        }
        return result;
    }

    // ========================
    // ERC721 Metadata
    // ========================

    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        string memory uri = _tokenURIs[tokenId];
        return uri;
    }

    function setTokenURI(uint256 tokenId, string memory uri) external onlyOwner {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        _tokenURIs[tokenId] = uri;
    }

    // ========================
    // Pause / Unpause
    // ========================

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ========================
    // Receive (for any accidental ERC20 transfers)
    // ========================
    receive() external payable {}
}
