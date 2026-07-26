import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts, ethers } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  // Get MockUSDC address from previous deployment
  const MockUSDC = await deployments.get("MockUSDC");
  console.log("MockUSDC address:", MockUSDC.address);

  // Deploy VaultManager
  console.log("========================================");
  console.log(`Deploying VaultManager on ${hre.network.name}...`);
  console.log("========================================");

  const vaultManager = await deploy("VaultManager", {
    contract: "VaultManager",
    args: [MockUSDC.address],
    from: deployer,
    log: true,
    autoMine: true,
  });

  // Deploy SavingCore
  console.log("========================================");
  console.log(`Deploying SavingCore on ${hre.network.name}...`);
  console.log("========================================");

  const savingCore = await deploy("SavingCore", {
    contract: "SavingCore",
    args: [MockUSDC.address, vaultManager.address, deployer],
    from: deployer,
    log: true,
    autoMine: true,
  });

  // Set SavingCore as authorized caller on VaultManager
  console.log("========================================");
  console.log("Linking VaultManager -> SavingCore...");
  console.log("========================================");

  const vm = await ethers.getContractAt("VaultManager", vaultManager.address);
  const tx = await vm.setSavingCore(savingCore.address);
  await tx.wait();
  console.log("VaultManager.setSavingCore(" + savingCore.address + ") ✓");

  console.log("========================================");
  console.log("All contracts deployed and linked!");
  console.log("MockUSDC:", MockUSDC.address);
  console.log("VaultManager:", vaultManager.address);
  console.log("SavingCore:", savingCore.address);
  console.log("========================================");
};

func.tags = ["VaultManager", "SavingCore"];
func.dependencies = ["MockUSDC"];
export default func;
