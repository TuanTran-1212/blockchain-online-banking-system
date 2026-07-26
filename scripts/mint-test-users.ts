/**
 * Mint USDC for Test Users — Sepolia
 * Usage:
 *   npx hardhat run --network sepolia scripts/mint-test-users.ts
 */

import { ethers } from "hardhat";
const USER_ADDRESSES = [
  "0x2E7809EFaF0b8d9f10D3d1f04dFbfaEe7CaC60F5",
  "0x95C8146bf5D8b189e39269172eB8938623a556cC",
];

const MINT_AMOUNT = ethers.parseUnits("10000", 6); // 10,000 USDC each

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);

  // Get MockUSDC from deployment
  const MockUSDC = await ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.attach("0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269");

  console.log("MockUSDC:", await mockUSDC.getAddress());
  console.log("========================================");

  for (const userAddr of USER_ADDRESSES) {
    if (userAddr.includes("YOUR_USER")) {
      console.log(`⚠️  Skipping placeholder address: ${userAddr}`);
      continue;
    }

    console.log(`Minting 10,000 USDC to ${userAddr}...`);
    const tx = await mockUSDC.mint(userAddr, MINT_AMOUNT);
    await tx.wait();
    console.log(`✅ Minted! TX: ${tx.hash}`);

    // Check balance
    const balance = await mockUSDC.balanceOf(userAddr);
    console.log(`   Balance: ${ethers.formatUnits(balance, 6)} USDC`);
  }

  console.log("========================================");
  console.log("Done! Users can now use the frontend.");
  console.log("Each user needs to approve SavingCore to spend USDC before opening a deposit.");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
