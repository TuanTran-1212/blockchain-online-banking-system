import { ethers } from "hardhat";
async function main() {
  const core = await ethers.getContractAt("SavingCore", "0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf");
  const owner = await core.owner();
  const paused = await core.paused();
  console.log("Owner:", owner);
  console.log("Paused:", paused);
  console.log("Plan count:", (await core.planCount()).toString());
}
main().catch((e) => { console.error(e.message || e); process.exitCode = 1; });
