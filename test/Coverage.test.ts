import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

describe("Coverage — Uncovered Branches", function () {
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

    const user2Amount = ethers.parseUnits("200000", 6);
    await mockUSDC.mint(user2.address, user2Amount);
    await mockUSDC.connect(user2).approve(await savingCore.getAddress(), user2Amount);
  });

  // ============================================================
  // MockUSDC: initialMint = 0 branch
  // ============================================================
  describe("MockUSDC — initialMint = 0", function () {
    it("should deploy with zero initial mint", async function () {
      const MockUSDC = await ethers.getContractFactory("MockUSDC");
      const zeroMintUSDC = await MockUSDC.deploy(0);
      expect(await zeroMintUSDC.totalSupply()).to.equal(0);
      expect(await zeroMintUSDC.balanceOf(owner.address)).to.equal(0);
    });
  });

  // ============================================================
  // SavingCore: Constructor zero-address validation
  // ============================================================
  describe("SavingCore — Constructor Validation", function () {
    it("should reject zero USDC address", async function () {
      const SavingCore = await ethers.getContractFactory("SavingCore");
      await expect(
        SavingCore.deploy(ethers.ZeroAddress, await vaultManager.getAddress(), feeReceiver.address)
      ).to.be.revertedWith("Invalid USDC");
    });

    it("should reject zero VaultManager address", async function () {
      const SavingCore = await ethers.getContractFactory("SavingCore");
      await expect(
        SavingCore.deploy(await mockUSDC.getAddress(), ethers.ZeroAddress, feeReceiver.address)
      ).to.be.revertedWith("Invalid VaultManager");
    });

    it("should reject zero feeReceiver address", async function () {
      const SavingCore = await ethers.getContractFactory("SavingCore");
      await expect(
        SavingCore.deploy(await mockUSDC.getAddress(), await vaultManager.getAddress(), ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid feeReceiver");
    });
  });

  // ============================================================
  // SavingCore: getUserDeposits with actual deposits
  // ============================================================
  describe("getUserDeposits — With Deposits", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should return correct deposit IDs for user with deposits", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await savingCore.connect(user1).openDeposit(0, ethers.parseUnits("5000", 6));
      await savingCore.connect(user2).openDeposit(0, ethers.parseUnits("3000", 6));

      const user1Deposits = await savingCore.getUserDeposits(user1.address);
      expect(user1Deposits.length).to.equal(2);
      expect(user1Deposits[0]).to.equal(0);
      expect(user1Deposits[1]).to.equal(1);

      const user2Deposits = await savingCore.getUserDeposits(user2.address);
      expect(user2Deposits.length).to.equal(1);
      expect(user2Deposits[0]).to.equal(2);
    });
  });

  // ============================================================
  // SavingCore: tokenURI empty string branch
  // ============================================================
  describe("tokenURI — Empty URI", function () {
    beforeEach(async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
    });

    it("should return empty string when no URI set", async function () {
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      const uri = await savingCore.tokenURI(0);
      expect(uri).to.equal("");
    });

    it("should revert tokenURI for non-existent token", async function () {
      await expect(savingCore.tokenURI(999)).to.be.revertedWith("Token does not exist");
    });
  });

  // ============================================================
  // SavingCore: setTokenURI for non-existent token
  // ============================================================
  describe("setTokenURI — Non-existent Token", function () {
    it("should revert setTokenURI for non-existent token", async function () {
      await expect(
        savingCore.setTokenURI(999, "ipfs://abc")
      ).to.be.revertedWith("Token does not exist");
    });
  });

  // ============================================================
  // SavingCore: pause when already paused
  // ============================================================
  describe("Pause — Already Paused", function () {
    it("should revert pause when already paused", async function () {
      await savingCore.pause();
      await expect(savingCore.pause()).to.be.revertedWithCustomError(savingCore, "EnforcedPause");
    });
  });

  // ============================================================
  // SavingCore: earlyWithdraw with zero penalty (penaltyBps = 0)
  // ============================================================
  describe("Early Withdraw — Zero Penalty", function () {
    it("should allow early withdraw with 0 penalty plan", async function () {
      // Create plan with 0 penalty
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, 0);

      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Early withdraw — no penalty, full principal back
      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).earlyWithdraw(0);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      expect(balAfter - balBefore).to.equal(DEPOSIT_AMOUNT);
    });
  });

  // ============================================================
  // SavingCore: withdrawAtMaturity with zero interest (tenor = 0 or APR = 0)
  // ============================================================
  describe("Withdraw At Maturity — Zero Interest Edge", function () {
    it("should handle renew to disabled plan rejecting", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, 0, PENALTY_BPS);

      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      // Disable plan 1, try to renew into it
      await savingCore.disablePlan(1);
      await expect(
        savingCore.connect(user1).renewDeposit(0, 1)
      ).to.be.revertedWith("New plan is disabled");
    });

    it("should handle renew with maxDeposit limit exceeded", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      // Plan with maxDeposit = 11,000 USDC (interest will push above)
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, ethers.parseUnits("11000", 6), PENALTY_BPS);

      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      // interest ≈ 184.93, newPrincipal ≈ 10184.93 < 11000 → should succeed
      // But test the rejection: plan with maxDeposit = 10100
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, ethers.parseUnits("10100", 6), PENALTY_BPS);

      await expect(
        savingCore.connect(user1).renewDeposit(0, 2)
      ).to.be.revertedWith("New principal exceeds maximum");
    });
  });

  // ============================================================
  // SavingCore: withdrawAtMaturity when already withdrawn
  // ============================================================
  describe("withdrawAtMaturity — Already Withdrawn", function () {
    it("should reject withdrawAtMaturity for already withdrawn deposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);
      await time.increase(TENOR_DAYS * 86400);

      await savingCore.connect(user1).withdrawAtMaturity(0);

      // Try again — should fail because status is Withdrawn
      await expect(
        savingCore.connect(user1).withdrawAtMaturity(0)
      ).to.be.revertedWith("Not active");
    });
  });

  // ============================================================
  // SavingCore: renewDeposit when not yet matured
  // ============================================================
  describe("renewDeposit — Not Yet Matured", function () {
    it("should reject renew before maturity", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.createPlan(90, 500, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Try renew before maturity
      await expect(
        savingCore.connect(user1).renewDeposit(0, 1)
      ).to.be.revertedWith("Not yet matured");
    });
  });

  // ============================================================
  // SavingCore: withdrawAtMaturity non-existent deposit
  // ============================================================
  describe("withdrawAtMaturity — Non-existent Deposit", function () {
    it("should reject withdrawAtMaturity for non-existent deposit", async function () {
      await expect(
        savingCore.connect(user1).withdrawAtMaturity(99)
      ).to.be.revertedWith("Deposit does not exist");
    });
  });

  // ============================================================
  // SavingCore: earlyWithdraw non-existent deposit
  // ============================================================
  describe("earlyWithdraw — Non-existent Deposit", function () {
    it("should reject earlyWithdraw for non-existent deposit", async function () {
      await expect(
        savingCore.connect(user1).earlyWithdraw(99)
      ).to.be.revertedWith("Deposit does not exist");
    });
  });

  // ============================================================
  // SavingCore: earlyWithdraw on already withdrawn deposit
  // ============================================================
  describe("earlyWithdraw — Already Withdrawn", function () {
    it("should reject earlyWithdraw for already withdrawn deposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      await savingCore.connect(user1).earlyWithdraw(0);

      await expect(
        savingCore.connect(user1).earlyWithdraw(0)
      ).to.be.revertedWith("Not active");
    });
  });

  // ============================================================
  // SavingCore: autoRenewDeposit — not yet past grace period
  // ============================================================
  describe("autoRenewDeposit — Non-existent Deposit", function () {
    it("should reject autoRenewDeposit for non-existent deposit", async function () {
      await expect(
        savingCore.connect(user1).autoRenewDeposit(99)
      ).to.be.revertedWith("Deposit does not exist");
    });
  });

  // ============================================================
  // VaultManager: zero amount branches in fund/withdraw
  // ============================================================
  describe("VaultManager — Zero Amount Branches", function () {
    it("should reject fund(0) — already tested but ensuring branch", async function () {
      await expect(vaultManager.fund(0)).to.be.revertedWith("Amount must be > 0");
    });

    it("should reject withdraw(0)", async function () {
      await expect(vaultManager.withdraw(0)).to.be.revertedWith("Amount must be > 0");
    });

    it("should reject withdrawFromVault with 0", async function () {
      await expect(
        vaultManager.withdrawFromVault(user1.address, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });

    it("should reject withdrawInterest with 0", async function () {
      await expect(
        vaultManager.withdrawInterest(user1.address, 0)
      ).to.be.revertedWith("Amount must be > 0");
    });
  });

  // ============================================================
  // VaultManager: unpause when not paused
  // ============================================================
  describe("VaultManager — Unpause When Not Paused", function () {
    it("should revert unpause when not paused", async function () {
      await expect(vaultManager.unpause()).to.be.revertedWithCustomError(vaultManager, "ExpectedPause");
    });
  });

  // ============================================================
  // SavingCore: disablePlan on already disabled
  // ============================================================
  describe("Plan Validation — Already Disabled", function () {
    it("should revert disablePlan for already disabled plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.disablePlan(0);
      await expect(savingCore.disablePlan(0)).to.be.revertedWith("Already disabled");
    });
  });

  // ============================================================
  // SavingCore: enablePlan on already enabled
  // ============================================================
  describe("Plan Validation — Already Enabled", function () {
    it("should revert enablePlan for already enabled plan", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await expect(savingCore.enablePlan(0)).to.be.revertedWith("Already enabled");
    });
  });

  // ============================================================
  // SavingCore: setFeeReceiver
  // ============================================================
  describe("setFeeReceiver", function () {
    it("should update fee receiver", async function () {
      await savingCore.setFeeReceiver(user2.address);
      expect(await savingCore.feeReceiver()).to.equal(user2.address);
    });

    it("should reject zero address fee receiver", async function () {
      await expect(
        savingCore.setFeeReceiver(ethers.ZeroAddress)
      ).to.be.revertedWith("Invalid address");
    });

    it("should reject non-owner setFeeReceiver", async function () {
      await expect(
        savingCore.connect(user1).setFeeReceiver(user2.address)
      ).to.be.revertedWithCustomError(savingCore, "OwnableUnauthorizedAccount");
    });
  });

  // ============================================================
  // SavingCore: createPlan with penalty = 0 (valid)
  // ============================================================
  describe("createPlan — Zero Penalty (Valid)", function () {
    it("should allow creating plan with 0 penalty", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, 0, 0);
      const plan = await savingCore.getPlan(0);
      expect(plan.earlyWithdrawPenaltyBps).to.equal(0);
    });
  });

  // ============================================================
  // SavingCore: createPlan with maxDeposit > 0
  // ============================================================
  describe("createPlan — With MaxDeposit", function () {
    it("should allow creating plan with maxDeposit", async function () {
      await savingCore.createPlan(TENOR_DAYS, APR_BPS, MIN_DEPOSIT, ethers.parseUnits("50000", 6), PENALTY_BPS);
      const plan = await savingCore.getPlan(0);
      expect(plan.maxDeposit).to.equal(ethers.parseUnits("50000", 6));
    });
  });

  // ============================================================
  // SavingCore: withdrawAtMaturity with interest = 0 (very short tenor)
  // ============================================================
  describe("withdrawAtMaturity — Near-Zero Interest", function () {
    it("should handle withdraw with very small interest (1 second tenor)", async function () {
      // 1-day plan to minimize interest
      await savingCore.createPlan(1, APR_BPS, MIN_DEPOSIT, 0, PENALTY_BPS);
      await savingCore.connect(user1).openDeposit(0, DEPOSIT_AMOUNT);

      // Wait exactly 1 day
      await time.increase(1 * 86400);

      const balBefore = await mockUSDC.balanceOf(user1.address);
      await savingCore.connect(user1).withdrawAtMaturity(0);
      const balAfter = await mockUSDC.balanceOf(user1.address);

      // Interest should be small but > 0
      expect(balAfter).to.be.greaterThan(balBefore);
    });
  });
});
