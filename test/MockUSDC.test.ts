import { expect } from "chai";
import { ethers } from "hardhat";

describe("MockUSDC", function () {
  let mockUSDC: any;
  let owner: any;
  let addr1: any;
  let addr2: any;

  const INITIAL_MINT = ethers.parseUnits("1000000", 6); // 1M mUSDC

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy(INITIAL_MINT);
    await mockUSDC.waitForDeployment();
  });

  describe("Deployment", function () {
    it("should set correct name and symbol", async function () {
      expect(await mockUSDC.name()).to.equal("MockUSDC");
      expect(await mockUSDC.symbol()).to.equal("mUSDC");
    });

    it("should return 6 decimals", async function () {
      expect(await mockUSDC.decimals()).to.equal(6);
    });

    it("should mint initial supply to deployer", async function () {
      const balance = await mockUSDC.balanceOf(owner.address);
      expect(balance).to.equal(INITIAL_MINT);
    });
  });

  describe("Minting", function () {
    it("should allow anyone to mint tokens", async function () {
      const mintAmount = ethers.parseUnits("1000", 6);
      await mockUSDC.connect(addr1).mint(addr2.address, mintAmount);
      expect(await mockUSDC.balanceOf(addr2.address)).to.equal(mintAmount);
    });

    it("should update totalSupply after minting", async function () {
      const mintAmount = ethers.parseUnits("50000", 6);
      const supplyBefore = await mockUSDC.totalSupply();
      await mockUSDC.mint(addr1.address, mintAmount);
      const supplyAfter = await mockUSDC.totalSupply();
      expect(supplyAfter - supplyBefore).to.equal(mintAmount);
    });
  });

  describe("Transfers", function () {
    it("should transfer tokens between accounts", async function () {
      const amount = ethers.parseUnits("100", 6);
      await mockUSDC.transfer(addr1.address, amount);
      expect(await mockUSDC.balanceOf(addr1.address)).to.equal(amount);
    });
  });
});
