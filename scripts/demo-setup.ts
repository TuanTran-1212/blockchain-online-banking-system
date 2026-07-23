import { ethers } from "hardhat";

const USDC_ADDR = "0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269";
const VAULT_ADDR = "0x29b7e818Eaa803111788eFE924ff3682093CA3a8";
const CORE_ADDR = "0x468864a15B76327f578d0dCb0E544D4C6A1aEC03";

const PLAN_TENOR = 180;        // days
const PLAN_APR = 375;          // 3.75%
const PLAN_MIN = ethers.parseUnits("100", 6);  // 100 USDC
const PLAN_PENALTY = 650;      // 6.50%
const FUND_AMOUNT = ethers.parseUnits("100000", 6); // 100K USDC

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Network:", (await ethers.provider.getNetwork()).name);

  const usdc = await ethers.getContractAt("MockUSDC", USDC_ADDR);
  const vm = await ethers.getContractAt("VaultManager", VAULT_ADDR);
  const core = await ethers.getContractAt("SavingCore", CORE_ADDR);

  // Step 1: Create plan if none exists
  console.log("\n--- Step 1: Create Plan ---");
  const planCount = Number(await core.planCount());
  if (planCount === 0) {
    console.log("No plans found. Creating plan...");
    const tx = await core.createPlan(PLAN_TENOR, PLAN_APR, PLAN_MIN, 0, PLAN_PENALTY);
    await tx.wait();
    console.log("Plan 0 created: 180d, 3.75% APR, min 100 USDC, penalty 6.50%");
  } else {
    console.log(`Already ${planCount} plan(s), skipping.`);
  }

  // Step 2: Check deployer USDC balance, mint if needed
  console.log("\n--- Step 2: Check USDC Balance ---");
  const deployerBal = await usdc.balanceOf(deployer.address);
  console.log("Deployer USDC:", ethers.formatUnits(deployerBal, 6), "USDC");

  if (deployerBal < FUND_AMOUNT) {
    const needed = FUND_AMOUNT - deployerBal;
    console.log(`Minting ${ethers.formatUnits(needed, 6)} USDC to deployer...`);
    const tx = await usdc.mint(deployer.address, needed);
    await tx.wait();
    console.log("Minted!");
  } else {
    console.log("Balance sufficient.");
  }

  // Step 3: Approve + Fund vault
  console.log("\n--- Step 3: Fund Vault ---");
  const vaultBal = await vm.vaultBalance();
  console.log("Current vault balance:", ethers.formatUnits(vaultBal, 6), "USDC");

  if (vaultBal < FUND_AMOUNT) {
    console.log("Approving USDC to VaultManager...");
    const approveTx = await usdc.approve(VAULT_ADDR, FUND_AMOUNT);
    await approveTx.wait();

    console.log("Funding vault...");
    const fundTx = await vm.fund(FUND_AMOUNT);
    await fundTx.wait();
    console.log("Vault funded!");
  } else {
    console.log("Vault already has enough funds, skipping.");
  }

  // Step 4: Print status
  console.log("\n--- Final Status ---");
  const finalVaultBal = await vm.vaultBalance();
  const totalDeposits = await vm.totalDeposits();
  const totalOwed = await vm.totalOwedInterest();
  const liquidity = await vm.getAvailableLiquidity();
  const finalDeployerBal = await usdc.balanceOf(deployer.address);
  const finalPlanCount = await core.planCount();

  console.log("Vault balance:    ", ethers.formatUnits(finalVaultBal, 6), "USDC");
  console.log("Total deposits:   ", ethers.formatUnits(totalDeposits, 6), "USDC");
  console.log("Owed interest:    ", ethers.formatUnits(totalOwed, 6), "USDC");
  console.log("Avail. liquidity: ", ethers.formatUnits(liquidity, 6), "USDC");
  console.log("Deployer USDC:    ", ethers.formatUnits(finalDeployerBal, 6), "USDC");
  console.log("Plans:            ", Number(finalPlanCount));

  for (let i = 0; i < Number(finalPlanCount); i++) {
    const p = await core.getPlan(i);
    console.log(`  Plan ${i}: ${p.tenorDays}d, ${p.aprBps}bps APR, min ${ethers.formatUnits(p.minDeposit, 6)} USDC, penalty ${p.earlyWithdrawPenaltyBps}bps`);
  }

  // Step 5: Print demo instructions
  console.log("\n========================================");
  console.log("  DEMO READY!");
  console.log("========================================");
  console.log("1. cd frontend && npm run dev");
  console.log("2. Open http://localhost:5173");
  console.log("3. Connect MetaMask → Sepolia network");
  console.log("4. Import deployer wallet or use another wallet");
  console.log("5. Mint test USDC for test wallet via MockUSDC.mint()");
  console.log("");
  console.log("Contracts (Sepolia):");
  console.log("  MockUSDC:   ", USDC_ADDR);
  console.log("  VaultManager:", VAULT_ADDR);
  console.log("  SavingCore:  ", CORE_ADDR);
  console.log("========================================");
}

main().catch(console.error);
