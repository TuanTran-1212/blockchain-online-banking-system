import { expect } from "chai";
import { ethers } from "hardhat";

describe("VaultManager — Edge Cases", function () {
  let mockUSDC: any;
  let vaultManager: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  const INITIAL_MINT = ethers.parseUnits("1000000", 6);
  const FUND_AMOUNT = ethers.parseUnits("100000", 6);

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy(INITIAL_MINT);
    await mockUSDC.waitForDeployment();

    const VaultManager = await ethers.getContractFactory("VaultManager");
    vaultManager = await VaultManager.deploy(await mockUSDC.getAddress());
    await vaultManager.waitForDeployment();

    await mockUSDC.approve(await vaultManager.getAddress(), FUND_AMOUNT);
  });

  // ============================================================
  // Constructor
  // ============================================================
  describe("Constructor", function () {
    it("should reject zero address for USDC", async function () {
      const VaultManager = await ethers.getContractFactory("VaultManager");
      await expect(
        VaultManager.deploy(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid USDC address");
    });
  });

  // ============================================================
  // Fund edge cases
  // ============================================================
  describe("Fund — Edge Cases", function () {
    it("should handle multiple fund calls", async function () {
      const half = FUND_AMOUNT / 2n;
      await vaultManager.fund(half);
      await vaultManager.fund(half);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT);
    });

    it("should handle fund with 1 wei", async function () {
      await vaultManager.fund(1);
      expect(await vaultManager.vaultBalance()).to.equal(1);
    });
  });

  // ============================================================
  // Withdraw (Owner) edge cases
  // ============================================================
  describe("Withdraw — Edge Cases", function () {
    beforeEach(async function () {
      await vaultManager.fund(FUND_AMOUNT);
    });

    it("should reject withdraw with 0 amount", async function () {
      await expect(vaultManager.withdraw(0)).to.be.revertedWith("Amount must be > 0");
    });

    it("should reject withdraw more than available", async function () {
      const tooMuch = FUND_AMOUNT + 1n;
      await expect(vaultManager.withdraw(tooMuch)).to.be.revertedWith("Insufficient free balance");
    });

    it("should allow withdraw of 1 wei", async function () {
      await vaultManager.withdraw(1);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT - 1n);
    });

    it("should reject non-owner withdraw", async function () {
      await expect(
        vaultManager.connect(addr1).withdraw(FUND_AMOUNT)
      ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
    });

    it("should emit VaultWithdrawn event", async function () {
      await expect(vaultManager.withdraw(FUND_AMOUNT))
        .to.emit(vaultManager, "VaultWithdrawn")
        .withArgs(owner.address, FUND_AMOUNT);
    });
  });

  // ============================================================
  // depositToVault edge cases
  // ============================================================
  describe("depositToVault — Edge Cases", function () {
    beforeEach(async function () {
      await vaultManager.fund(FUND_AMOUNT);
    });

    it("should reject depositToVault with 0 amount", async function () {
      await expect(vaultManager.depositToVault(0)).to.be.revertedWith("Amount must be > 0");
    });

    it("should handle multiple deposits tracking", async function () {
      await vaultManager.depositToVault(ethers.parseUnits("10000", 6));
      await vaultManager.depositToVault(ethers.parseUnits("20000", 6));
      expect(await vaultManager.totalDeposits()).to.equal(ethers.parseUnits("30000", 6));
    });

    it("should emit DepositRecorded event", async function () {
      const amount = ethers.parseUnits("50000", 6);
      await expect(vaultManager.depositToVault(amount))
        .to.emit(vaultManager, "DepositRecorded")
        .withArgs(amount);
    });
  });

  // ============================================================
  // withdrawFromVault edge cases
  // ============================================================
  describe("withdrawFromVault — Edge Cases", function () {
    beforeEach(async function () {
      await vaultManager.fund(FUND_AMOUNT);
    });

    it("should reject withdrawFromVault with 0 amount", async function () {
      await expect(
        vaultManager.withdrawFromVault(addr1.address, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should handle sequential withdrawals", async function () {
      const amount = ethers.parseUnits("10000", 6);
      await vaultManager.depositToVault(amount * 3n);

      await vaultManager.withdrawFromVault(addr1.address, amount);
      await vaultManager.withdrawFromVault(addr1.address, amount);
      await vaultManager.withdrawFromVault(addr1.address, amount);

      expect(await vaultManager.totalDeposits()).to.equal(0);
    });

    it("should emit WithdrawalRecorded event", async function () {
      const amount = ethers.parseUnits("5000", 6);
      await vaultManager.depositToVault(amount);

      await expect(vaultManager.withdrawFromVault(addr1.address, amount))
        .to.emit(vaultManager, "WithdrawalRecorded")
        .withArgs(amount);
    });
  });

  // ============================================================
  // withdrawInterest edge cases
  // ============================================================
  describe("withdrawInterest — Edge Cases", function () {
    beforeEach(async function () {
      await vaultManager.fund(FUND_AMOUNT);
    });

    it("should reject withdrawInterest with 0 amount", async function () {
      await expect(
        vaultManager.withdrawInterest(addr1.address, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should transfer interest without changing totalDeposits", async function () {
      const deposit = ethers.parseUnits("50000", 6);
      const interest = ethers.parseUnits("1000", 6);

      await vaultManager.depositToVault(deposit);

      const balBefore = await mockUSDC.balanceOf(addr1.address);
      await vaultManager.withdrawInterest(addr1.address, interest);
      const balAfter = await mockUSDC.balanceOf(addr1.address);

      expect(balAfter - balBefore).to.equal(interest);
      expect(await vaultManager.totalDeposits()).to.equal(deposit); // Unchanged
    });

    it("should reject if vault balance insufficient for interest", async function () {
      // Fund 100k, deposit 100k → no free balance for interest
      await vaultManager.depositToVault(FUND_AMOUNT);

      await expect(
        vaultManager.withdrawInterest(addr1.address, 1)
      ).to.be.revertedWith("Insufficient vault balance for interest");
    });

    it("should allow interest withdrawal when vault has reserves", async function () {
      // Fund 100k, deposit 50k → 50k free for interest
      const deposit = ethers.parseUnits("50000", 6);
      await vaultManager.depositToVault(deposit);

      const interest = ethers.parseUnits("10000", 6);
      await vaultManager.withdrawInterest(addr1.address, interest);

      expect(await vaultManager.totalDeposits()).to.equal(deposit);
    });
  });

  // ============================================================
  // Solvency edge cases
  // ============================================================
  describe("Solvency — Edge Cases", function () {
    it("should be solvent with zero balance and zero deposits", async function () {
      expect(await vaultManager.isSolvent()).to.equal(true);
    });

    it("should report zero available liquidity initially", async function () {
      expect(await vaultManager.getAvailableLiquidity()).to.equal(0);
    });

    it("should track solvency through operations", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      expect(await vaultManager.isSolvent()).to.equal(true);

      await vaultManager.depositToVault(FUND_AMOUNT);
      expect(await vaultManager.isSolvent()).to.equal(true);
      expect(await vaultManager.getAvailableLiquidity()).to.equal(0);
    });
  });

  // ============================================================
  // Pause — Comprehensive
  // ============================================================
  describe("Pause — Comprehensive", function () {
    it("should block depositToVault when paused", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      await vaultManager.pause();

      await expect(vaultManager.depositToVault(1)).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
    });

    it("should block withdrawFromVault when paused", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      await vaultManager.depositToVault(ethers.parseUnits("10000", 6));
      await vaultManager.pause();

      await expect(
        vaultManager.withdrawFromVault(addr1.address, ethers.parseUnits("10000", 6))
      ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
    });

    it("should block withdrawInterest when paused", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      await vaultManager.pause();

      await expect(
        vaultManager.withdrawInterest(addr1.address, 1)
      ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
    });

    it("should reject non-owner pause", async function () {
      await expect(
        vaultManager.connect(addr1).pause()
      ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
    });

    it("should reject non-owner unpause", async function () {
      await vaultManager.pause();
      await expect(
        vaultManager.connect(addr1).unpause()
      ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
    });

    it("should reject unpause when not paused", async function () {
      await expect(vaultManager.unpause()).to.be.revertedWithCustomError(vaultManager, "ExpectedPause");
    });
  });

  // ============================================================
  // USDC Balance Verification
  // ============================================================
  describe("USDC Balance — End-to-End", function () {
    it("should maintain correct balance after fund + deposit + withdraw", async function () {
      // Fund 100k
      await vaultManager.fund(FUND_AMOUNT);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT);

      // User deposits 50k
      const deposit = ethers.parseUnits("50000", 6);
      await vaultManager.depositToVault(deposit);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT);

      // Owner withdraws 30k free balance
      const ownerWithdraw = ethers.parseUnits("30000", 6);
      await vaultManager.withdraw(ownerWithdraw);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT - ownerWithdraw);

      // User withdraws 20k
      const userWithdraw = ethers.parseUnits("20000", 6);
      await vaultManager.withdrawFromVault(addr1.address, userWithdraw);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT - ownerWithdraw - userWithdraw);
    });
  });
});
