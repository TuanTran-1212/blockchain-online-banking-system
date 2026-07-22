# AGENTS.md

## Project

Hardhat Solidity project: blockchain online banking system with term deposits and ERC721 NFT certificates. Three contracts:

- **MockUSDC** — ERC20, 6 decimals, owner-mintable (test USDC)
- **VaultManager** — liquidity pool; owner funds it, SavingCore calls into it
- **SavingCore** — business logic + ERC721 NFT; inherits ERC721, Ownable, Pausable, ReentrancyGuard

Solidity 0.8.28, EVM target `cancun`. OpenZeppelin 5.1.

## Commands

```bash
npm run compile              # hardhat compile → generates typechain-types/
npm test                     # hardhat test (Mocha + Chai)
npm run coverage             # solidity-coverage
npm run deploy               # deploy to hardhat (default)
npm run deploy:sepolia       # deploy to Sepolia (needs TESTNET_PRIVATE_KEY in .env)
npm run run:sepolia          # hardhat run --network sepolia
```

No lint, format, or typecheck scripts are defined.

## Deploy Order

Uses `hardhat-deploy` (not Ignition). Deploy scripts in `deploy/` are numbered and ordered:
1. `1-deploy.ts` — MockUSDC (tag: `MockUSDC`)
2. `2-deploy.ts` — VaultManager + SavingCore (tags: `VaultManager`, `SavingCore`; depends on `MockUSDC`)

VaultManager and SavingCore are deployed in the same script. SavingCore constructor takes `(usdcAddress, vaultManagerAddress, feeReceiver)`.

## Testing

- Framework: Hardhat test runner (Mocha) + `@nomicfoundation/hardhat-chai-matchers`
- Tests deploy all contracts manually in `beforeEach` (do not rely on hardhat-deploy fixtures)
- Time manipulation via `@nomicfoundation/hardhat-network-helpers` (`time.increase`)
- USDC amounts use 6 decimals: `ethers.parseUnits("10000", 6)`
- Revert assertions: `revertedWith("string")` for custom errors, `revertedWithCustomError(contract, "ErrorName")` for OZ errors
- Tests assume Hardhat auto-mining (default)
- `vaultManager.fund()` requires prior ERC20 `approve()` — tests must call `mockUSDC.approve(vaultManager, amount)` before `fund()`

## Personal Variant Constants

Hardcoded in `SavingCore.sol` (not configurable via constructor):
- Grace period: 3 days (`(A mod 3) + 2` where A=7)
- Default APR: 375 bps (3.75%)
- Early withdrawal penalty: 650 bps (6.50%)
- Default tenor: 180 days

Interest formula: `interest = (principal * aprBps * tenorSeconds) / (365 days * 10000)`

## Environment

- `.env` loaded via dotenv; needs `TESTNET_PRIVATE_KEY` for Sepolia deployment
- `deployments/hardhat/` is gitignored (local deploy artifacts)
- `typechain-types/` is generated, gitignored — regenerate with `compile`

## Sepolia Deployments

| Contract | Address |
|---|---|
| MockUSDC | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` |
| VaultManager | `0xE72739658F52527bF28507Adb0B6C4fdBD32626b` |
| SavingCore | `0x25FbbB97ccaFe4E4BE1dCE89988c170E721A9947` |

## Frontend

Separate package in `frontend/` — React 19 + Vite 8 + TypeScript + ethers.js. Has its own `package.json` and `node_modules/`.

```bash
cd frontend && npm run dev      # Vite dev server
cd frontend && npm run build    # tsc + vite build
cd frontend && npm run lint     # oxlint
```

## Known Limitations

- No burn on MockUSDC
- No CI/CD pipelines
