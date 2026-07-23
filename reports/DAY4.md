# 📋 Báo Cáo Ngày 4 — Test Coverage + React Frontend

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

## Phần 1: Test Coverage

### Kết quả Coverage — Trước Fix
| Metric | Kết quả |
|---|---|
| Statements | 100% |
| Functions | 100% |
| Lines | 100% |
| Branch | **88.76%** ❌ (< 90%) |

### Kết quả Coverage — Sau Fix
| Metric | Kết quả | Target |
|---|---|---|
| Statements | **100%** | >90% ✅ |
| Functions | **100%** | >90% ✅ |
| Lines | **100%** | >90% ✅ |
| Branch | **95.51%** | >90% ✅ |

### Tổng Tests: 181 — all passing (trước fix: 160)

---

## Phần 2: Phân Tích Branch Coverage Gap

### Branches không được cover trước fix (20 branches)

#### A. SavingCore.sol — 17 branches

| # | Line | Statement | Branch Missing | Loại |
|---|------|-----------|---------------|------|
| 1 | 141 | `require(newAprBps > 0 && newAprBps <= 5000)` | `newAprBps > 0` = false | require revert |
| 2 | 141 | `require(newAprBps > 0 && newAprBps <= 5000)` | `newAprBps <= 5000` = false | require revert |
| 3 | 150 | `require(planId < planCount)` enablePlan | planId không tồn tại | require revert |
| 4 | 157 | `require(planId < planCount)` disablePlan | planId không tồn tại | require revert |
| 5 | 179 | `openDeposit` function `whenNotPaused` | Khi paused | modifier |
| 6 | 218 | `withdrawAtMaturity` function `whenNotPaused` | Khi paused | modifier |
| 7 | 230 | `if (interest > 0)` withdrawAtMaturity | interest = 0 | if false |
| 8 | 247 | `earlyWithdraw` function `whenNotPaused` | Khi paused | modifier |
| 9 | 280 | `renewDeposit` function `whenNotPaused` | Khi paused | modifier |
| 10 | 281 | `require(depositId < depositCount)` renewDeposit | depositId không tồn tại | require revert |
| 11 | 284 | `require(oldDep.status == Active)` renewDeposit | Deposit đã withdrawn | require revert |
| 12 | 286 | `require(newPlanId < planCount)` renewDeposit | PlanId mới không tồn tại | require revert |
| 13 | 296 | `require(maxDeposit == 0 \|\| newPrincipal <= maxDeposit)` | maxDeposit != 0 AND pass | compound condition |
| 14 | 299 | `if (interest > 0)` renewDeposit | interest = 0 | if false |
| 15 | 337 | `autoRenewDeposit` function `whenNotPaused` | Khi paused | modifier |
| 16 | 341 | `require(oldDep.status == Active)` autoRenewDeposit | Deposit đã renewed | require revert |
| 17 | 354 | `if (interest > 0)` autoRenewDeposit | interest = 0 | if false |

#### B. VaultManager.sol — 3 branches

| # | Line | Statement | Branch Missing | Loại |
|---|------|-----------|---------------|------|
| 18 | 55 | `withdraw` function `onlyOwner` | Non-owner gọi | modifier |
| 19 | 87 | `withdrawFromVault` function `whenNotPaused` | Khi paused | modifier |
| 20 | 101 | `withdrawInterest` function `whenNotPaused` | Khi paused | modifier |

### Phân tích nguyên nhân

**Loại 1: Modifier branches không cover (10 branches)**
- `whenNotPaused` và `onlyOwner` trên các function chưa bị test ở trạng thái false
- Solidity-coverage count mỗi modifier là branch riêng
- **Giải pháp:** Test gọi function khi contract paused hoặc từ non-owner

**Loại 2: require revert paths không cover (7 branches)**
- `updatePlanApr(0, 0)` và `updatePlanApr(0, 5001)` — chưa test APR invalid cho updatePlanApr
- `enablePlan(99)`, `disablePlan(99)` — chưa test planId không tồn tại
- `renewDeposit(99, 0)`, `renewDeposit(0, 99)` — chưa test deposit/plan không tồn tại
- `renewDeposit` deposit đã withdrawn — chưa test
- **Giải pháp:** Thêm test gọi function với invalid params

**Loại 3: Compound condition sub-branch (1 branch)**
- `maxDeposit == 0 || newPrincipal <= maxDeposit` — chỉ test trường hợp false (maxDeposit limit exceeded)
- Chưa test trường hợp `maxDeposit != 0` mà pass (newPrincipal <= maxDeposit)
- **Giải pháp:** Tạo plan với maxDeposit = 15000, renew với newPrincipal ~10185

