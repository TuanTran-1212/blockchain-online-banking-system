/**
 * Local Demo Setup — One script to rule them all
 *
 * Reads deployed contract addresses from deployments/localhost/*.json,
 * mints USDC, funds vault, creates plan, syncs frontend addresses.
 *
 * Usage:
 *   npx hardhat run scripts/demo-setup-local.ts
 *   — or via package.json —
 *   npm run demo:local-setup
 *
 * Prerequisites: contracts must be deployed first (npm run demo:local)
 */

import { ethers } from "hardhat";
import * as fs from "fs";
import * as path from "path";

const DEPLOY_DIR_LOCALHOST = path.join(__dirname, "..", "deployments", "localhost");
const DEPLOY_DIR_HARDHAT = path.join(__dirname, "..", "deployments", "hardhat");
const FRONTEND_OUTPUT = path.join(__dirname, "..", "frontend", "src", "config", "local-addresses.json");

const PLAN_TENOR = 180;         // days
const PLAN_APR = 375;           // 3.75%
const PLAN_MIN = ethers.parseUnits("100", 6);   // 100 USDC
const PLAN_MAX = 0;             // 0 = unlimited
const PLAN_PENALTY = 650;       // 6.50%
const FUND_AMOUNT = ethers.parseUnits("100000", 6); // 100K USDC
const USER_MINT = ethers.parseUnits("100000", 6);    // 100K USDC each

