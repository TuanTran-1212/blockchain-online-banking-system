/**
 * Set NFT metadata (tokenURI) for all minted SavingCertificates — Sepolia
 * Usage:
 *   npx hardhat run --network sepolia scripts/set-token-uri.ts
 */

import { ethers } from "hardhat";

const SAVING_CORE = "0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf";

function buildMetadata(name: string, depositId: number, planId: number, principal: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#1e40af"/>
      <stop offset="100%" style="stop-color:#3b82f6"/>
    </linearGradient>
  </defs>
  <rect width="400" height="500" rx="20" fill="url(#bg)"/>
  <rect x="20" y="20" width="360" height="460" rx="12" fill="none" stroke="#fbbf24" stroke-width="2" stroke-dasharray="8,4"/>
  <text x="200" y="70" text-anchor="middle" fill="#fbbf24" font-family="serif" font-size="14" letter-spacing="4">CERTIFICATE</text>
  <text x="200" y="110" text-anchor="middle" fill="white" font-family="serif" font-size="22" font-weight="bold">Saving Certificate</text>
  <line x1="80" y1="130" x2="320" y2="130" stroke="#fbbf24" stroke-width="1"/>
  <text x="200" y="180" text-anchor="middle" fill="#93c5fd" font-size="13">Holder</text>
  <text x="200" y="205" text-anchor="middle" fill="white" font-size="14" font-weight="bold">${name}</text>
  <text x="200" y="260" text-anchor="middle" fill="#93c5fd" font-size="13">Deposit #${depositId}</text>
  <text x="200" y="295" text-anchor="middle" fill="white" font-size="20" font-weight="bold">${principal} USDC</text>
  <text x="200" y="340" text-anchor="middle" fill="#93c5fd" font-size="13">Plan #${planId}</text>
  <text x="200" y="375" text-anchor="middle" fill="white" font-size="14">Soulbound NFT</text>
  <text x="200" y="450" text-anchor="middle" fill="#fbbf24" font-family="serif" font-size="10" letter-spacing="2">BLOCKCHAIN ONLINE BANKING</text>
</svg>`;

  const metadata = {
    name,
    description: `Saving Certificate #${depositId} — Plan #${planId}, Principal: ${principal} USDC. Soulbound NFT on Sepolia testnet.`,
    image: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    attributes: [
      { trait_type: "Deposit ID", value: depositId },
      { trait_type: "Plan ID", value: planId },
      { trait_type: "Principal (USDC)", value: principal },
    ],
  };

  return `data:application/json;base64,${Buffer.from(JSON.stringify(metadata)).toString("base64")}`;
}

async function main() {
  const [owner] = await ethers.getSigners();
  console.log("Owner:", owner.address);

  const core = await ethers.getContractAt("SavingCore", SAVING_CORE);
  const depositCount = await core.depositCount();
  console.log("Total deposits:", depositCount.toString());
  console.log("========================================");

  for (let i = 0; i < Number(depositCount); i++) {
    try {
      const owner = await core.ownerOf(i);
      const existingURI = await core.tokenURI(i);
      if (existingURI && existingURI.length > 10) {
        console.log(`#${i}: Already has URI, skipping`);
        continue;
      }

      const dep = await core.getDeposit(i);
      const holder = dep.owner;
      const planId = Number(dep.planId);
      const principal = ethers.formatUnits(dep.principal, 6);
      const shortAddr = `${holder.slice(0, 6)}...${holder.slice(-4)}`;
      const name = `Saving Certificate #${i} (${shortAddr})`;

      const dataURI = buildMetadata(name, i, planId, principal);

      console.log(`#${i}: Setting URI for ${shortAddr}, Plan #${planId}, ${principal} USDC...`);
      const tx = await core.setTokenURI(i, dataURI);
      await tx.wait();
      console.log(`#${i}: Done!`);
    } catch (err: any) {
      if (err.message?.includes("Token does not exist") || err.message?.includes("ERC721NonexistentToken")) {
        console.log(`#${i}: NFT burned (already withdrawn/renewed), skipping`);
      } else {
        console.error(`#${i}: Failed — ${err.reason || err.message}`);
      }
    }
  }

  console.log("========================================");
  console.log("All done!");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