**Loại 4: `if (interest > 0)` false path (3 branches)**
- Interest = 0 chỉ xảy ra khi principal × aprBps × tenorSeconds < 31,536,000,000
- Với minDeposit=1, aprBps=1, tenorDays=1: interest = (1 × 1 × 86400) / 31,536,000,000 = 0
- **Giải pháp:** Tạo plan đặc biệt aprBps=1, tenorDays=1, minDeposit=1

---

## Phần 3: Test Cases Đã Thêm

### Coverage.branch.test.ts (21 tests mới)

```
Coverage — Branch Fix
  updatePlanApr — Invalid APR
    ✔ should reject updatePlanApr with APR = 0
    ✔ should reject updatePlanApr with APR > 5000
  enablePlan — Non-existent plan
    ✔ should reject enablePlan for non-existent plan
  disablePlan — Non-existent plan
    ✔ should reject disablePlan for non-existent plan
  unpause — Non-owner
    ✔ should reject non-owner calling unpause
  VaultManager withdraw — Non-owner
    ✔ should reject non-owner calling withdraw
  VaultManager — Paused withdrawFromVault
    ✔ should reject withdrawFromVault when paused
  VaultManager — Paused withdrawInterest
    ✔ should reject withdrawInterest when paused
  openDeposit — When paused
    ✔ should reject openDeposit when paused
  withdrawAtMaturity — When paused
    ✔ should reject withdrawAtMaturity when paused
  earlyWithdraw — When paused
    ✔ should reject earlyWithdraw when paused
  renewDeposit — Non-existent deposit
    ✔ should reject renewDeposit for non-existent deposit
  renewDeposit — Not active
    ✔ should reject renewDeposit for withdrawn deposit
  renewDeposit — New plan non-existent
    ✔ should reject renewDeposit with non-existent new plan
  renewDeposit — When paused
    ✔ should reject renewDeposit when paused
  autoRenewDeposit — Not active
    ✔ should reject autoRenewDeposit for already renewed deposit
  autoRenewDeposit — When paused
    ✔ should reject autoRenewDeposit when paused
  renewDeposit — maxDeposit satisfied
    ✔ should allow renew into plan with maxDeposit > newPrincipal
  Interest = 0 — withdrawAtMaturity
    ✔ should handle withdrawAtMaturity with zero interest
  Interest = 0 — renewDeposit
    ✔ should handle renewDeposit with zero interest
  Interest = 0 — autoRenewDeposit
    ✔ should handle autoRenewDeposit with zero interest
```

---

## Phần 4: Tổng Kết Tests

| File | Tests |
|---|---|
| MockUSDC.test.ts | 8 |
| VaultManager.test.ts | 14 |
| VaultManager.edge.test.ts | 28 |
| SavingCore.test.ts | 27 |
| SavingCore.edge.test.ts | 52 |
| Coverage.test.ts | 31 |
| Coverage.branch.test.ts | 21 |
| **Tổng** | **181** |

---

## Phần 5: React Frontend

### Tech Stack
| Library | Version | Purpose |
|---|---|---|
| Vite | 8.1.5 | Build tool |
| React | 19.1.0 | UI framework |
| TypeScript | 5.8.3 | Type safety |
| ethers.js | 6.15.0 | Blockchain interaction |

### Frontend Features
1. **MetaMask Connection**: Auto-detect wallet, switch to Sepolia, handle account/chain changes
2. **Home Page**: Display all active plans with tenor, APR, min/max deposit, penalty
3. **Open Deposit**: Two-step flow (Approve → Open), preview interest, validation
4. **My Deposits**: Active/completed deposits, withdraw at maturity, early withdraw, renew

### Deployments (Sepolia)
| Contract | Address |
|---|---|
| MockUSDC | `0x862b80A643f3ec8067Bd3653Ba2D2c737019bddA` |
| VaultManager | `0xE72739658F52527bF28507Adb0B6C4fdBD32626b` |
| SavingCore | `0x25FbbB97ccaFe4E4BE1dCE89988c170E721A9947` |

---

## Kết Luận Ngày 4

Ngày 4 đã hoàn thành:
- ✅ 181/181 tests passing
- ✅ 100% statements, functions, lines coverage
- ✅ **95.51% branch coverage** (đạt yêu cầu > 90%)
- ✅ Đã thêm 21 test cases mới cho missing branches
- ✅ Phân tích 20 branches không cover + nguyên nhân
- ✅ React Frontend built + production bundle generated
