# 📋 Báo Cáo Ngày 2 — VaultManager + SavingCore

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

## Mục Tiêu Ngày 2
- [x] Viết VaultManager.sol (quản lý quỹ thanh khoản)
- [x] Viết SavingCore.sol (logic nghiệp vụ + ERC721 NFT)
- [x] Deploy script cho cả 2 contract
- [x] Test cases cho VaultManager (14 tests) và SavingCore (27 tests)
- [x] Deploy lên Sepolia testnet ✅
- [x] Tạo báo cáo DAY2.md

---

## Kết Quả Deploy Sepolia

| Contract | Address | Deploy Tx | Gas |
|---|---|---|---|
| MockUSDC | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` | `0x7e64c9e8...` | 1,148,435 |
| VaultManager | `0xE72739658F52527bF28507Adb0B6C4fdBD32626b` | `0xc6178a4a...` | 1,336,835 |
| SavingCore | `0x25FbbB97ccaFe4E4BE1dCE89988c170E721A9947` | `0x81bc9aee...` | 5,326,138 |

---

## Kết Quả Tests
```
41 passing (2s)
```

| Contract | Tests | Status |
|---|---|---|
| MockUSDC | 8 | ✅ |
| VaultManager | 14 | ✅ |
| SavingCore | 27 | ✅ |
| **Tổng** | **41** | **✅** |

---

## Giải Thích Chi Tiết

### 1. Kiến Trúc Hệ Thanh

```
User (ERC20 approval) → SavingCore.openDeposit() → VaultManager.depositToVault()
                                                            ↓
                                                    USDC held in VaultManager
                                                            ↓
User (withdraw)     ← VaultManager.withdrawFromVault()  ← SavingCore.withdrawAtMaturity()
                             + VaultManager.withdrawInterest()
```

**Tại sao tách VaultManager và SavingCore?**
- **VaultManager**: Chỉ giữ tiền + quản lý thanh khoản. Đơn giản, ít bug.
- **SavingCore**: Chỉ logic nghiệp vụ (plans, deposits, NFTs, interest). Không giữ tiền trực tiếp.
- **Tách biệt**: Giảm thiểu rủi ro hack, dễ audit hơn.

### 2. VaultManager.sol — Chi Tiết

```solidity
contract VaultManager is Ownable, Pausable, ReentrancyGuard {
    IERC20 public immutable usdc;
    uint256 public totalDeposits; // Tổng tiền người dùng đã gửi

    // Owner quản lý thanh khoản
    function fund(uint256 amount) external onlyOwner;      // Nạp tiền vào vault
    function withdraw(uint256 amount) external onlyOwner;  // Rút tiền từ vault

    // SavingCore gọi
    function depositToVault(uint256 amount) external;      // Ghi nhận deposit
    function withdrawFromVault(address to, uint256 amount) external; // Rút principal
    function withdrawInterest(address to, uint256 amount) external;  // Rút lãi

    // View
    function vaultBalance() external view;     // Số dư USDC thực tế
    function isSolvent() external view;        // Vault có đủ tiền?
    function getAvailableLiquidity() external view; // Tiền thừa = balance - totalDeposits
}
```

**ReentrancyGuard**: Ngăn tấn công reentrancy khi transfer USDC.
**Pausable**: Owner có thể dừng hệ thống khẩn cấp.

### 3. SavingCore.sol — Chi Tiết

#### Structs
```solidity
struct Plan {
    uint256 tenorDays;                    // Kỳ hạn (ngày)
    uint256 aprBps;                       // Lãi suất (basis points)
    uint256 minDeposit;                   // Số tiền tối thiểu
    uint256 maxDeposit;                   // Số tiền tối đa (0 = không giới hạn)
    uint256 earlyWithdrawPenaltyBps;      // Phí rút sớm
    bool enabled;                         // Plan có hoạt động không
}

struct Deposit {
    uint256 planId;           // Plan ID
    address owner;            // Chủ sở hữu
    uint256 principal;        // Số tiền gửi
    uint256 startAt;          // Thời điểm gửi
    uint256 maturityAt;       // Thời điểm đáo hạn
    uint256 aprBpsAtOpen;     // APR snapshot tại thời điểm mở
    uint256 penaltyBpsAtOpen; // Phí phạt snapshot tại thời điểm mở
    DepositStatus status;     // Active, Withdrawn, ManualRenewed, AutoRenewed
}
```

**Snapshot APR/penalty**: Khi mở deposit, APR và penalty được copy vào struct. Sau đó, dù admin update plan, deposit cũ vẫn giữ nguyên giá trị gốc.

#### 5 Luồng Bắt Buộc

**Flow 1: openDeposit → withdrawAtMaturity**
```solidity
function openDeposit(planId, amount):
    1. Kiểm tra plan enabled, amount >= minDeposit
    2. Tạo Deposit struct với maturityAt = now + tenorDays * 86400
    3. Transfer USDC từ user → VaultManager
    4. Mint ERC721 NFT certificate

