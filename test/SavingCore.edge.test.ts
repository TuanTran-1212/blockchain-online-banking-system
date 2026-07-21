import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("SavingCore — Edge Cases & Comprehensive Tests", function () {
  let mockUSDC: any;
  let vaultManager: any;
  let savingCore: any;
  let owner: any;
  let user1: any;
  let user2: any;
  let user3: any;
  let feeReceiver: any;

  const INITIAL_MINT = ethers.parseUnits("1000000", 6);
  const FUND_AMOUNT = ethers.parseUnits("500000", 6);

  // Personal Variant
  const TENOR_DAYS = 180;
  const APR_BPS = 375;
  const PENALTY_BPS = 650;
  const MIN_DEPOSIT = ethers.parseUnits("100", 6);
  const DEPOSIT_AMOUNT = ethers.parseUnits("10000", 6);

  beforeEach(async function () {
    [owner, user1, user2, user3, feeReceiver] = await ethers.getSigners();

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

    const user2Amount = ethers.parseUnits("200000", 6);
    await mockUSDC.mint(user2.address, user2Amount);
    await mockUSDC.connect(user2).approve(await savingCore.getAddress(), user2Amount);
  });

  // ============================================================
  // Edge Case: openDeposit boundaries
  // ============================================================
  describe("openDeposit — Boundary Values", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should accept deposit at exact minDeposit", async function () {
      await savingCore.connect(user1).openDeposit(0, MIN_DEPOSIT);
      const dep = await savingCore.getDeposit(0);
      expect(dep.principal).to.equal(MIN_DEPOSIT);
    });

    it("should reject deposit at minDeposit - 1", async function () {
      const below = MIN_DEPOSIT - 1n;
      await expect(
        savingCore.connect(user1).openDeposit(0, below)
      ).to.be.revertedWith("Below minimum deposit");
    });

    it("should accept deposit of 1 USDC with minDeposit = 0", async function () {
      // Create plan with minDeposit = 0 (but contract requires > 0)
      // So test with minDeposit = 1 USDC
      await savingCore.createPlan(90, 500, ethers.parseUnits("1", 6), 0, 300);
      const oneUSDC = ethers.parseUnits("1", 6);
      await savingCore.connect(user1).openDeposit(1, oneUSDC);
      const dep = await savingCore.getDeposit(0);
      expect(dep.principal).to.equal(oneUSDC);
    });

    it("should handle multiple deposits from same user", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.connect(user1).openDeposit(0, ethers.parseUnits("5000", 6));

      expect(await savingCore.ownerOf(0)).to.equal(user1.address);
      expect(await savingCore.ownerOf(1)).to.equal(user1.address);

      const dep0 = await savingCore.getDeposit(0);
      const dep1 = await savingCore.getDeposit(1);
      expect(dep0.owner).to.equal(user1.address);
      expect(dep1.owner).to.equal(user1.address);
    });

    it("should handle deposits from multiple users", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.connect(user2).openDeposit(0, ethers.parseUnits("20000", 6));

      expect(await savingCore.ownerOf(0)).to.equal(user1.address);
      expect(await savingCore.ownerOf(1)).to.equal(user2.address);
    });
  });

  // ============================================================
  // Edge Case: openDeposit with maxDeposit limit
  // ============================================================
  describe("openDeposit — MaxDeposit Limit", function () {
    beforeEach(async function () {
      // Plan with maxDeposit = 50,000 USDC
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, ethers.parseUnits("50000", 6), PENALTY_BPS);
    });

    it("should accept deposit at exact maxDeposit", async function () {
      const maxDeposit = ethers.parseUnits("50000", 6);
      await savingCore.connect(user1).openDeposit(0, maxDeposit);
      const dep = await savingCore.getDeposit(0);
      expect(dep.principal).to.equal(maxDeposit);
    });

    it("should reject deposit exceeding maxDeposit", async function () {
      const over = ethers.parseUnits("50001", 6);
      await expect(
        savingCore.connect(user1).openDeposit(0, over)
      ).to.be.revertedWith("Exceeds maximum deposit");
    });
  });

  // ============================================================
  // Edge Case: withdrawAtMaturity boundary
  // ============================================================
  describe("withdrawAtMaturity — Boundary Timing", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should allow withdraw at exact maturity timestamp", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Get exact maturity time
      const dep = await savingCore.getDeposit(0);
      const maturityTs = dep.maturityAt;

      // Increase to exactly maturity
      await time.increaseTo(maturityTs);

      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      expect(balAfter).to.be.greaterThan(balBefore);
    });

    it("should reject withdraw 1 second before maturity", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const dep = await savingCore.getDeposit(0);
      // Use increaseTo with a margin — Hardhat mines next tx at +1s
      await time.increaseTo(dep.maturityAt - 2n);

      await expect(
        savingCore.connect(user1).withdrawAtMaturity(0)
      ).to.be.revertedWith("Not yet matured");
    });

    it("should burn NFT after withdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      expect(await savingCore.ownerOf(0)).to.equal(user1.address);

      await time.increase(TENOR_DAYS * 86400);
      await savingCore.connect(user1).withdrawAtMaturity(0);

      await expect(savingCore.ownerOf(0)).to.be.reverted;
    });
  });

  // ============================================================
  // Edge Case: earlyWithdraw timing
  // ============================================================
  describe("earlyWithdraw — Timing & Penalty", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should allow early withdraw immediately after opening", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Withdraw immediately (1 second later)
      await time.increase(1);

      const penalty = (DEPOSIT_AMOUNT * BigInt(PENALTY_BPS)) / 10000n;
      const userPayout = DEPOSIT_AMOUNT - penalty;

      const userBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).earlyWithdraw(0);
      const userAfter = await mockUSDC.balanceOf(user1.address);

      expect(userAfter - userBefore).to.equal(userPayout);
    });

    it("should allow early withdraw 1 second before maturity", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const dep = await savingCore.getDeposit(0);
      await time.increaseTo(dep.maturityAt - 1n);

      // Still counts as early withdraw
      await savingCore.connect(user1).earlyWithdraw(0);
      expect((await savingCore.getDeposit(0)).status).to.equal(1);
    });

    it("should burn NFT after early withdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.connect(user1).earlyWithdraw(0);

      await expect(savingCore.ownerOf(0)).to.be.reverted;
    });

    it("should send penalty to feeReceiver", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const penalty = (DEPOSIT_AMOUNT * BigInt(PENALTY_BPS)) / 10000n;
      const feeBefore = await mockUSDC.balanceOf(feeReceiver.address);

      await savingCore.connect(user1).earlyWithdraw(0);

      const feeAfter = await mockUSDC.balanceOf(feeReceiver.address);
      expect(feeAfter - feeBefore).to.equal(penalty);
    });
  });

  // ============================================================
  // Edge Case: renewDeposit
  // ============================================================
  describe("renewDeposit — Edge Cases", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.createPlan(30, 200, ethers.parseUnits("50000", 6), 0, PENALTY_BPS);
    });

    it("should renew into same plan", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      const expectedInterest = (DEPOSIT_AMOUNT * BigInt(APR_BPS) * BigInt(TENOR_DAYS * 86400)) / (365n * 86400n * 10000n);
      const newPrincipal = DEPOSIT_AMOUNT + expectedInterest;

      await savingCore.connect(user1).renewDeposit(0, 0);

      const newDep = await savingCore.getDeposit(1);
      expect(newDep.principal).to.equal(newPrincipal);
      expect(newDep.planId).to.equal(0);
      expect(newDep.aprBpsAtOpen).to.equal(APR_BPS);
    });

    it("should reject renew into disabled plan", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      await savingCore.disablePlan(1);

      await expect(
        savingCore.connect(user1).renewDeposit(0, 1)
      ).to.be.revertedWith("New plan is disabled");
    });

    it("should reject renew when new principal below minDeposit", async function () {
      // Plan 2 has minDeposit = 50,000 USDC
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      await expect(
        savingCore.connect(user1).renewDeposit(0, 2)
      ).to.be.revertedWith("New principal below minimum");
    });

    it("should burn old NFT and mint new NFT on renew", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      await savingCore.connect(user1).renewDeposit(0, 1);

      // Old NFT burned
      await expect(savingCore.ownerOf(0)).to.be.reverted;

      // New NFT minted
      expect(await savingCore.ownerOf(1)).to.equal(user1.address);
    });
  });

  // ============================================================
  // Edge Case: autoRenewDeposit boundary
  // ============================================================
  describe("autoRenewDeposit — Grace Period Boundary", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should reject auto-renew at exactly maturityAt + gracePeriod - 1", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const dep = await savingCore.getDeposit(0);
      const graceEnd = dep.maturityAt + 3n * 86400n;

      // Use margin — Hardhat mines next tx at +1s
      await time.increaseTo(graceEnd - 2n);

      await expect(
        savingCore.connect(user1).autoRenewDeposit(0)
      ).to.be.revertedWith("Grace period not ended");
    });

    it("should allow auto-renew at exactly maturityAt + gracePeriod", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      const dep = await savingCore.getDeposit(0);
      const graceEnd = dep.maturityAt + 3n * 86400n;

      await time.increaseTo(graceEnd);

      await savingCore.connect(user1).autoRenewDeposit(0);
      expect((await savingCore.getDeposit(0)).status).to.equal(3); // AutoRenewed
    });

    it("should keep original APR even if plan APR was updated", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Update plan APR after deposit opened
      await savingCore.updatePlanApr(0, 1000); // Change to 10%

      await time.increase((TENOR_DAYS + 4) * 86400);

      await savingCore.connect(user1).autoRenewDeposit(0);

      const newDep = await savingCore.getDeposit(1);
      expect(newDep.aprBpsAtOpen).to.equal(APR_BPS); // Original 375 bps, NOT 1000
    });

    it("should allow auto-renew long after grace period", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Fast forward 1 year
      await time.increase(365 * 86400);

      await savingCore.connect(user1).autoRenewDeposit(0);
      expect((await savingCore.getDeposit(0)).status).to.equal(3);
    });
  });

  // ============================================================
  // Access Control — Comprehensive
  // ============================================================
  describe("Access Control — Comprehensive", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should reject user calling createPlan", async function () {
      await expect(
        savingCore.connect(user1).createPlan(90, 500, MIN_DEPOSIT, 0, 300)
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });

    it("should reject user calling updatePlanApr", async function () {
      await expect(
        savingCore.connect(user1).updatePlanApr(0, 500)
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });

    it("should reject user calling disablePlan", async function () {
      await expect(
        savingCore.connect(user1).disablePlan(0)
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });

    it("should reject user calling enablePlan", async function () {
      await savingCore.disablePlan(0);
      await expect(
        savingCore.connect(user1).enablePlan(0)
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });

    it("should reject user calling pause", async function () {
      await expect(
        savingCore.connect(user1).pause()
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });

    it("should reject non-owner earlyWithdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await expect(
        savingCore.connect(user2).earlyWithdraw(0)
      ).to.be.revertedWith("Not your deposit");
    });

    it("should reject non-owner renewDeposit", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      await expect(
        savingCore.connect(user2).renewDeposit(0, 0)
      ).to.be.revertedWith("Not your deposit");
    });

    it("should reject non-owner autoRenewDeposit", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase((TENOR_DAYS + 4) * 86400);

      await expect(
        savingCore.connect(user2).autoRenewDeposit(0)
      ).to.be.revertedWith("Not your deposit");
    });
  });

  // ============================================================
  // Interest Calculation — Multiple Scenarios
  // ============================================================
  describe("Interest Calculation — Multiple Scenarios", function () {
    it("should calculate interest for 30-day tenor", async function () {
      const principal = ethers.parseUnits("10000", 6);
      const tenor = 30 * 86400;
      const interest = await savingCore.calculateInterest(principal, 375n, BigInt(tenor));

      // Expected: 10000 * 375 * 30 / (365 * 10000) = 30.82... USDC
      expect(interest).to.be.greaterThan(ethers.parseUnits("30", 6));
      expect(interest).to.be.lessThan(ethers.parseUnits("31", 6));
    });

    it("should calculate interest for 365-day tenor", async function () {
      const principal = ethers.parseUnits("10000", 6);
      const tenor = 365 * 86400;
      const interest = await savingCore.calculateInterest(principal, 375n, BigInt(tenor));

      // Expected: 10000 * 375 * 365 / (365 * 10000) = 375 USDC
      expect(interest).to.equal(ethers.parseUnits("375", 6));
    });

    it("should calculate interest for 1-day tenor", async function () {
      const principal = ethers.parseUnits("10000", 6);
      const tenor = 1 * 86400;
      const interest = await savingCore.calculateInterest(principal, 375n, BigInt(tenor));

      // Expected: 10000 * 375 * 1 / (365 * 10000) = 1.027... USDC
      expect(interest).to.be.greaterThan(ethers.parseUnits("1", 6));
      expect(interest).to.be.lessThan(ethers.parseUnits("2", 6));
    });

    it("should return 0 interest for 0 tenor", async function () {
      const principal = ethers.parseUnits("10000", 6);
      const interest = await savingCore.calculateInterest(principal, 375n, 0n);
      expect(interest).to.equal(0);
    });

    it("should handle small principal correctly", async function () {
      const principal = ethers.parseUnits("100", 6); // 100 USDC
      const tenor = 180 * 86400;
      const interest = await savingCore.calculateInterest(principal, 375n, BigInt(tenor));

      // Expected: 100 * 375 * 180 / (365 * 10000) = 1.849... USDC
      expect(interest).to.be.greaterThan(ethers.parseUnits("1", 6));
      expect(interest).to.be.lessThan(ethers.parseUnits("2", 6));
    });
  });

  // ============================================================
  // Integration: Full Lifecycle
  // ============================================================
  describe("Integration — Full Lifecycle", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("lifecycle: open → withdraw at maturity", async function () {
      // Open
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      const dep = await savingCore.getDeposit(0);
      expect(dep.status).to.equal(0); // Active

      // Wait
      await time.increase(TENOR_DAYS * 86400);

      // Withdraw
      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      expect(balAfter).to.be.greaterThan(balBefore);
      expect((await savingCore.getDeposit(0)).status).to.equal(1); // Withdrawn
    });

    it("lifecycle: open → renew → withdraw", async function () {
      // Open deposit 0
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Wait to maturity
      await time.increase(TENOR_DAYS * 86400);

      // Renew into plan 1 (90 days)
      await savingCore.connect(user1).renewDeposit(0, 1);
      expect((await savingCore.getDeposit(0)).status).to.equal(2); // ManualRenewed

      // Wait for new maturity
      await time.increase(90 * 86400);

      // Withdraw from new deposit
      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(1);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      expect(balAfter).to.be.greaterThan(balBefore);
    });

    it("lifecycle: open → auto-renew → withdraw", async function () {
      // Open deposit 0
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Wait past grace period
      await time.increase((TENOR_DAYS + 4) * 86400);

      // Auto-renew
      await savingCore.connect(user1).autoRenewDeposit(0);
      expect((await savingCore.getDeposit(0)).status).to.equal(3); // AutoRenewed

      // Wait for new maturity
      await time.increase(TENOR_DAYS * 86400);

      // Withdraw from new deposit
      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(1);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      expect(balAfter).to.be.greaterThan(balBefore);
    });

    it("lifecycle: user1 opens, user2 opens, both withdraw", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.connect(user2).openDeposit(0, ethers.parseUnits("20000", 6));

      await time.increase(TENOR_DAYS * 86400);

      await savingCore.connect(user1).withdrawAtMaturity(0);
      await savingCore.connect(user2).withdrawAtMaturity(1);

      expect((await savingCore.getDeposit(0)).status).to.equal(1);
      expect((await savingCore.getDeposit(1)).status).to.equal(1);
    });
  });

  // ============================================================
  // ERC721 NFT Metadata
  // ============================================================
  describe("ERC721 NFT — Metadata", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should set and get tokenURI", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await savingCore.setTokenURI(0, "ipfs://Qm123");
      expect(await savingCore.tokenURI(0)).to.equal("ipfs://Qm123");
    });

    it("should return empty string by default", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      expect(await savingCore.tokenURI(0)).to.equal("");
    });

    it("should reject non-owner setTokenURI", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await expect(
        savingCore.connect(user1).setTokenURI(0, "ipfs://abc")
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });

    it("should return correct token count", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.connect(user1).openDeposit(0, ethers.parseUnits("5000", 6));

      expect(await savingCore.balanceOf(user1.address)).to.equal(2);
    });
  });

  // ============================================================
  // Pause — All Operations
  // ============================================================
  describe("Pause — All Operations Blocked", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
    });

    it("should block withdrawAtMaturity when paused", async function () {
      await time.increase(TENOR_DAYS * 86400);
      await savingCore.pause();

      await expect(
        savingCore.connect(user1).withdrawAtMaturity(0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });

    it("should block earlyWithdraw when paused", async function () {
      await savingCore.pause();

      await expect(
        savingCore.connect(user1).earlyWithdraw(0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });

    it("should block renewDeposit when paused", async function () {
      await time.increase(TENOR_DAYS * 86400);
      await savingCore.pause();

      await expect(
        savingCore.connect(user1).renewDeposit(0, 0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });

    it("should block autoRenewDeposit when paused", async function () {
      await time.increase((TENOR_DAYS + 4) * 86400);
      await savingCore.pause();

      await expect(
        savingCore.connect(user1).autoRenewDeposit(0)
      ).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });

    it("should allow operations after unpause", async function () {
      await savingCore.pause();
      await savingCore.unpause();

      await time.increase(TENOR_DAYS * 86400);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      expect((await savingCore.getDeposit(0)).status).to.equal(1);
    });
  });

  // ============================================================
  // Plan Validation
  // ============================================================
  describe("Plan Validation", function () {
    it("should reject createPlan with tenorDays = 0", async function () {
      await expect(
        savingCore.createPlan(0, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS)
      ).to.be.revertedWith("Tenor must be > 0");
    });

    it("should reject createPlan with APR = 0", async function () {
      await expect(
        savingCore.createPlan(TENOR_DAYS, 0, MIN_DEPOSIT, 0, PENALTY_BPS)
      ).to.be.revertedWith("Invalid APR");
    });

    it("should reject createPlan with APR > 5000", async function () {
      await expect(
        savingCore.createPlan(TENOR_DAYS, 5001, MIN_DEPOSIT, 0, PENALTY_BPS)
      ).to.be.revertedWith("Invalid APR");
    });

    it("should reject createPlan with penalty > 2000", async function () {
      await expect(
        savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, 2001)
      ).to.be.revertedWith("Invalid penalty");
    });

    it("should reject createPlan with minDeposit = 0", async function () {
      await expect(
        savingCore.createPlan(TENOR_DAYS, APR_BPS, 0, 0, PENALTY_BPS)
      ).to.be.revertedWith("minDeposit must be > 0");
    });

    it("should reject updatePlanApr for non-existent plan", async function () {
      await expect(
        savingCore.updatePlanApr(99, 500)
      ).to.be.revertedWith("Plan does not exist");
    });

    it("should reject enablePlan for already enabled plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await expect(
        savingCore.enablePlan(0)
      ).to.be.revertedWith("Already enabled");
    });

    it("should reject disablePlan for already disabled plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.disablePlan(0);
      await expect(
        savingCore.disablePlan(0)
      ).to.be.revertedWith("Already disabled");
    });
  });

  // ============================================================
  // Edge Case: Non-existent deposits
  // ============================================================
  describe("Non-existent Resources", function () {
    it("should reject getDeposit for non-existent deposit", async function () {
      await expect(savingCore.getDeposit(0)).to.be.revertedWith("Deposit does not exist");
    });

    it("should reject getPlan for non-existent plan", async function () {
      await expect(savingCore.getPlan(0)).to.be.revertedWith("Plan does not exist");
    });

    it("should reject openDeposit for non-existent plan", async function () {
      await expect(
        savingCore.connect(user1).openDeposit(99, DEPOSIT_AMOUNT)
      ).to.be.revertedWith("Plan does not exist");
    });

    it("should return empty array for getUserDeposits with no deposits", async function () {
      const deposits = await savingCore.getUserDeposits(user1.address);
      expect(deposits.length).to.equal(0);
    });
  });
});
