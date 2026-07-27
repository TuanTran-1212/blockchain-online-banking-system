# AGENTS.md

## Project

Hardhat Solidity project: blockchain online banking system with term deposits and ERC721 NFT certificates. Three contracts:

- **MockUSDC** — ERC20, 6 decimals, freely mintable by anyone (test USDC, no access control)
- **VaultManager** — liquidity pool; owner funds it, SavingCore calls into it
- **SavingCore** — business logic + ERC721 NFT; inherits ERC721, Ownable, Pausable, ReentrancyGuard

Solidity 0.8.28, EVM target `cancun`. OpenZeppelin 5.1.

## Commands

```bash
npm install --legacy-peer-deps   # root — peer deps conflict without this flag
npm run compile              # hardhat compile → generates typechain-types/
npm test                     # hardhat test (Mocha + Chai)
npm run coverage             # solidity-coverage
npm run deploy               # deploy to hardhat (default network)
npm run deploy:sepolia       # deploy to Sepolia (needs TESTNET_PRIVATE_KEY in .env)
npm run run:sepolia          # hardhat run --network sepolia
npm run demo:setup           # Sepolia: create plan + fund vault (scripts/demo-setup.ts)
npm run demo:check           # Sepolia: check vault/deployer status
```

No lint, format, or typecheck scripts are defined for the root package.

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
| MockUSDC | `0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269` |
| VaultManager | `0x1521290278AAa3f9E8eC25866A1DC63B6d48Aa00` |
| SavingCore | `0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf` |

## Sepolia Test Accounts

| Role | Address | Source |
|---|---|---|
| Admin/Deployer | `0x6F443186763CC24B5774EC32F8fDbE751E926492` | `.env` TESTNET_PRIVATE_KEY |
| Test User 1 | `0x2E7809EFaF0b8d9f10D3d1f04dFbfaEe7CaC60F5` | MetaMask (imported) |
| Test User 2 | `0x95C8146bf5D8b189e39269172eB8938623a556cC` | MetaMask (imported) |

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

## Mentor Feedback

See `answer.md` for Q&A responses to mentor evaluation (design decisions, spec compliance, code quality).
