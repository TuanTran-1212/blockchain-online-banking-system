import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SavingCore", function () {
  let mockUSDC: any;
  let vaultManager: any;
  let savingCore: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let feeReceiver: any;

  const INITIAL_MINT = ethers.parseUnits("1000000", 6);
  const FUND_AMOUNT = ethers.parseUnits("500000", 6);

  // Plan parameters (Personal Variant)
  const TENOR_DAYS = 180;
  const APR_BPS = 375;           // 3.75%
  const PENALTY_BPS = 650;       // 6.50%
  const MIN_DEPOSIT = ethers.parseUnits("100", 6);    // 100 USDC
  const DEPOSIT_AMOUNT = ethers.parseUnits("10000", 6); // 10,000 USDC

  beforeEach(async function () {
    [owner, user1, user2, feeReceiver] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy(INITIAL_MINT);
    await mockUSDC.waitForDeployment();

    // Deploy VaultManager
    const VaultManager = await ethers.getContractFactory("VaultManager");
    vaultManager = await VaultManager.deploy(await mockUSDC.getAddress());
    await vaultManager.waitForDeployment();

    // Deploy SavingCore (feeReceiver = user2 for testing)
    const SavingCore = await ethers.getContractFactory("SavingCore");
    savingCore = await SavingCore.deploy(
      await mockUSDC.getAddress(),
      await vaultManager.getAddress(),
      feeReceiver.address
    );
    await savingCore.waitForDeployment();

    // Fund vault
    await mockUSDC.approve(await vaultManager.getAddress(), FUND_AMOUNT);
    await vaultManager.fund(FUND_AMOUNT);

    // Give user1 some USDC and approve SavingCore
    const user1Amount = ethers.parseUnits("100000", 6);
    await mockUSDC.mint(user1.address, user1Amount);
    await mockUSDC.connect(user1).approve(await savingCore.getAddress(), user1Amount);
  });

  // ============================================================
  // Admin: Plan Management
  // ============================================================
  describe("Plan Management", function () {
    it("should create a plan", async function () {
      const tx = await savingCore.createPlan(
        TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS
      );
      const receipt = await tx.wait();
      expect(await savingCore.planCount()).to.equal(1);

      const plan = await savingCore.getPlan(0);
      expect(plan.tenorDays).to.equal(TENOR_DAYS);
      expect(plan.aprBps).to.equal(APR_BPS);
      expect(plan.minDeposit).to.equal(MIN_DEPOSIT);
      expect(plan.enabled).to.equal(true);
    });

    it("should update plan APR only", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.updatePlanApr(0, 500);
      const plan = await savingCore.getPlan(0);
      expect(plan.aprBps).to.equal(500);
      expect(plan.tenorDays).to.equal(TENOR_DAYS); // Unchanged
    });

    it("should disable and re-enable plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.disablePlan(0);
      expect((await savingCore.getPlan(0)).enabled).to.equal(false);

      await savingCore.enablePlan(0);
      expect((await savingCore.getPlan(0)).enabled).to.equal(true);
    });

    it("should reject non-admin plan creation", async function () {
      await expect(
        savingCore.connect(user1).createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS)
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================================
  // Flow 1: openDeposit → withdrawAtMaturity
  // ============================================================
  describe("Flow 1: Open → Withdraw at Maturity", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should open a deposit and mint NFT", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      const deposit = await savingCore.getDeposit(0);

      expect(deposit.planId).to.equal(0);
      expect(deposit.owner).to.equal(user1.address);
      expect(deposit.principal).to.equal(DEPOSIT_AMOUNT);
      expect(deposit.status).to.equal(0); // Active

      // NFT minted
      expect(await savingCore.ownerOf(0)).to.equal(user1.address);
    });

    it("should withdraw at maturity with correct interest", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Fast forward to maturity
      await time.increase(TENOR_DAYS * 86400);

      // Calculate expected interest
      const expectedInterest = (DEPOSIT_AMOUNT * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n);

      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      expect(balAfter - balBefore).to.equal(DEPOSIT_AMOUNT + expectedInterest);
      expect((await savingCore.getDeposit(0)).status).to.equal(1); // Withdrawn
    });

    it("should reject withdraw before maturity", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await expect(
        savingCore.connect(user1).withdrawAtMaturity(0)
      ).to.be.revertedWith("Not yet matured");
    });

    it("should reject deposit below minimum", async function () {
      const smallAmount = ethers.parseUnits("10", 6);
      await expect(
        savingCore.connect(user1).openDeposit(0, smallAmount)
      ).to.be.revertedWith("Below minimum deposit");
    });
  });

  // ============================================================
  // Flow 2: openDeposit → earlyWithdraw
  // ============================================================
  describe("Flow 2: Open → Early Withdraw", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should early withdraw with penalty, 0 interest", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Withdraw early (before maturity)
      const penalty = (DEPOSIT_AMOUNT * BigInt(PENALTY_BPS)) / 10000n;
      const userPayout = DEPOSIT_AMOUNT - penalty;

      const userBefore = await mockUSDC.balanceOf(user1.address);
      const feeBefore = await mockUSDC.balanceOf(feeReceiver.address);

      await savingCore.connect(user1).earlyWithdraw(0);

      const userAfter = await mockUSDC.balanceOf(user1.address);
      const feeAfter = await mockUSDC.balanceOf(feeReceiver.address);

      expect(userAfter - userBefore).to.equal(userPayout);
      expect(feeAfter - feeBefore).to.equal(penalty);
      expect((await savingCore.getDeposit(0)).status).to.equal(1); // Withdrawn
    });
  });

  // ============================================================
  // Flow 3: openDeposit → renewDeposit
  // ============================================================
  describe("Flow 3: Open → Renew", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, 0, PENALTY_BPS); // 2nd plan: 90 days, 5%
    });

    it("should renew with interest added to new principal", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Fast forward to maturity
      await time.increase(TENOR_DAYS * 86400);

      const expectedInterest = (DEPOSIT_AMOUNT * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n);
      const newPrincipal = DEPOSIT_AMOUNT + expectedInterest;

      // Renew into plan 1 (90 days, 5%)
      const newDepositId = await savingCore.connect(user1).renewDeposit.staticCall(0, 1);
      await savingCore.connect(user1).renewDeposit(0, 1);

      // Old deposit renewed
      expect((await savingCore.getDeposit(0)).status).to.equal(2); // ManualRenewed

      // New deposit created
      const newDep = await savingCore.getDeposit(newDepositId);
      expect(newDep.principal).to.equal(newPrincipal);
      expect(newDep.planId).to.equal(1);
      expect(newDep.aprBpsAtOpen).to.equal(500); // New plan's APR
    });
  });

  // ============================================================
  // Flow 4: openDeposit → autoRenewDeposit (after grace period)
  // ============================================================
  describe("Flow 4: Open → Auto Renew", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should auto-renew after grace period with original APR", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Fast forward past maturity + grace period (3 days)
      await time.increase((TENOR_DAYS + 4) * 86400);

      const expectedInterest = (DEPOSIT_AMOUNT * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n);
      const newPrincipal = DEPOSIT_AMOUNT + expectedInterest;

      const newDepositId = await savingCore.connect(user1).autoRenewDeposit.staticCall(0);
      await savingCore.connect(user1).autoRenewDeposit(0);

      // Old deposit auto-renewed
      expect((await savingCore.getDeposit(0)).status).to.equal(3); // AutoRenewed

      // New deposit keeps original APR
      const newDep = await savingCore.getDeposit(newDepositId);
      expect(newDep.principal).to.equal(newPrincipal);
      expect(newDep.aprBpsAtOpen).to.equal(APR_BPS); // Original APR preserved
      expect(newDep.penaltyBpsAtOpen).to.equal(PENALTY_BPS); // Original penalty preserved
    });

    it("should reject auto-renew during grace period", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Fast forward to just before grace period ends (maturity + 2 days)
      await time.increase((TENOR_DAYS + 2) * 86400);

      await expect(
        savingCore.connect(user1).autoRenewDeposit(0)
      ).to.be.revertedWith("Grace period not ended");
    });
  });

  // ============================================================
  // Access Control
  // ============================================================
  describe("Access Control", function () {
    it("should reject non-owner withdrawing someone else's deposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      await expect(
        savingCore.connect(user2).withdrawAtMaturity(0)
      ).to.be.revertedWith("Not your deposit");
    });

    it("should reject operations on disabled plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.disablePlan(0);

      await expect(
        savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Plan is disabled");
    });
  });

  // ============================================================
  // Interest Calculation
  // ============================================================
  describe("Interest Calculation", function () {
    it("should calculate simple interest correctly", async function () {
      // 10,000 USDC, 3.75% APR, 180 days
      const principal = ethers.parseUnits("10000", 6);
      const aprBps = 375n;
      const tenorSeconds = BigInt(TENOR_DAYS * 86400);

      const expectedInterest = (principal * aprBps * tenorSeconds) / (365n * 86400n * 10000n);
      const actualInterest = await savingCore.calculateInterest(principal, aprBps, tenorSeconds);

      expect(actualInterest).to.equal(expectedInterest);
    });

    it("should verify interest formula: 10000 USDC * 3.75% * 180 days", async function () {
      const principal = ethers.parseUnits("10000", 6);
      // Interest = 10000 * 375 * (180*86400) / (365*86400*10000)
      //         = 10000 * 375 * 180 / (365 * 10000)
      //         = 10000 * 375 / 365 * 180 / 10000
      //         = 375 * 180 / 365
      //         = 184.9315... USDC
      const tenorSeconds = BigInt(TENOR_DAYS * 86400);
      const interest = await savingCore.calculateInterest(principal, 375n, tenorSeconds);

      // Should be approximately 184.931506... USDC
      expect(interest).to.be.greaterThan(ethers.parseUnits("184", 6));
      expect(interest).to.be.lessThan(ethers.parseUnits("185", 6));
    });
  });

  // ============================================================
  // Pause
  // ============================================================
  describe("Pause", function () {
    it("should reject openDeposit when paused", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.pause();

      await expect(
        savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });
});
