import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const vmAddr = "0x29b7e818Eaa803111788eFE924ff3682093CA3a8";
  const usdcAddr = "0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269";
  const coreAddr = "0x468864a15B76327f578d0dCb0E544D4C6A1aEC03";

  const vm = await ethers.getContractAt("VaultManager", vmAddr);
  const bal = await vm.vaultBalance();
  const td = await vm.totalDeposits();
  const toi = await vm.totalOwedInterest();
  const liq = await vm.getAvailableLiquidity();
  const solv = await vm.isSolvent();

  console.log("\n=== VaultManager ===");
  console.log("Vault balance:", ethers.formatUnits(bal, 6), "USDC");
  console.log("Total deposits:", ethers.formatUnits(td, 6), "USDC");
  console.log("Total owed interest:", ethers.formatUnits(toi, 6), "USDC");
  console.log("Available liquidity:", ethers.formatUnits(liq, 6), "USDC");
  console.log("Solvent:", solv);

  const core = await ethers.getContractAt("SavingCore", coreAddr);
  const planCount = await core.planCount();
  const depositCount = await core.depositCount();

  console.log("\n=== SavingCore ===");
  console.log("Plan count:", Number(planCount));
  console.log("Deposit count:", Number(depositCount));

  for (let i = 0; i < Number(planCount); i++) {
    const p = await core.getPlan(i);
    console.log(`  Plan ${i}: tenor=${p.tenorDays}d, apr=${p.aprBps}bps, min=${ethers.formatUnits(p.minDeposit, 6)} USDC, penalty=${p.earlyWithdrawPenaltyBps}bps, enabled=${p.enabled}`);
  }

  const usdc = await ethers.getContractAt("MockUSDC", usdcAddr);
  const dbal = await usdc.balanceOf(deployer.address);
  console.log("\n=== Deployer ===");
  console.log("USDC balance:", ethers.formatUnits(dbal, 6), "USDC");
}

main().catch(console.error);
