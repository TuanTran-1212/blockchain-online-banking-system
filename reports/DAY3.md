# 📋 Báo Cáo Ngày 3 — Test Suite Comprehensive

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

## Mục Tiêu Ngày 3
- [x] Viết test cases cho 5 luồng bắt buộc
- [x] Test ERC721 NFT minting + ownership + metadata
- [x] Test access control (admin vs user)
- [x] Test pause/unpause behavior cho mọi operation
- [x] Test boundary conditions (maturityAt, grace period)
- [x] Test integration (full lifecycle)
- [x] Deploy lên Sepolia ✅

---

## Kết Quả Tests

```
129 passing (5s)
0 failing
```

| File | Tests | Mô tả |
|---|---|---|
| MockUSDC.test.ts | 8 | ERC20 basics |
| VaultManager.test.ts | 14 | Fund, withdraw, solvency, pause |
| VaultManager.edge.test.ts | 28 | Edge cases, boundary values |
| SavingCore.test.ts | 27 | 5 flows, access control, interest |
| SavingCore.edge.test.ts | 52 | Edge cases, lifecycle, NFT, validation |
| **Tổng** | **129** | **All passing** |

---

## Chi Tiết Test Cases Mới (Ngày 3)

### 1. openDeposit — Boundary Values (5 tests)
```
✔ should accept deposit at exact minDeposit
✔ should reject deposit at minDeposit - 1
✔ should handle multiple deposits from same user
✔ should handle deposits from multiple users
✔ should accept deposit of 1 USDC with minDeposit = 0
```

**Ý nghĩa:** Kiểm tra giá trị biên — deposit chính xác bằng min, thiếu 1 wei, nhiều user cùng deposit.

### 2. openDeposit — MaxDeposit Limit (2 tests)
```
✔ should accept deposit at exact maxDeposit
✔ should reject deposit exceeding maxDeposit
```

**Ý nghĩa:** Plan có giới hạn maxDeposit = 50,000 USDC, kiểm tra đúng/sai giới hạn.

### 3. withdrawAtMaturity — Boundary Timing (3 tests)
```
✔ should allow withdraw at exact maturity timestamp
✔ should reject withdraw 1 second before maturity
✔ should burn NFT after withdraw
```

**Ý nghĩa:** Kiểm tra thời điểm đáo hạn chính xác — đúng 1 giây trước vẫn chưa được rút.

### 4. earlyWithdraw — Timing & Penalty (4 tests)
```
✔ should allow early withdraw immediately after opening
✔ should allow early withdraw 1 second before maturity
✔ should burn NFT after early withdraw
✔ should send penalty to feeReceiver
```

**Ý nghĩa:** Rút sớm ngay lập tức, rút trước maturity 1 giây, kiểm tra phí phạt gửi đúng nơi.

### 5. renewDeposit — Edge Cases (4 tests)
```
✔ should renew into same plan
✔ should reject renew into disabled plan
✔ should reject renew when new principal below minDeposit
✔ should burn old NFT and mint new NFT on renew
```

**Ý nghĩa:** Tái tục cùng plan, plan bị tắt, principal mới thấp hơn min.

### 6. autoRenewDeposit — Grace Period Boundary (4 tests)
```
✔ should reject auto-renew at exactly maturityAt + gracePeriod - 1
✔ should allow auto-renew at exactly maturityAt + gracePeriod
✔ should keep original APR even if plan APR was updated
✔ should allow auto-renew long after grace period
```

**Ý nghĩa:** Grace period = 3 ngày. Kiểm tra ranh giới chính xác — trước 1 giây không được, đúng lúc được.

### 7. Access Control — Comprehensive (8 tests)
```
✔ should reject user calling createPlan
✔ should reject user calling updatePlanApr
✔ should reject user calling disablePlan
✔ should reject user calling enablePlan
✔ should reject user calling pause
✔ should reject non-owner earlyWithdraw
✔ should reject non-owner renewDeposit
✔ should reject non-owner autoRenewDeposit
```

**Ý nghĩa:** Mọi hàm admin chỉ owner mới gọi được. Mọi hàm user chỉ chủ NFT mới gọi được.