function withdrawAtMaturity(depositId):
    1. Kiểm tra deposit Active, block.timestamp >= maturityAt
    2. Tính lãi đơn: interest = (principal * aprBpsAtOpen * tenorSeconds) / (365 days * 10000)
    3. VaultManager.withdrawFromVault(user, principal)
    4. VaultManager.withdrawInterest(user, interest)
    5. Burn NFT, set status = Withdrawn
```

**Flow 2: openDeposit → earlyWithdraw**
```solidity
function earlyWithdraw(depositId):
    1. Tính phạt: penalty = principal * penaltyBpsAtOpen / 10000
    2. User nhận: principal - penalty
    3. feeReceiver nhận: penalty
    4. 0% lãi suất
    5. Burn NFT
```

**Flow 3: openDeposit → renewDeposit**
```solidity
function renewDeposit(depositId, newPlanId):
    1. Tính lãi từ deposit cũ
    2. newPrincipal = principal + interest
    3. Tạo deposit mới với newPrincipal
    4. Deposit cũ → ManualRenewed
    5. Mint NFT mới
```

**Flow 4: openDeposit → autoRenewDeposit**
```solidity
function autoRenewDeposit(depositId):
    1. Kiểm tra: block.timestamp >= maturityAt + gracePeriod (3 ngày)
    2. Tính lãi từ deposit cũ
    3. newPrincipal = principal + interest
    4. Tạo deposit mới với APR/penalty GỐC (snapshot)
    5. Deposit cũ → AutoRenewed
    6. Mint NFT mới
```

#### Công Thức Tính Lãi Đơn
```
interest = (principal × aprBpsAtOpen × tenorSeconds) / (365 × 24 × 3600 × 10000)
```

Ví dụ: 10,000 USDC × 375 bps × 180 ngày:
```
interest = 10,000 × 375 × (180 × 86400) / (365 × 86400 × 10000)
         = 10,000 × 375 × 180 / (365 × 10000)
         = 375 × 180 / 365
         ≈ 184.93 USDC
```

### 4. ERC721 NFT Certificate

- **Tên**: SavingCertificate
- **Symbol**: SCERT
- **Token ID**: Deposit ID (tự tăng)
- **Metadata**: Có thể set URI sau bằng `setTokenURI()`

---

## Các Vấn Đề Gặp Phải & Giải Pháp

### Vấn đề 1: Interest Withdrawal
**Lỗi**: `Insufficient deposits tracked` khi rút lãi từ vault.

**Nguyên nhân**: `withdrawFromVault()` kiểm tra `totalDeposits >= amount`. Nhưng lãi suất không phải tiền người dùng gửi, nên không nằm trong `totalDeposits`.

**Giải pháp**: Tạo hàm mới `withdrawInterest()` chỉ transfer mà không giảm `totalDeposits`.

### Vấn đề 2: Test Variable Scope
**Lỗi**: `aprBps is not defined` trong test.

**Nguyên nhân**: Biến `aprBps` được define trong test trước, không accessible trong test sau.

**Giải pháp**: Inline giá trị `375n` trực tiếp trong hàm gọi.

---

## Lệnh Hữu Ích

```bash
# Compile
npx hardhat compile

# Run tests
npx hardhat test

# Deploy local
npx hardhat deploy

# Deploy Sepolia
npx hardhat deploy --network sepolia --tags VaultManager,SavingCore

# Deploy tất cả
npx hardhat deploy --network sepolia --tags MockUSDC,VaultManager,SavingCore

# Coverage
npx hardhat coverage
```

---

## Kế Hoạch Ngày 3 (Preview)

**Test Suite Cơ Bản** — Viết test cases chi tiết hơn:
- Test 5 luồng bắt buộc với nhiều trường hợp
- Test edge cases: amount = minDeposit, amount = maxDeposit
- Test boundary: maturityAt chính xác, grace period boundary
- Test ERC721: ownership, transfer restrictions

---

## Kết Luận Ngày 2

Ngày 2 đã hoàn thành xuất sắc:
- ✅ VaultManager.sol hoạt động đúng (fund, withdraw, solvency check)
- ✅ SavingCore.sol hoạt động đúng (5 flows, ERC721, interest calculation)
- ✅ 41/41 tests passing
- ✅ Deploy thành công lên Sepolia
- ✅ Personal Variant values đã tích hợp đúng
