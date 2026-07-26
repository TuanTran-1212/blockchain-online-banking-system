const { ethers } = require("hardhat");

async function main() {
  const core = await ethers.getContractAt("SavingCore", "0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf");
  const vm = await ethers.getContractAt("VaultManager", "0x1521290278AAa3f9E8eC25866A1DC63B6d48Aa00");

  const owner = await core.owner();
  console.log("Owner:", owner);

  const count = await core.planCount();
  console.log("Plan count:", count.toString());
  for (let i = 0; i < Number(count); i++) {
    const p = await core.getPlan(i);
    console.log(`Plan ${i}:`, JSON.stringify({
      tenorDays: Number(p.tenorDays),
      aprBps: Number(p.aprBps),
      minDeposit: ethers.formatUnits(p.minDeposit, 6),
      maxDeposit: p.maxDeposit.toString(),
      penaltyBps: Number(p.earlyWithdrawPenaltyBps),
      enabled: p.enabled,
    }));
  }

  const bal = await vm.vaultBalance();
  console.log("Vault balance:", ethers.formatUnits(bal, 6), "USDC");

  const totalDeposits = await vm.totalDeposits();
  console.log("Total deposits:", ethers.formatUnits(totalDeposits, 6), "USDC");
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; });
