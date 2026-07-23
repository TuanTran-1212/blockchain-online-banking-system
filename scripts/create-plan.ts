import { ethers } from "hardhat";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  const coreAddr = "0x468864a15B76327f578d0dCb0E544D4C6A1aEC03";
  const core = await ethers.getContractAt("SavingCore", coreAddr);
  console.log("SavingCore:", coreAddr);

  const existingCount = await core.planCount();
  console.log("Existing plans:", Number(existingCount));

  if (Number(existingCount) === 0) {
    console.log("Creating Plan 0: 180 days, 3.75% APR, min 100 USDC, penalty 6.50%...");
    const tx0 = await core.createPlan(
      180,        // tenorDays
      375,        // aprBps = 3.75%
      ethers.parseUnits("100", 6), // minDeposit = 100 USDC
      0,          // maxDeposit = unlimited
      650         // earlyWithdrawPenaltyBps = 6.50%
    );
    await tx0.wait();
    console.log("Plan 0 created!");
  } else {
    console.log("Plans already exist, skipping creation.");
  }

  // Print all plans
  const count = await core.planCount();
  for (let i = 0; i < Number(count); i++) {
    const p = await core.getPlan(i);
    console.log(`Plan ${i}: tenor=${p.tenorDays}d, apr=${p.aprBps}bps, min=${ethers.formatUnits(p.minDeposit, 6)} USDC, penalty=${p.earlyWithdrawPenaltyBps}bps, enabled=${p.enabled}`);
  }
}

main().catch(console.error);