### 8. Interest Calculation — Multiple Scenarios (5 tests)
```
✔ should calculate interest for 30-day tenor
✔ should calculate interest for 365-day tenor
✔ should calculate interest for 1-day tenor
✔ should return 0 interest for 0 tenor
✔ should handle small principal correctly
```

**Ý nghĩa:** Kiểm tra công thức lãi với nhiều kỳ hạn khác nhau.

### 9. Integration — Full Lifecycle (4 tests)
```
✔ lifecycle: open → withdraw at maturity
✔ lifecycle: open → renew → withdraw
✔ lifecycle: open → auto-renew → withdraw
✔ lifecycle: user1 opens, user2 opens, both withdraw
```

**Ý nghĩa:** Test toàn bộ chuỗi nghiệp vụ từ đầu đến cuối.

### 10. ERC721 NFT — Metadata (4 tests)
```
✔ should set and get tokenURI
✔ should return empty string by default
✔ should reject non-owner setTokenURI
✔ should return correct token count
```

**Ý nghĩa:** Kiểm tra NFT metadata, quyền set URI, đếm token.

### 11. Pause — All Operations Blocked (5 tests)
```
✔ should block withdrawAtMaturity when paused
✔ should block earlyWithdraw when paused
✔ should block renewDeposit when paused
✔ should block autoRenewDeposit when paused
✔ should allow operations after unpause
```

**Ý nghĩa:** Khi pause, mọi operation đều bị chặn. Sau unpause hoạt động lại bình thường.

### 12. Plan Validation (8 tests)
```
✔ should reject createPlan with tenorDays = 0
✔ should reject createPlan with APR = 0
✔ should reject createPlan with APR > 5000
✔ should reject createPlan with penalty > 2000
✔ should reject createPlan with minDeposit = 0
✔ should reject updatePlanApr for non-existent plan
✔ should reject enablePlan for already enabled plan
✔ should reject disablePlan for already disabled plan
```

**Ý nghĩa:** Kiểm tra tất cả validation input của plan management.

### 13. Non-existent Resources (4 tests)
```
✔ should reject getDeposit for non-existent deposit
✔ should reject getPlan for non-existent plan
✔ should reject openDeposit for non-existent plan
✔ should return empty array for getUserDeposits with no deposits
```

**Ý nghĩa:** Xử lý lỗi khi truy cập resource không tồn tại.

---

## Bugs Found & Fixed trong Ngày 3

### Bug 1: Renew → Withdraw Insufficient Deposits
**Mô tả:** Khi renew deposit, `totalDeposits` trong VaultManager không bao gồm interest. Khi withdraw deposit mới, `withdrawFromVault` fail vì `totalDeposits` thấp hơn principal mới.

**Giải pháp:** Trong `renewDeposit` và `autoRenewDeposit`, gọi `vaultManager.depositToVault(interest)` để đăng ký interest như một deposit mới trong vault.

### Bug 2: autoRenewDeposit Missing Ownership Check
**Mô tả:** Bất kỳ ai cũng có thể gọi `autoRenewDeposit` trên deposit của người khác.

**Giải pháp:** Thêm `require(oldDep.owner == msg.sender, "Not your deposit")` vào `autoRenewDeposit`.

---

## Kết Quả Deploy Sepolia

| Contract | Address |
|---|---|
| MockUSDC | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` |
| VaultManager | `0xE72739658F52527bF28507Adb0B6C4fdBD32626b` |
| SavingCore | `0x25FbbB97ccaFe4E4BE1dCE89988c170E721A9947` |

---

## Kế Hoạch Ngày 4 (Preview)

**Test Coverage > 90%** — Chạy `npx hardhat coverage` và đảm bảo >90% line coverage:
- Xác định các phần chưa cover
- Thêm test cases cho uncovered lines
- Boundary conditions cho interest calculation

---

## Kết Luận Ngày 3

Ngày 3 đã hoàn thành xuất sắc:
- ✅ 129/129 tests passing (tăng từ 41 lên 129)
- ✅ Bug security fix: autoRenewDeposit ownership check
- ✅ Bug logic fix: renewDeposit interest tracking
- ✅ Coverage全面：boundary, access control, lifecycle, NFT, pause, validation
