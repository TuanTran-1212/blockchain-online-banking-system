import { expect } from "chai";
import { ethers } from "hardhat";

describe("VaultManager", function () {
  let mockUSDC: any;
  let vaultManager: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  const INITIAL_MINT = ethers.parseUnits("1000000", 6); // 1M mUSDC
  const FUND_AMOUNT = ethers.parseUnits("100000", 6);   // 100k mUSDC

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    // Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy(INITIAL_MINT);
    await mockUSDC.waitForDeployment();

    // Deploy VaultManager
    const VaultManager = await ethers.getContractFactory("VaultManager");
    vaultManager = await VaultManager.deploy(await mockUSDC.getAddress());
    await vaultManager.waitForDeployment();

    // Approve VaultManager to spend owner's USDC
    await mockUSDC.approve(await vaultManager.getAddress(), FUND_AMOUNT);
  });

  describe("Deployment", function () {
    it("should set USDC address correctly", async function () {
      expect(await vaultManager.usdc()).to.equal(await mockUSDC.getAddress());
    });

    it("should set owner correctly", async function () {
      expect(await vaultManager.owner()).to.equal(owner.address);
    });

    it("should start with zero totalDeposits", async function () {
      expect(await vaultManager.totalDeposits()).to.equal(0);
    });
  });

  describe("Fund", function () {
    it("should allow owner to fund vault", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      expect(await vaultManager.vaultBalance()).to.equal(FUND_AMOUNT);
    });

    it("should emit VaultFunded event", async function () {
      await expect(vaultManager.fund(FUND_AMOUNT))
        .to.emit(vaultManager, "VaultFunded")
        .withArgs(owner.address, FUND_AMOUNT);
    });

    it("should reject non-owner funding", async function () {
      await mockUSDC.transfer(addr1.address, FUND_AMOUNT);
      await mockUSDC.connect(addr1).approve(await vaultManager.getAddress(), FUND_AMOUNT);
      await expect(
        vaultManager.connect(addr1).fund(FUND_AMOUNT)
      ).to.be.revertedWithCustomError(vaultManager, "OwnableUnauthorizedAccount");
    });

    it("should reject zero amount", async function () {
      await expect(vaultManager.fund(0)).to.be.revertedWith("Amount must be > 0");
    });
  });

  describe("Withdraw (Owner)", function () {
    beforeEach(async function () {
      await vaultManager.fund(FUND_AMOUNT);
    });

    it("should allow owner to withdraw free balance", async function () {
      const balBefore = await mockUSDC.balanceOf(owner.address);
      await vaultManager.withdraw(FUND_AMOUNT);
      const balAfter = await mockUSDC.balanceOf(owner.address);
      expect(balAfter - balBefore).to.equal(FUND_AMOUNT);
    });

    it("should reject withdraw exceeding free balance", async function () {
      // Fund 100k, then record 100k deposit → no free balance left
      await mockUSDC.approve(await vaultManager.getAddress(), FUND_AMOUNT);
      await vaultManager.depositToVault(FUND_AMOUNT);
      await expect(vaultManager.withdraw(1)).to.be.revertedWith("Insufficient free balance");
    });
  });

  describe("Deposit / Withdraw Vault", function () {
    beforeEach(async function () {
      await vaultManager.fund(FUND_AMOUNT);
    });

    it("should track totalDeposits correctly", async function () {
      await vaultManager.depositToVault(ethers.parseUnits("50000", 6));
      expect(await vaultManager.totalDeposits()).to.equal(ethers.parseUnits("50000", 6));
    });

    it("should transfer USDC on withdrawFromVault", async function () {
      const amount = ethers.parseUnits("10000", 6);
      await vaultManager.depositToVault(amount);

      const balBefore = await mockUSDC.balanceOf(addr1.address);
      await vaultManager.withdrawFromVault(addr1.address, amount);
      const balAfter = await mockUSDC.balanceOf(addr1.address);
      expect(balAfter - balBefore).to.equal(amount);
    });

    it("should revert if withdraw exceeds tracked deposits", async function () {
      await expect(
        vaultManager.withdrawFromVault(addr1.address, 1)
      ).to.be.revertedWith("Insufficient deposits tracked");
    });
  });

  describe("Solvency", function () {
    it("should be solvent when vault has enough balance", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      await vaultManager.depositToVault(ethers.parseUnits("50000", 6));
      expect(await vaultManager.isSolvent()).to.equal(true);
    });

    it("should report correct available liquidity", async function () {
      await vaultManager.fund(FUND_AMOUNT);
      const depositAmt = ethers.parseUnits("30000", 6);
      await vaultManager.depositToVault(depositAmt);
      const expected = FUND_AMOUNT - depositAmt;
      expect(await vaultManager.getAvailableLiquidity()).to.equal(expected);
    });
  });

  describe("Pause / Unpause", function () {
    it("should pause and unpause", async function () {
      await vaultManager.pause();
      expect(await vaultManager.paused()).to.equal(true);

      await vaultManager.unpause();
      expect(await vaultManager.paused()).to.equal(false);
    });

    it("should reject fund when paused", async function () {
      await vaultManager.pause();
      await expect(vaultManager.fund(FUND_AMOUNT)).to.be.revertedWithCustomError(vaultManager, "EnforcedPause");
    });
  });
});
