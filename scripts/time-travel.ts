/**
 * Time Travel Helper — For Hardhat Local Network Only
 *
 * Usage:
 *   npx hardhat run --network localhost scripts/time-travel.ts       # Skip 1 day
 *   DAYS=180 npx hardhat run --network localhost scripts/time-travel.ts   # Skip 180 days (to maturity)
 *   DAYS=183 npx hardhat run --network localhost scripts/time-travel.ts   # Skip 183 days (past grace period)
 *
 * For Sepolia/testnet: time cannot be manipulated — contracts use block.timestamp.
 * This script only works on the local Hardhat network.
 */

import { ethers, network } from "hardhat";

async function main() {
  if (network.name !== "hardhat" && network.name !== "localhost") {
    console.error("Time travel only works on Hardhat local network!");
    console.error("   Current network:", network.name);
    process.exit(1);
  }

  const lifecycleEvent = process.env.npm_lifecycle_event || "";
  let days = parseInt(process.env.DAYS || "1") || 1;
  if (lifecycleEvent === "time-travel:180") days = 180;
  else if (lifecycleEvent === "time-travel:183") days = 183;
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
