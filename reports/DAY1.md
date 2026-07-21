# 📋 Báo Cáo Ngày 1 — Setup Dự Án + MockUSDC Contract

## Thông Tin Sinh Viên
- **MSSV:** 2231200077
- **A (chữ số cuối):** 7 | **B (chữ số kế cuối):** 7

## Giá Trị Cá Nhân (Personal Variant)
| Thông số | Công thức | Giá trị |
|---|---|---|
| Grace period (tự gia hạn) | (A mod 3) + 2 | **3 ngày** |
| Default APR | 200 + A × 25 | **375 bps = 3.75%** |
| Phí rút sớm | 300 + B × 50 | **650 bps = 6.50%** |
| Default tenor | B=7 (lẻ) | **180 ngày** |

---

## Mục Tiêu Ngày 1
- [x] Tạo cấu trúc thư mục `project/`
- [x] Cài đặt Hardhat + OpenZeppelin dependencies
- [x] Viết MockUSDC contract (ERC20, 6 decimals)
- [x] Deploy script cho MockUSDC
- [x] Viết test cho MockUSDC (8 tests — all passing)
- [x] Deploy lên Sepolia testnet ✅

---

## Cấu Trúc Thư Mục

```
project/
├── .env                         # Private key + API keys (KHÔNG commit)
├── package.json                 # Dependencies
├── hardhat.config.ts            # Cấu hình Hardhat
├── tsconfig.json                # Cấu hình TypeScript
├── contracts/
│   └── MockUSDC.sol             # Smart contract ERC20
├── deploy/
│   └── 1-deploy.ts              # Script deploy
├── test/
│   └── MockUSDC.test.ts         # Test cases
└── reports/
    └── DAY1.md                  # Báo cáo này
```

---

## Giải Thích Chi Tiết

### 1. MockUSDC.sol — Smart Contract

**MockUSDC** là một token ERC20 mô phỏng đồng USDC thực tế.

```solidity
contract MockUSDC is ERC20, Ownable {
    // ERC20: Tiêu chuẩn token fungible (như Bitcoin, ETH)
    // Ownable: Chỉ chủ sở hữu mới có quyền quản lý

    constructor(uint256 initialMint) ERC20("MockUSDC", "mUSDC") Ownable(msg.sender) {
        // Khi deploy, mint số token ban đầu cho deployer
    }

    function decimals() public pure override returns (uint8) {
        return 6; // USDC thực tế dùng 6 decimals (không phải 18)
    }

    function mint(address to, uint256 amount) external onlyOwner {
        // Owner có thể mint token mới (dùng làm faucet test)
    }
}
```

**Tại sao 6 decimals?**
- USDC thực tế sử dụng 6 chữ số thập phân
- 1 USDC = 1.000.000 (10^6)单位
- ERC20 mặc định của OpenZeppelin là 18 decimals → cần override

### 2. hardhat.config.ts — Cấu Hình Hardhat

```typescript
solidity: {
    version: "0.8.28",
    settings: { evmVersion: "cancun" }  // Cần cho OpenZeppelin v5.6.0
},
networks: {
    hardhat: { saveDeployments: true },  // Lưu deployment info
    sepolia: {
        url: "https://ethereum-sepolia-rpc.publicnode.com",
        chainId: 11155111,
        accounts: [testnetPrivateKey]
    }
},
namedAccounts: { deployer: 0 }  // Account #0 = deployer
```

### 3. deploy/1-deploy.ts — Script Deploy

```typescript
// Sử dụng hardhat-deploy plugin
// Deploy MockUSDC với 1,000,000 mUSDC ban đầu
const initialMint = 1_000_000n * 10n ** 6n; // 1M × 10^6

await deploy("MockUSDC", {
    args: [initialMint],   // Constructor argument
    from: deployer,         // Account deploy
    log: true,              // In log
    autoMine: true          // Auto-mine trên local
});
```

### 4. Test Cases (8 tests)

```
MockUSDC
  Deployment
    ✔ Name = "MockUSDC"
    ✔ Symbol = "mUSDC"
    ✔ Decimals = 6
    ✔ Initial mint thuộc về deployer
    ✔ Deployer là owner
  Minting
    ✔ Owner có thể mint token
    ✔ Non-owner không thể mint (revert)
    ✔ TotalSupply tăng sau mint
  Transfers
    ✔ Transfer giữa các account
```

---

## Kết Quả Deploy Sepolia

| Thông số | Giá trị |
|---|---|
| Network | Sepolia |
| Contract Address | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` |
| Deploy Tx | `0x7e64c9e84d8aad71fdc9702f070218265f36410519249a704cfaa8f8607e170d` |
| Gas Used | 1,148,435 |
| Deployer | `0x6F443186763CC24B5774EC32F8fDbE751E926492` |

---

## Lệnh Hữu Ích

```bash
# Compile contracts
npx hardhat compile

# Run tests
npx hardhat test

# Deploy local
npx hardhat deploy

# Deploy Sepolia
npx hardhat deploy --network sepolia --tags MockUSDC

# Coverage
npx hardhat coverage
```

---

## Kế Hoạch Ngày 2 (Preview)

**VaultManager.sol** — Contract quản lý quỹ thanh khoản:
- Vault: Nơi lưu trữ USDC làm thanh khoản cho hệ thống
- Fund: Owner nạp tiền vào vault
- Withdraw: Owner rút tiền từ vault
- Pause/Unpause: Tạm dừng/mở lại hệ thống
- Solvency check: Kiểm tra vault đủ tiền trả cho người dùng

---

## Kết Luận Ngày 1

Ngày 1 đã hoàn thành đúng kế hoạch:
- Dự án được setup hoàn chỉnh với Hardhat + TypeScript
- MockUSDC contract hoạt động đúng (ERC20, 6 decimals, mint)
- 8/8 tests passing
- Đã deploy thành công lên Sepolia testnet
