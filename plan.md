# 📋 Online Banking System — Kế Hoạch 7 Ngày

## Thông Tin Dự Án
- **MSSV:** 2231200077
- **A (chữ số cuối):** 7 | **B (chữ số kế cuối):** 7
- **Bắt đầu:** 20/07/2026

## Giá Trị Cá Nhân (Personal Variant)
| Thông số | Công thức | Giá trị |
|---|---|---|
| Grace period (tự gia hạn) | (A mod 3) + 2 | **3 ngày** |
| Default APR | 200 + A × 25 | **375 bps = 3.75%** |
| Phí rút sớm | 300 + B × 50 | **650 bps = 6.50%** |
| Default tenor | B=7 (lẻ) | **180 ngày** |

---

## Tổng Quan Tiến Độ

| Ngày | Nội dung | Trạng thái |
|---|---|---|
| Day 1 | Setup + MockUSDC | ✅ Hoàn thành |
| Day 2 | VaultManager + SavingCore | ✅ Hoàn thành |
| Day 3 | Test Suite cơ bản | ⏳ Chờ |
| Day 4 | Test Coverage > 90% | ⏳ Chờ |
| Day 5 | React Frontend (MetaMask) | ⏳ Chờ |
| Day 6 | README + Design Answers | ⏳ Chờ |
| Day 7 | Final Polish + Deploy | ⏳ Chờ |

---

## Day 1 — Setup Dự Án + MockUSDC ✅
**Trạng thái:** Hoàn thành

### Mục tiêu
- [x] Tạo cấu trúc thư mục `project/`
- [x] Cài đặt Hardhat + OpenZeppelin dependencies
- [x] Viết MockUSDC.sol (ERC20, 6 decimals, owner-mintable)
- [x] Deploy script + test cases
- [x] Deploy lên Sepolia testnet

### Kết quả Deploy
| Contract | Address | Tx |
|---|---|---|
| MockUSDC | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` | `0x7e64c9e8...` |

### Files đã tạo
```
project/
├── .env
├── package.json
├── hardhat.config.ts
├── tsconfig.json
├── contracts/MockUSDC.sol
├── deploy/1-deploy.ts
├── test/MockUSDC.test.ts
└── reports/DAY1.md
```

---

## Day 2 — VaultManager + SavingCore ✅
**Trạng thái:** Hoàn thành

### Mục tiêu
- [x] Viết VaultManager.sol (quản lý quỹ thanh khoản)
- [x] Viết SavingCore.sol (logic nghiệp vụ + ERC721 NFT)
- [x] Deploy script cho cả 2 contract
- [x] Test cases cho VaultManager (14 tests) và SavingCore (27 tests)
- [x] Deploy lên Sepolia testnet ✅
- [x] Tạo báo cáo DAY2.md

### VaultManager.sol — Contract Quản Lý Quỹ
| Chức năng | Mô tả |
|---|---|
| `fund(amount)` | Owner nạp USDC vào vault |
| `withdraw(amount)` | Owner rút USDC từ vault |
| `depositToVault(amount)` | Ghi nhận người dùng nạp tiền |
| `withdrawFromVault(amount)` | Rút tiền cho người dùng + transfer |
| `isSolvent()` | Kiểm tra vault đủ tiền |
| `vaultBalance()` | Số dư USDC thực tế |
| `pause()` / `unpause()` | Tạm dừng/mở lại hệ thống |

### SavingCore.sol — Contract Logic Nghiệp Vụ
| Chức năng | Mô tả |
|---|---|
| `createPlan(...)` | Tạo plan mới (admin) |
| `updatePlan(planId, aprBps)` | Cập nhật APR (admin) |
| `enablePlan(planId)` / `disablePlan(planId)` | Bật/tắt plan |
| `openDeposit(planId, amount)` | Mở tiết kiệm + mint NFT |
| `withdrawAtMaturity(depositId)` | Rút khi đáo hạn (lãi đơn) |
| `earlyWithdraw(depositId)` | Rút sớm (0 lãi, phạt 650 bps) |
| `renewDeposit(depositId, newPlanId)` | Tái tục thủ công |
| `autoRenewDeposit(depositId)` | Tái tục tự động (sau 3 ngày grace) |

### Công Thức Tính Lãi
```
interest = (principal × aprBpsAtOpen × tenorSeconds) / (365 days × 10000)
```

### Files sẽ tạo
```
project/
├── contracts/VaultManager.sol
├── contracts/SavingCore.sol
├── deploy/2-deploy.ts
├── test/VaultManager.test.ts
├── test/SavingCore.test.ts
└── reports/DAY2.md
```

---

## Day 3 — Test Suite Cơ Bản ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Viết test cases cho 5 luồng bắt buộc:
  1. openDeposit → withdrawAtMaturity
  2. openDeposit → earlyWithdraw
  3. openDeposit → renewDeposit
  4. openDeposit → autoRenewDeposit
  5. Edge cases (amount < min, plan disabled, insufficient vault)
- [ ] Test ERC721 NFT minting + ownership
- [ ] Test access control (admin vs user)
- [ ] Test pause/unpause behavior

---

## Day 4 — Test Coverage > 90% ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Chạy `npx hardhat coverage`
- [ ] Đảm bảo >90% line coverage
- [ ] Thêm test cases cho các phần chưa cover
- [ ] Test interest calculation精度
- [ ] Test boundary conditions (boundary times, rounding)

---

## Day 5 — React Frontend ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Setup Vite + React + TypeScript
- [ ] MetaMask wallet connection
- [ ] Pages:
  - Home: Xem thông tin contracts
  - Open Deposit: Chọn plan, nhập số tiền, mint NFT
  - My Deposits: Danh sách deposit + rút/tái tục

---

## Day 6 — README + Design Answers ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Viết README.md với header Personal Variant
- [ ] Trả lời 7 câu hỏi design:
  1. NFT có thể transfer không?
  2. Vault trống thì sao?
  3. Bot chết giữa chừng?
  4. Rounding dust?
  5. Boundary times?
  6. Plan disabled khi deposit đang active?
  7. Tấn công có thể nghĩ ra?

---

## Day 7 — Final Polish + Deploy ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Final compile + test
- [ ] Deploy tất cả contracts lên Sepolia
- [ ] Verify contracts trên Etherscan
- [ ] Kiểm tra lại coverage
- [ ] Hoàn thiện báo cáo

---

## Bảng Theo Dõi Deployments

| Contract | Network | Address | Deploy Tx |
|---|---|---|---|
| MockUSDC | Sepolia | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` | `0x7e64c9e8...` |
| VaultManager | Sepolia | `0xE72739658F52527bF28507Adb0B6C4fdBD32626b` | `0xc6178a4a...` |
| SavingCore | Sepolia | `0x25FbbB97ccaFe4E4BE1dCE89988c170E721A9947` | `0x81bc9aee...` |

---

## Personal Variant Reference

| Thông số | Giá trị | Sử dụng ở |
|---|---|---|
| Grace period | 3 ngày | autoRenewDeposit |
| Default APR | 375 bps | createPlan default |
| Early withdraw penalty | 650 bps | earlyWithdraw |
| Default tenor | 180 ngày | createPlan default |
