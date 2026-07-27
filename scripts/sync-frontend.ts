/**
 * Sync frontend contract addresses from Hardhat deployment artifacts
 *
 * After deploying locally:
 *   npx hardhat run --network hardhat scripts/sync-frontend.ts
 *   — or simply —
 *   npx hardhat run scripts/sync-frontend.ts
 *
 * This reads deployments/localhost/*.json (or deployments/hardhat/*.json)
 * and writes to frontend/src/config/local-addresses.json.
 */

import * as fs from "fs";
import * as path from "path";

const DEPLOY_DIR_LOCALHOST = path.join(__dirname, "..", "deployments", "localhost");
const DEPLOY_DIR_HARDHAT = path.join(__dirname, "..", "deployments", "hardhat");
const OUTPUT = path.join(__dirname, "..", "frontend", "src", "config", "local-addresses.json");

const CONTRACTS = ["MockUSDC", "VaultManager", "SavingCore"] as const;

async function main() {
  const addresses: Record<string, string> = {};

  const deployDir = fs.existsSync(path.join(DEPLOY_DIR_LOCALHOST, "MockUSDC.json"))
    ? DEPLOY_DIR_LOCALHOST
    : fs.existsSync(path.join(DEPLOY_DIR_HARDHAT, "MockUSDC.json"))
    ? DEPLOY_DIR_HARDHAT
    : null;

  if (!deployDir) {
    console.error("No deployment artifacts found.");
    console.error("Run 'npx hardhat deploy' first.");
    process.exit(1);
  }

  for (const name of CONTRACTS) {
    const filePath = path.join(deployDir, `${name}.json`);
    const artifact = JSON.parse(fs.readFileSync(filePath, "utf8"));
    addresses[name] = artifact.address;
    console.log(`${name}: ${artifact.address}`);
  }

  fs.mkdirSync(path.dirname(OUTPUT), { recursive: true });
  fs.writeFileSync(OUTPUT, JSON.stringify(addresses, null, 2) + "\n");
  console.log(`\nWrote ${OUTPUT}`);
  console.log("Restart frontend dev server to pick up new addresses.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
