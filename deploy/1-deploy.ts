import { HardhatRuntimeEnvironment } from "hardhat/types";
import { DeployFunction } from "hardhat-deploy/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployments, getNamedAccounts } = hre;
  const { deploy } = deployments;
  const { deployer } = await getNamedAccounts();

  console.log("========================================");
  console.log(`Deploying MockUSDC on ${hre.network.name}...`);
  console.log("========================================");

  // Mint 1,000,000 mUSDC to deployer on deployment (1M × 10^6 = 1e12)
  const initialMint = 1_000_000n * 10n ** 6n;

  await deploy("MockUSDC", {
    contract: "MockUSDC",
    args: [initialMint],
    from: deployer,
    log: true,
    autoMine: true,
  });
};

func.tags = ["MockUSDC"];
export default func;
