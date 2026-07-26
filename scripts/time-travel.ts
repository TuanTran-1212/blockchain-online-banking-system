/**
 * Time Travel Helper — For Hardhat Local Network Only
 *
 * Usage:
 *   npx hardhat run scripts/time-travel.ts          # Skip 1 day
 *   npx hardhat run scripts/time-travel.ts -- 180   # Skip 180 days (to maturity)
 *   npx hardhat run scripts/time-travel.ts -- 183   # Skip 183 days (past grace period)
 *
 * For Sepolia/testnet: time cannot be manipulated — contracts use block.timestamp.
 * This script only works on the local Hardhat network.
 *
 * Console alternative (in npx hardhat console):
 *   await network.provider.send("evm_increaseTime", [86400 * 180])  // +180 days
 *   await network.provider.send("evm_mine")                         // Mine block
 */

import { ethers, network } from "hardhat";

async function main() {
  if (network.name !== "hardhat") {
    console.error("❌ Time travel only works on Hardhat local network!");
    console.error("   Current network:", network.name);
    process.exit(1);
  }

  const days = parseInt(process.argv[process.argv.length - 1]) || 1;
  const seconds = days * 86400;

  console.log(`⏱️  Skipping ${days} day(s) (${seconds} seconds)...`);

  await network.provider.send("evm_increaseTime", [seconds]);
  await network.provider.send("evm_mine");

  const block = await ethers.provider.getBlock("latest");
  const date = new Date(block!.timestamp * 1000);
  console.log(`✅ New block time: ${date.toISOString()} (timestamp: ${block!.timestamp})`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
