import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const usdcAddr = "0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269";
  const vmAddr = "0x29b7e818Eaa803111788eFE924ff3682093CA3a8";

  const usdc = await ethers.getContractAt("MockUSDC", usdcAddr);
  const vm = await ethers.getContractAt("VaultManager", vmAddr);

  const fundAmount = ethers.parseUnits("100000", 6); // 100K USDC
  console.log("Approving", ethers.formatUnits(fundAmount, 6), "USDC to VaultManager...");
  await usdc.approve(vmAddr, fundAmount);

  console.log("Funding vault...");
  await vm.fund(fundAmount);

  const vaultBal = await vm.vaultBalance();
  console.log("Vault balance now:", ethers.formatUnits(vaultBal, 6), "USDC");
  console.log("Done!");
}

main().catch(console.error);
