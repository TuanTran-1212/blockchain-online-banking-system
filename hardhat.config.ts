import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "hardhat-deploy";
import "hardhat-deploy-ethers";
import * as dotenv from "dotenv";

dotenv.config();

const { TESTNET_PRIVATE_KEY: testnetPrivateKey } = process.env;

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.28",
    settings: {
      evmVersion: "cancun",
    },
  },
  networks: {
    hardhat: {
      saveDeployments: true,
    },
    sepolia: {
      url: "https://ethereum-sepolia-rpc.publicnode.com",
      chainId: 11155111,
      accounts: [testnetPrivateKey].filter(Boolean),
    },
  },
  namedAccounts: {
    deployer: 0,
  },
};

export default config;