async function main() {
  const signers = await ethers.getSigners();
  const deployer = signers[0];
  const user1 = signers[1];
  const user2 = signers[2];

  console.log("========================================");
  console.log("  LOCAL DEMO SETUP");
  console.log("========================================");
  console.log("");
  console.log("Accounts:");
  console.log(`  Admin:    ${deployer.address}`);
  console.log(`  User 1:   ${user1.address}`);
  console.log(`  User 2:   ${user2.address}`);
  console.log("");

  // --- Step 1: Read deployed addresses ---
  console.log("--- Step 1: Read Deployed Contracts ---");
  const contracts = ["MockUSDC", "VaultManager", "SavingCore"] as const;
  const addresses: Record<string, string> = {};

  // Check both possible deployment directories
  const deployDir = fs.existsSync(path.join(DEPLOY_DIR_LOCALHOST, "MockUSDC.json"))
    ? DEPLOY_DIR_LOCALHOST
    : fs.existsSync(path.join(DEPLOY_DIR_HARDHAT, "MockUSDC.json"))
    ? DEPLOY_DIR_HARDHAT
    : null;

  if (!deployDir) {
    console.error("No deployment artifacts found.");
    console.error("Run 'npx hardhat deploy --network localhost' first.");
    process.exit(1);
  }

  for (const name of contracts) {
    const filePath = path.join(deployDir, `${name}.json`);
    if (!fs.existsSync(filePath)) {
      console.error(`Missing deployment artifact: ${filePath}`);
      process.exit(1);
    }
    const artifact = JSON.parse(fs.readFileSync(filePath, "utf8"));
    addresses[name] = artifact.address;
    console.log(`  ${name}: ${artifact.address}`);
  }
  console.log("");

  const usdc = await ethers.getContractAt("MockUSDC", addresses.MockUSDC);
  const vm = await ethers.getContractAt("VaultManager", addresses.VaultManager);
  const core = await ethers.getContractAt("SavingCore", addresses.SavingCore);

  // --- Step 2: Mint USDC to test users ---
  console.log("--- Step 2: Mint USDC to Test Users ---");
  for (const user of [user1, user2]) {
    const bal = await usdc.balanceOf(user.address);
    if (bal < USER_MINT) {
      const tx = await usdc.mint(user.address, USER_MINT);
      await tx.wait();
      console.log(`  Minted 100K USDC → ${user.address}`);
    } else {
      console.log(`  ${user.address} already has ${ethers.formatUnits(bal, 6)} USDC`);
    }
  }
  console.log("");

  // --- Step 3: Fund vault ---
  console.log("--- Step 3: Fund Vault ---");
  const vaultBal = await vm.vaultBalance();
  console.log(`  Current vault balance: ${ethers.formatUnits(vaultBal, 6)} USDC`);

  if (vaultBal < FUND_AMOUNT) {
    console.log("  Approving USDC...");
    const approveTx = await usdc.approve(vm.target, FUND_AMOUNT);
    await approveTx.wait();

    console.log("  Funding vault...");
    const fundTx = await vm.fund(FUND_AMOUNT);
    await fundTx.wait();
    console.log("  Vault funded with 100K USDC!");
  } else {
    console.log("  Vault already funded.");
  }
  console.log("");

  // --- Step 4: Create plan ---
  console.log("--- Step 4: Create Deposit Plan ---");
  const planCount = Number(await core.planCount());
  if (planCount === 0) {
    const tx = await core.createPlan(PLAN_TENOR, PLAN_APR, PLAN_MIN, PLAN_MAX, PLAN_PENALTY);
    await tx.wait();
    console.log(`  Plan 0 created: ${PLAN_TENOR}d, ${(PLAN_APR/100).toFixed(2)}% APR, min ${ethers.formatUnits(PLAN_MIN, 6)} USDC, penalty ${(PLAN_PENALTY/100).toFixed(2)}%`);
  } else {
    console.log(`  Already ${planCount} plan(s), skipping.`);
  }
  console.log("");

  // --- Step 5: Sync frontend ---
  console.log("--- Step 5: Sync Frontend ---");
  fs.mkdirSync(path.dirname(FRONTEND_OUTPUT), { recursive: true });
  fs.writeFileSync(FRONTEND_OUTPUT, JSON.stringify(addresses, null, 2) + "\n");
  console.log(`  Wrote ${FRONTEND_OUTPUT}`);
  console.log("");

  // --- Step 6: Print status ---
  console.log("--- Final Status ---");
  const finalVaultBal = await vm.vaultBalance();
  const totalDeposits = await vm.totalDeposits();
  const totalOwed = await vm.totalOwedInterest();
  const liquidity = await vm.getAvailableLiquidity();
  const finalPlanCount = Number(await core.planCount());

  console.log(`  Vault balance:     ${ethers.formatUnits(finalVaultBal, 6)} USDC`);
  console.log(`  Total deposits:    ${ethers.formatUnits(totalDeposits, 6)} USDC`);
  console.log(`  Owed interest:     ${ethers.formatUnits(totalOwed, 6)} USDC`);
  console.log(`  Avail. liquidity:  ${ethers.formatUnits(liquidity, 6)} USDC`);
  console.log(`  Plans:             ${finalPlanCount}`);

  for (let i = 0; i < finalPlanCount; i++) {
    const p = await core.getPlan(i);
    console.log(`    Plan ${i}: ${p.tenorDays}d, ${Number(p.aprBps)}bps APR, min ${ethers.formatUnits(p.minDeposit, 6)} USDC, penalty ${Number(p.earlyWithdrawPenaltyBps)}bps`);
  }
  console.log("");

  // --- Step 7: Print private keys ---
  const PRIVATE_KEYS = [
    "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80",
    "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
    "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  ];
  console.log("--- MetaMask Import Keys ---");
  const accounts = [
    { label: "Admin (Account #0)", signer: deployer, pk: PRIVATE_KEYS[0] },
    { label: "User 1 (Account #1)", signer: user1, pk: PRIVATE_KEYS[1] },
    { label: "User 2 (Account #2)", signer: user2, pk: PRIVATE_KEYS[2] },
  ];
  for (const acct of accounts) {
    console.log(`  ${acct.label}:`);
    console.log(`    Address: ${acct.signer.address}`);
    console.log(`    Private Key: ${acct.pk}`);
    console.log("");
  }

  // --- Done ---
  console.log("========================================");
  console.log("  DEMO READY!");
  console.log("========================================");
  console.log("");
  console.log("Next steps:");
  console.log("  1. cd frontend && npm run dev");
  console.log("  2. Open http://localhost:5173");
  console.log("  3. MetaMask → Add network 'Hardhat Localhost'");
  console.log("     RPC: http://127.0.0.1:8545 | Chain ID: 31337");
  console.log("  4. Import admin/user accounts using private keys above");
  console.log("  5. Connect wallet → Start demo!");
  console.log("");
  console.log("Time travel (in separate terminal):");
  console.log("  DAYS=180 npx hardhat run --network localhost scripts/time-travel.ts   # Skip to maturity");
  console.log("  DAYS=183 npx hardhat run --network localhost scripts/time-travel.ts   # Past grace period");
  console.log("========================================");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
