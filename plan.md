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
| Day 4 | Test Coverage + Frontend | ✅ Hoàn thành |
| Day 5 | Challenges | ⏳ Chờ |
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
- [x] 100% statements/functions/lines, 88.76% branch
- [x] Thêm 31 test cases → 160 tests total

### React Frontend
- [x] Setup Vite + React + TypeScript + ethers.js
- [x] MetaMask wallet connection (useWallet hook)
- [x] Home page: Plans list + vault balance
- [x] Open Deposit page: Select plan, approve, open deposit
- [x] My Deposits page: List deposits, withdraw, renew
- [x] Build pass, production bundle generated

---

## Day 5 — Challenges ⏳
**Trạng thái:** Chờ

### Mục tiêu
- [ ] Phân tích 5 challenges (C1-C5)
- [ ] Lựa chọn 1-2 challenges phù hợp
- [ ] Implement trong Solidity
- [ ] Viết test cases cho challenges
- [ ] Deploy lại nếu có thay đổi contract

---

## Day 6 — Design Answers + README ⏳
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
