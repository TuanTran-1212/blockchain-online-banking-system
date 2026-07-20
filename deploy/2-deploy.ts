import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
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

  console.log("========================================");
  console.log("All contracts deployed!");
  console.log("MockUSDC:", MockUSDC.address);
  console.log("VaultManager:", vaultManager.address);
  console.log("SavingCore:", savingCore.address);
  console.log("========================================");
};

func.tags = ["VaultManager", "SavingCore"];
func.dependencies = ["MockUSDC"];
export default func;
