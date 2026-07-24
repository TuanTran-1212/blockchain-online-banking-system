# 📋 Online Banking System — Kế Hoạch

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
| Day 3 | Test Suite (129 tests) | ✅ Hoàn thành |
| Day 4 | Test Coverage (95.51%) + Frontend | ✅ Hoàn thành |
| Day 5 | Challenges (C2 + C3) | ✅ Hoàn thành |
| Day 6 | Design Answers + README | ⏳ Chờ |
| Day Final | Deploy + Verify + Report | ⏳ Chờ |

---

## Day 1 — Setup Dự Án + MockUSDC ✅
**Trạng thái:** Hoàn thành

### Mục tiêu
- [x] Tạo cấu trúc thư mục `project/`
- [x] Cài đặt Hardhat + OpenZeppelin dependencies
- [x] Viết MockUSDC.sol (ERC20, 6 decimals, owner-mintable)
- [x] Deploy script + test cases
- [x] Deploy lên Sepolia testnet

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

---

## Day 3 — Test Suite Comprehensive ✅
**Trạng thái:** Hoàn thành

### Mục tiêu
- [x] Viết test cases cho 5 luồng bắt buộc
- [x] Test ERC721 NFT minting + ownership + metadata
- [x] Test access control, pause/unpause, boundary conditions
- [x] Integration tests (full lifecycle 4 scenarios)

### Kết quả: 129 tests — all passing

---

## Day 4 — Test Coverage + React Frontend ✅
**Trạng thái:** Hoàn thành

### Coverage
- [x] Chạy `npx hardhat coverage`
- [x] 100% statements/functions/lines, 88.76% branch (ban đầu)
- [x] Thêm 31 test cases → 160 tests total
- [x] Fix branch coverage: thêm 21 tests mới → 181 tests total
- [x] Branch coverage: **88.76% → 95.51%** (đạt yêu cầu > 90%)

### React Frontend
- [x] Setup Vite + React + TypeScript + ethers.js
- [x] MetaMask wallet connection (useWallet hook)
- [x] Home page: Plans list + vault balance
- [x] Open Deposit page: Select plan, approve, open deposit
- [x] My Deposits page: List deposits, withdraw, renew
- [x] Build pass, production bundle generated

### Bug Fixes
- [x] Frontend: maxDeposit=0 (unlimited) hiển thị "0.0 USDC" → fix hiển thị "Unlimited"
- [x] Frontend: validation `depositAmount > plan.maxDeposit` sai khi maxDeposit=0 → fix check `maxDeposit !== 0n`
- [x] Frontend: early withdraw gọi `withdrawBeforeMaturity()` → fix thành `earlyWithdraw()`

### Documentation
- [x] Tạo `architectureDesign.md` — mô tả toàn bộ hệ thống + visualize
- [x] Tạo `README.md` (draft) — project overview + test coverage + deploy info
- [x] Tạo scripts: create-plan.ts, fund-vault.ts, check-status.ts

---

## Day 5 — Challenges (C2 + C3) ✅
**Trạng thái:** Hoàn thành

### Mục tiêu
- [x] Phân tích 5 challenges (C1-C5)
- [x] Lựa chọn C2 (Solvency Guard) + C3 (Partial Early Withdrawal)
- [x] Implement C2 trong VaultManager.sol + SavingCore.sol
- [x] Implement C3 trong SavingCore.sol
- [x] Viết test cases — 22 tests mới (Challenges.test.ts)
- [x] Deploy lại lên Sepolia — tất cả contracts mới
- [x] Cập nhật README.md — thêm challenges section
- [x] Cập nhật architectureDesign.md
- [x] Fix 6 frontend bugs (Home.tsx, MyDeposits.tsx, contracts.ts, etc.)
- [x] Update scripts addresses + tạo demo-setup.ts
- [x] Tạo reports/DAY5.md

### Kết quả: 203 tests — all passing, Coverage 93.33% branch

### C2: Solvency Guard
- Thêm `totalOwedInterest` vào VaultManager
- Block admin `withdraw()` nếu below interest obligations
- SavingCore gọi `recordInterestOwed()` / `releaseInterestOwed()` ở mỗi flow

### C3: Partial Early Withdrawal
- Thêm `partialEarlyWithdraw(depositId, withdrawAmount)`
- Penalty tính trên phần rút, phần còn lại giữ nguyên interest
- Nếu rút hết → Withdrawn + burn NFT

---

## Day 6 — Design Answers + README ✅
**Trạng thái:** Hoàn thành

### Mục tiêu
- [x] Viết README.md với header Personal Variant
- [x] Trả lời 7 câu hỏi design:
  1. NFT có thể transfer không?
  2. Vault trống thì sao?
  3. Bot chết giữa chừng?
  4. Rounding dust?
  5. Boundary times?
  6. Plan disabled khi deposit đang active?
  7. Tấn công có thể nghĩ ra?

---

## Day Final — Deploy + Verify + Report ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Final compile + test
- [ ] Deploy tất cả contracts lên Sepolia
- [ ] Verify contracts trên Etherscan
- [ ] Kiểm tra lại coverage
- [ ] Hoàn thiện báo cáo cuối cùng

---

## Bảng Theo Dõi Deployments

| Contract | Network | Address | Deploy Tx |
|---|---|---|---|
| MockUSDC | Sepolia | `0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269` | `0x12b47f28...` |
| VaultManager | Sepolia | `0x29b7e818Eaa803111788eFE924ff3682093CA3a8` | `0x5a2b1904...` |
| SavingCore | Sepolia | `0x468864a15B76327f578d0dCb0E544D4C6A1aEC03` | `0x7b05e30d...` |

---

## Personal Variant Reference

| Thông số | Giá trị | Sử dụng ở |
|---|---|---|
| Grace period | 3 ngày | autoRenewDeposit |
| Default APR | 375 bps | createPlan default |
| Early withdraw penalty | 650 bps | earlyWithdraw |
| Default tenor | 180 ngày | createPlan default |
