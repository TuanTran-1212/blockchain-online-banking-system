import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Coverage — Branch Fix", function () {
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
  const APR_BPS = 375;
  const PENALTY_BPS = 650;
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
  });

  // ============================================================
  // SavingCore: updatePlanApr — Invalid APR branches
  // ============================================================
  describe("updatePlanApr — Invalid APR", function () {
    it("should reject updatePlanApr with APR = 0", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await expect(savingCore.updatePlanApr(0, 0)).to.be.revertedWith("Invalid APR");
    });

    it("should reject updatePlanApr with APR > 5000", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await expect(savingCore.updatePlanApr(0, 5001)).to.be.revertedWith("Invalid APR");
    });
  });

  // ============================================================
  // SavingCore: enablePlan / disablePlan — Non-existent plan
  // ============================================================
  describe("enablePlan — Non-existent plan", function () {
    it("should reject enablePlan for non-existent plan", async function () {
      await expect(savingCore.enablePlan(99)).to.be.revertedWith("Plan does not exist");
    });
  });

  describe("disablePlan — Non-existent plan", function () {
    it("should reject disablePlan for non-existent plan", async function () {
      await expect(savingCore.disablePlan(99)).to.be.revertedWith("Plan does not exist");
    });
  });

  // ============================================================
  // SavingCore: unpause — Non-owner
  // ============================================================
  describe("unpause — Non-owner", function () {
    it("should reject non-owner calling unpause", async function () {
      await savingCore.pause();
      await expect(
        savingCore.connect(user1).unpause()
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================================
  // VaultManager: withdraw — Non-owner
  // ============================================================
  describe("VaultManager withdraw — Non-owner", function () {
    it("should reject non-owner calling withdraw", async function () {
      await expect(
        vaultManager.connect(user1).withdraw(ethers.parseUnits("100", 6))
      ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================================
  // VaultManager: paused operations
  // ============================================================
  describe("VaultManager — Paused withdrawFromVault", function () {
    it("should reject withdrawFromVault when paused", async function () {
      await vaultManager.pause();
      await expect(
        vaultManager.withdrawFromVault(user1.address, ethers.parseUnits("100", 6))
      ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
    });
  });

  describe("VaultManager — Paused withdrawInterest", function () {
    it("should reject withdrawInterest when paused", async function () {
      await vaultManager.pause();
      await expect(
        vaultManager.withdrawInterest(user1.address, ethers.parseUnits("100", 6))
      ).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: openDeposit when paused
  // ============================================================
  describe("openDeposit — When paused", function () {
    it("should reject openDeposit when paused", async function () {
      await savingCore.pause();
      await expect(
        savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: withdrawAtMaturity when paused
  // ============================================================
  describe("withdrawAtMaturity — When paused", function () {
    it("should reject withdrawAtMaturity when paused", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);
      await savingCore.pause();
      await expect(
        savingCore.connect(user1).withdrawAtMaturity(0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: earlyWithdraw when paused
  // ============================================================
  describe("earlyWithdraw — When paused", function () {
    it("should reject earlyWithdraw when paused", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.pause();
      await expect(
        savingCore.connect(user1).earlyWithdraw(0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: renewDeposit — Non-existent deposit
  // ============================================================
  describe("renewDeposit — Non-existent deposit", function () {
    it("should reject renewDeposit for non-existent deposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await expect(
        savingCore.connect(user1).renewDeposit(99, 0)
      ).to.be.revertedWith("Deposit does not exist");
    });
  });

  // ============================================================
  // SavingCore: renewDeposit — Not active
  // ============================================================
  describe("renewDeposit — Not active", function () {
    it("should reject renewDeposit for withdrawn deposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      await expect(
        savingCore.connect(user1).renewDeposit(0, 0)
      ).to.be.revertedWith("Not active");
    });
  });

  // ============================================================
  // SavingCore: renewDeposit — New plan non-existent
  // ============================================================
  describe("renewDeposit — New plan non-existent", function () {
    it("should reject renewDeposit with non-existent new plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);
      await expect(
        savingCore.connect(user1).renewDeposit(0, 99)
      ).to.be.revertedWith("New plan does not exist");
    });
  });

  // ============================================================
  // SavingCore: renewDeposit when paused
  // ============================================================
  describe("renewDeposit — When paused", function () {
    it("should reject renewDeposit when paused", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);
      await savingCore.pause();
      await expect(
        savingCore.connect(user1).renewDeposit(0, 0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: autoRenewDeposit — Not active
  // ============================================================
  describe("autoRenewDeposit — Not active", function () {
    it("should reject autoRenewDeposit for already renewed deposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      // Wait past maturity + grace period
      await time.increase((TENOR_DAYS + 4) * 86400);
      await savingCore.connect(user1).autoRenewDeposit(0);
      // Try again — should fail
      await expect(
        savingCore.connect(user1).autoRenewDeposit(0)
      ).to.be.revertedWith("Not active");
    });
  });

  // ============================================================
  // SavingCore: autoRenewDeposit when paused
  // ============================================================
  describe("autoRenewDeposit — When paused", function () {
    it("should reject autoRenewDeposit when paused", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase((TENOR_DAYS + 4) * 86400);
      await savingCore.pause();
      await expect(
        savingCore.connect(user1).autoRenewDeposit(0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: renewDeposit — maxDeposit inner true sub-branch
  // ============================================================
  describe("renewDeposit — maxDeposit satisfied", function () {
    it("should allow renew into plan with maxDeposit > newPrincipal", async function () {
      // Create plan 0: standard
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      // Create plan 1: maxDeposit = 15000 USDC (above newPrincipal ~10185)
      const maxDeposit = ethers.parseUnits("15000", 6);
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, maxDeposit, PENALTY_BPS);

      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      // Renew into plan 1 — newPrincipal ~10185 < 15000 → should succeed
      await expect(savingCore.connect(user1).renewDeposit(0, 1)).to.not.be.reverted;
    });
  });

  // ============================================================
  // Interest = 0 branches (3 branches)
  // Create plan with aprBps=1, tenorDays=1, minDeposit=1
  // interest = (1 * 1 * 86400) / (365 * 86400 * 10000) = 0
  // ============================================================
  describe("Interest = 0 — withdrawAtMaturity", function () {
    it("should handle withdrawAtMaturity with zero interest", async function () {
      // Create ultra-low plan: aprBps=1, tenorDays=1, minDeposit=1
      await savingCore.createPlan(1, 1, 1, 0, 0);
      // Mint 1 wei to user1 for deposit
      await mockUSDC.mint(user1.address, 1);
      await mockUSDC.connect(user1).approve(await savingCore.getAddress(), 1);
      // Open deposit of 1 wei
      await savingCore.connect(user1).openDeposit(0, 1);
      // Wait 1 day
      await time.increase(86400);
      // Withdraw — interest should be 0
      await expect(savingCore.connect(user1).withdrawAtMaturity(0)).to.not.be.reverted;
    });
  });

  describe("Interest = 0 — renewDeposit", function () {
    it("should handle renewDeposit with zero interest", async function () {
      await savingCore.createPlan(1, 1, 1, 0, 0);
      await mockUSDC.mint(user1.address, 1);
      await mockUSDC.connect(user1).approve(await savingCore.getAddress(), 1);
      await savingCore.connect(user1).openDeposit(0, 1);
      await time.increase(86400);
      // Renew into same plan — interest=0, newPrincipal=1
      await expect(savingCore.connect(user1).renewDeposit(0, 0)).to.not.be.reverted;
    });
  });

  describe("Interest = 0 — autoRenewDeposit", function () {
    it("should handle autoRenewDeposit with zero interest", async function () {
      await savingCore.createPlan(1, 1, 1, 0, 0);
      await mockUSDC.mint(user1.address, 1);
      await mockUSDC.connect(user1).approve(await savingCore.getAddress(), 1);
      await savingCore.connect(user1).openDeposit(0, 1);
      // Wait 1 day + 3 days grace = 4 days total
      await time.increase(4 * 86400);
      // Auto-renew — interest=0
      await expect(savingCore.connect(user1).autoRenewDeposit(0)).to.not.be.reverted;
    });
  });
});
