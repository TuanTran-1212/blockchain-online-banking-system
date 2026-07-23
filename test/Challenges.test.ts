import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Challenges C2 + C3", function () {
  let mockUSDC: any;
  let vaultManager: any;
  let savingCore: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let feeReceiver: any;

  const INITIAL_MINT = ethers.parseUnits("1000000", 6);
  const FUND_AMOUNT = ethers.parseUnits("500000", 6);
  const TENOR_DAYS = 180;
  const APR_BPS = 375;           // 3.75%
  const PENALTY_BPS = 650;       // 6.50%
  const MIN_DEPOSIT = ethers.parseUnits("100", 6);
  const DEPOSIT_AMOUNT = ethers.parseUnits("10000", 6);

  beforeEach(async function () {
    [owner, user1, user2, feeReceiver] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy(INITIAL_MINT);
    await mockUSDC.waitForDeployment();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    vaultManager = await VaultManager.deploy(await mockUSDC.getAddress());
    await vaultManager.waitForDeployment();

    const SavingCore = await ethers.getContractFactory("SavingCore");
    savingCore = await SavingCore.deploy(
      await mockUSDC.getAddress(),
      await vaultManager.getAddress(),
      feeReceiver.address
    );
    await savingCore.waitForDeployment();

    await mockUSDC.approve(await vaultManager.getAddress(), FUND_AMOUNT);
    await vaultManager.fund(FUND_AMOUNT);

    const user1Amount = ethers.parseUnits("500000", 6);
    await mockUSDC.mint(user1.address, user1Amount);
    await mockUSDC.connect(user1).approve(await savingCore.getAddress(), user1Amount);

    await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
  });

  // ============================================================
  // C2: Solvency Guard
  // ============================================================
  describe("C2: Solvency Guard", function () {
    it("should record totalOwedInterest when deposit is opened", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const expectedInterest = (DEPOSIT_AMOUNT * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n);
      expect(await vaultManager.totalOwedInterest()).to.equal(expectedInterest);
    });

    it("should release totalOwedInterest after withdrawAtMaturity", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      const interestBefore = await vaultManager.totalOwedInterest();

      await time.increase(TENOR_DAYS * 86400);
      await savingCore.connect(user1).withdrawAtMaturity(0);

      expect(await vaultManager.totalOwedInterest()).to.equal(0);
    });

    it("should release totalOwedInterest after earlyWithdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      expect(await vaultManager.totalOwedInterest()).to.be.gt(0);

      await savingCore.connect(user1).earlyWithdraw(0);
      expect(await vaultManager.totalOwedInterest()).to.equal(0);
    });

    it("should release old and record new on renewDeposit", async function () {
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, 0, PENALTY_BPS); // plan 1: 90d, 5%
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const oldInterest = await vaultManager.totalOwedInterest();

      await time.increase(TENOR_DAYS * 86400);
      await savingCore.connect(user1).renewDeposit(0, 1);

      // New interest should be different (90 days at 5% vs 180 days at 3.75%)
      const newInterest = await vaultManager.totalOwedInterest();
      const expectedNewInterest = ((DEPOSIT_AMOUNT + (DEPOSIT_AMOUNT * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n)) * 500n * BigInt(90 * 86400)) / (365n * 86400n * 10000n);
      expect(newInterest).to.equal(expectedNewInterest);
      expect(newInterest).to.not.equal(oldInterest);
    });

    it("should release old and record new on autoRenewDeposit", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await time.increase((TENOR_DAYS + 4) * 86400);
      await savingCore.connect(user1).autoRenewDeposit(0);

      // Auto-renew keeps same plan, same APR — new interest for 180 days at 3.75%
      const newInterest = await vaultManager.totalOwedInterest();
      expect(newInterest).to.be.gt(0);
    });

    it("should block admin withdraw when vault below totalOwedInterest", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const availableLiquidity = await vaultManager.getAvailableLiquidity();

      // Try to withdraw all available liquidity + 1 wei
      await expect(
        vaultManager.withdraw(availableLiquidity + 1n)
      ).to.be.revertedWith("Insufficient free balance");
    });

    it("should allow admin withdraw up to available liquidity", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const availableLiquidity = await vaultManager.getAvailableLiquidity();
      await vaultManager.withdraw(availableLiquidity);

      expect(await vaultManager.getAvailableLiquidity()).to.equal(0);
    });

    it("should track multiple deposits totalOwedInterest correctly", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      const interest1 = await vaultManager.totalOwedInterest();

      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      const interest2 = await vaultManager.totalOwedInterest();

      expect(interest2).to.equal(interest1 * 2n);
    });

    it("should update isSolvent to account for totalOwedInterest", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // isSolvent checks balance >= totalDeposits + totalOwedInterest
      expect(await vaultManager.isSolvent()).to.equal(true);

      // Available liquidity = balance - totalDeposits - totalOwedInterest
      // Without C2 it would equal FUND_AMOUNT (500k); with C2 it's less
      const availableLiquidity = await vaultManager.getAvailableLiquidity();
      expect(availableLiquidity).to.be.lt(FUND_AMOUNT);
    });

    it("should allow 1 wei admin withdraw below limit", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const availableLiquidity = await vaultManager.getAvailableLiquidity();
      // Withdraw 1 wei less than available
      await vaultManager.withdraw(availableLiquidity - 1n);
      expect(await vaultManager.getAvailableLiquidity()).to.equal(1n);
    });

    it("should revert 1 wei admin withdraw above limit", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const availableLiquidity = await vaultManager.getAvailableLiquidity();
      await expect(
        vaultManager.withdraw(availableLiquidity + 1n)
      ).to.be.revertedWith("Insufficient free balance");
    });

    it("should return totalOwedInterest = 0 after full lifecycle", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      expect(await vaultManager.totalOwedInterest()).to.be.gt(0);

      await time.increase(TENOR_DAYS * 86400);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      expect(await vaultManager.totalOwedInterest()).to.equal(0);
    });
  });

  // ============================================================
  // C3: Partial Early Withdrawal
  // ============================================================
  describe("C3: Partial Early Withdrawal", function () {
    it("should allow partial withdraw 10% with correct penalty", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const withdrawAmount = DEPOSIT_AMOUNT / 10n; // 10%
      const penalty = (withdrawAmount * BigInt(PENALTY_BPS)) / 10000n;
      const userPayout = withdrawAmount - penalty;

      const userBefore = await mockUSDC.balanceOf(user1.address);
      const feeBefore = await mockUSDC.balanceOf(feeReceiver.address);

      await savingCore.connect(user1).partialEarlyWithdraw(0, withdrawAmount);

      const userAfter = await mockUSDC.balanceOf(user1.address);
      const feeAfter = await mockUSDC.balanceOf(feeReceiver.address);

      expect(userAfter - userBefore).to.equal(userPayout);
      expect(feeAfter - feeBefore).to.equal(penalty);

      // Deposit should still be active with reduced principal
      const deposit = await savingCore.getDeposit(0);
      expect(deposit.status).to.equal(0); // Active
      expect(deposit.principal).to.equal(DEPOSIT_AMOUNT - withdrawAmount);

      // NFT should still exist
      expect(await savingCore.ownerOf(0)).to.equal(user1.address);
    });

    it("should treat 100% partial withdraw same as full early withdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const penalty = (DEPOSIT_AMOUNT * BigInt(PENALTY_BPS)) / 10000n;
      const userPayout = DEPOSIT_AMOUNT - penalty;

      await savingCore.connect(user1).partialEarlyWithdraw(0, DEPOSIT_AMOUNT);

      const deposit = await savingCore.getDeposit(0);
      expect(deposit.status).to.equal(1); // Withdrawn
      expect(deposit.principal).to.equal(0);

      // NFT should be burned
      await expect(savingCore.ownerOf(0)).to.be.reverted;
    });

    it("should reject withdraw 0", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await expect(
        savingCore.connect(user1).partialEarlyWithdraw(0, 0)
      ).to.be.revertedWith("Invalid withdraw amount");
    });

    it("should reject withdraw > principal", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await expect(
        savingCore.connect(user1).partialEarlyWithdraw(0, DEPOSIT_AMOUNT + 1n)
      ).to.be.revertedWith("Invalid withdraw amount");
    });

    it("should reject non-owner partial withdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await expect(
        savingCore.connect(user2).partialEarlyWithdraw(0, DEPOSIT_AMOUNT / 10n)
      ).to.be.revertedWith("Not your deposit");
    });

    it("should reject partial withdraw when paused", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.pause();

      await expect(
        savingCore.connect(user1).partialEarlyWithdraw(0, DEPOSIT_AMOUNT / 10n)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });

    it("should allow multiple partial withdrawals on same deposit", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const withdraw1 = DEPOSIT_AMOUNT / 10n;
      await savingCore.connect(user1).partialEarlyWithdraw(0, withdraw1);

      const deposit1 = await savingCore.getDeposit(0);
      expect(deposit1.principal).to.equal(DEPOSIT_AMOUNT - withdraw1);

      const withdraw2 = withdraw1;
      await savingCore.connect(user1).partialEarlyWithdraw(0, withdraw2);

      const deposit2 = await savingCore.getDeposit(0);
      expect(deposit2.principal).to.equal(DEPOSIT_AMOUNT - withdraw1 - withdraw2);
      expect(deposit2.status).to.equal(0); // Still Active
    });

    it("should pay remaining principal + interest at maturity after partial withdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Partially withdraw 10%
      const withdrawAmount = DEPOSIT_AMOUNT / 10n;
      await savingCore.connect(user1).partialEarlyWithdraw(0, withdrawAmount);

      // Fast forward to maturity
      await time.increase(TENOR_DAYS * 86400);

      const remainingPrincipal = DEPOSIT_AMOUNT - withdrawAmount;
      const expectedInterest = (remainingPrincipal * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n);

      const userBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      const userAfter = await mockUSDC.balanceOf(user1.address);

      expect(userAfter - userBefore).to.equal(remainingPrincipal + expectedInterest);
    });

    it("should send correct penalty to feeReceiver", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const withdrawAmount = DEPOSIT_AMOUNT / 4n; // 25%
      const expectedPenalty = (withdrawAmount * BigInt(PENALTY_BPS)) / 10000n;

      const feeBefore = await mockUSDC.balanceOf(feeReceiver.address);
      await savingCore.connect(user1).partialEarlyWithdraw(0, withdrawAmount);
      const feeAfter = await mockUSDC.balanceOf(feeReceiver.address);

      expect(feeAfter - feeBefore).to.equal(expectedPenalty);
    });

    it("should emit DepositPartialEarlyWithdrawn event", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const withdrawAmount = DEPOSIT_AMOUNT / 10n;
      const expectedPenalty = (withdrawAmount * BigInt(PENALTY_BPS)) / 10000n;

      await expect(savingCore.connect(user1).partialEarlyWithdraw(0, withdrawAmount))
        .to.emit(savingCore, "DepositPartialEarlyWithdrawn")
        .withArgs(0, withdrawAmount, expectedPenalty);
    });
  });
});
