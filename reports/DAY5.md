# 📋 Báo Cáo Ngày 5 — Challenges C2 + C3

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

## Phần 1: Phân Tích 5 Challenges

### Danh sách Challenges
| ID | Challenge | Vấn đề trong base spec |
|---|---|---|
| C1 | Principal is always safe | Vault trống → revert → khóa tiền gốc user |
| C2 | Solvency guard | Admin rút vault → active deposits không trả nổi interest |
| C3 | Partial early withdrawal | All-or-nothing → user cần 10% phải phá 100% |
| C4 | Top-up deposit | Không thể thêm tiền vào deposit đang active |
| C5 | Own idea | Tùy chọn |

### Lựa Chọn: C2 + C3
Lý do:
- **C2** đơn giản nhất — chỉ cần thêm accounting vào VaultManager
- **C3** practical — giải quyết pain point thật của user
- Cả hai độc lập, không conflict khi implement
- Tổng **+10 bonus** tối đa
- C1 và C4 phức tạp hơn, cần thêm thời gian

---

## Phần 2: C2 — Solvency Guard (+5 bonus)

### Vấn đề
Admin có thể gọi `withdraw()` rút toàn bộ vault bất cứ lúc nào. Deposit hôm qua còn an toàn, hôm nay có thể không trả nổi interest. Vault có thể bị drained, user mất quyền rút tiền.

### Giải pháp
Thêm `totalOwedInterest` — tổng interest vault cam kết trả cho tất cả active deposits. Block `withdraw()` nếu vault sẽ below interest obligations.

### Thay đổi VaultManager.sol

**1. State mới:**
```solidity
uint256 public totalOwedInterest; // Total interest owed to active deposits
```

**2. Hai callback functions:**
```solidity
function recordInterestOwed(uint256 amount) external {
    totalOwedInterest += amount;
    emit InterestOwedRecorded(amount);
}

function releaseInterestOwed(uint256 amount) external {
    require(totalOwedInterest >= amount, "Invalid release amount");
    totalOwedInterest -= amount;
    emit InterestOwedReleased(amount);
}
```

**3. Sửa `withdraw()` — solvency check:**
```solidity
// Trước: balance - totalDeposits >= amount
// Sau:  balance - totalDeposits - totalOwedInterest >= amount
require(
    usdc.balanceOf(address(this)) - totalDeposits - totalOwedInterest >= amount,
    "Insufficient free balance"
);
```

**4. View functions cập nhật:**
- `isSolvent()` = `balance >= totalDeposits + totalOwedInterest`
- `getAvailableLiquidity()` = `balance - totalDeposits - totalOwedInterest`

### Thay đổi SavingCore.sol — 5 flows

| Flow | Hành động |
|---|---|
| `openDeposit` | `recordInterestOwed(expectedInterest)` |
| `withdrawAtMaturity` | `releaseInterestOwed(interest)` |
| `earlyWithdraw` | `releaseInterestOwed(expectedInterest)` |
| `renewDeposit` | `releaseInterestOwed(oldInterest)` + `recordInterestOwed(newInterest)` |
| `autoRenewDeposit` | `releaseInterestOwed(oldInterest)` + `recordInterestOwed(newInterest)` |

### Key Code References
- `VaultManager.sol:55-63` — `withdraw()` check
- `VaultManager.sol:115-130` — `recordInterestOwed()` / `releaseInterestOwed()`
- `SavingCore.sol:207-210` — Record interest on openDeposit

### Trade-off
Admin mất một phần quyền tự do rút tiền, nhưng user được guarantee interest payout. Vault không bao giờ bị drained dưới mức đã hứa.

---

## Phần 3: C3 — Partial Early Withdrawal (+5 bonus)

### Vấn đề
Base spec all-or-nothing. User cần 10% tiền phải phá 100% deposit, mất penalty toàn bộ trên toàn bộ principal.

### Giải pháp
Thêm `partialEarlyWithdraw(depositId, withdrawAmount)`. Penalty chỉ tính trên phần rút, phần còn lại giữ nguyên APR.

### Ví dụ minh họa
User deposit 1000 USDC, cần 100 USDC sớm (penalty 6.5%):
- **Cũ:** Phá toàn bộ → mất 65 USDC penalty, 900 USDC mất lãi
- **Mới:** Rút 100 → mất 6.5 USDC penalty, 900 USDC tiếp tục earn 3.75% APR

### Code Logic
```solidity
function partialEarlyWithdraw(uint256 depositId, uint256 withdrawAmount)
    external whenNotPaused nonReentrant
{
    // Validate
    require(withdrawAmount > 0 && withdrawAmount <= dep.principal, "Invalid withdraw amount");

    // Penalty on withdrawn amount only
    uint256 penalty = (withdrawAmount * dep.penaltyBpsAtOpen) / BPS_DENOMINATOR;
    uint256 userPayout = withdrawAmount - penalty;

    // Transfer
    if (penalty > 0) vaultManager.withdrawFromVault(feeReceiver, penalty);
    vaultManager.withdrawFromVault(msg.sender, userPayout);

    // C2 interaction: release interest obligation
    uint256 releasedInterest = calculateInterest(withdrawAmount, dep.aprBpsAtOpen, dep.maturityAt - dep.startAt);
    vaultManager.releaseInterestOwed(releasedInterest);

    // Update
    dep.principal -= withdrawAmount;
    if (dep.principal == 0) {
        dep.status = DepositStatus.Withdrawn;
        _burn(depositId);
    }
}
```

### Key Code References
- `SavingCore.sol:290-328` — `partialEarlyWithdraw()`

### Trade-off
Code phức tạp hơn (deposit state thay đổi, cần track principal còn lại). Nhưng user được linh hoạt rút 1 phần mà không mất lãi phần còn lại.

---

## Phần 4: Test Results

### Tổng Kết
| Metric | Kết quả | Target |
|---|---|---|
| Total Tests | **203** | — |
| Statements | **100%** | >90% ✅ |
| Functions | **100%** | >90% ✅ |
| Lines | **100%** | >90% ✅ |
| Branch | **93.33%** | >90% ✅ |

### Test Files
| File | Tests | Focus |
|---|---|---|
| MockUSDC.test.ts | 8 | ERC20, mint, transfer |
| VaultManager.test.ts | 14 | Fund, withdraw, solvency |
| VaultManager.edge.test.ts | 28 | Boundary, events, access |
| SavingCore.test.ts | 27 | 5 flows, plans, interest |
| SavingCore.edge.test.ts | 52 | Edge cases, timing, access |
| Coverage.test.ts | 31 | Uncovered branches |
| Coverage.branch.test.ts | 21 | Branch fix: paused, invalid params |
| **Challenges.test.ts** | **22** | **C2 solvency + C3 partial withdraw** |

### Challenges.test.ts — Test Cases Chi Tiết

#### C2: Solvency Guard (12 tests)
| # | Test | Kết quả |
|---|---|---|
| 1 | Record totalOwedInterest on openDeposit | ✔ |
| 2 | Release after withdrawAtMaturity | ✔ |
| 3 | Release after earlyWithdraw | ✔ |
| 4 | Release old + record new on renewDeposit | ✔ |
| 5 | Release old + record new on autoRenewDeposit | ✔ |
| 6 | Block admin withdraw below totalOwedInterest | ✔ |
| 7 | Allow admin withdraw up to available liquidity | ✔ |
| 8 | Track multiple deposits totalOwedInterest | ✔ |
| 9 | isSolvent accounts for totalOwedInterest | ✔ |
| 10 | Allow 1 wei admin withdraw below limit | ✔ |
| 11 | Revert 1 wei admin withdraw above limit | ✔ |
| 12 | totalOwedInterest = 0 after full lifecycle | ✔ |

#### C3: Partial Early Withdrawal (10 tests)
| # | Test | Kết quả |
|---|---|---|
| 1 | Partial withdraw 10% — correct penalty | ✔ |
| 2 | 100% partial = full early withdraw | ✔ |
| 3 | Reject withdraw 0 | ✔ |
| 4 | Reject withdraw > principal | ✔ |
| 5 | Reject non-owner partial withdraw | ✔ |
| 6 | Reject partial withdraw when paused | ✔ |
| 7 | Multiple partial withdrawals on same deposit | ✔ |
| 8 | Remaining principal earns interest at maturity | ✔ |
| 9 | FeeReceiver receives correct penalty | ✔ |
| 10 | Emit DepositPartialEarlyWithdrawn event | ✔ |

---

## Phần 5: Deployments

### Sepolia (Day 5 — Contracts mới)
| Contract | Address | Gas Used |
|---|---|---|
| MockUSDC | `0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269` | 656,388 |
| VaultManager | `0x29b7e818Eaa803111788eFE924ff3682093CA3a8` | 950,606 |
| SavingCore | `0x468864a15B76327f578d0dCb0E544D4C6A1aEC03` | 3,552,083 |

### Demo Setup trên Sepolia
- Plan 0 created: 180d, 3.75% APR, min 100 USDC, penalty 6.50%
- Vault funded: 100,000 USDC
- Deployer USDC: 900,000 USDC

---

## Phần 6: Frontend Fixes

### Bugs tìm thấy + fix
| File | Bug | Fix |
|---|---|---|
| `Home.tsx` | Không try/catch → vault balance fail silent "0" | +try/catch, +loading, +error display |
| `MyDeposits.tsx:52` | `core.withdrawDeposit(depositId)` — contract không có | → `core.withdrawAtMaturity(depositId)` |
| `MyDeposits.tsx:66` | `core.renewDeposit(depositId)` — thiếu newPlanId | → Thêm plan selector, truyền 2 params |
| `contracts.ts` | ABI import sai kiểu (ethers.js reject) | → `(abi as any).abi` extract |
| `Navbar.tsx` | Unused `useState` import | Bỏ import |
| `OpenDeposit.tsx` | Unused `DECIMALS` import | Bỏ import |

### Frontend Build Result
```
✓ built in 325ms
dist/index.html          0.47 kB
dist/assets/index.css    5.95 kB
dist/assets/index.js   580.05 kB
```

---

## Phần 7: Scripts Update

### Script Addresses Updated
| Script | Old Address | New Address |
|---|---|---|
| `create-plan.ts` | `0x25Fbb...` | `0x468864a15B76327f578d0dCb0E544D4C6A1aEC03` |
| `fund-vault.ts` | `0x862b...` / `0xE727...` | `0x45BA...` / `0x29b7...` |
| `check-status.ts` | Old all | New all |

### New Script: `demo-setup.ts`
All-in-one script: create plan → mint USDC → fund vault → check status → print demo instructions

### New npm Scripts
```json
"demo:setup": "hardhat run --network sepolia scripts/demo-setup.ts",
"demo:check": "hardhat run --network sepolia scripts/check-status.ts"
```

### Demo Flow
```bash
# Lần đầu:
npm run demo:setup

# Mỗi lần restart:
cd frontend && npm run dev

# Kiểm tra status:
npm run demo:check
```

---

## Kết Luận Ngày 5

Ngày 5 đã hoàn thành:
- ✅ Phân tích 5 challenges (C1-C5), lựa chọn C2 + C3
- ✅ Implement C2 (Solvency Guard) — VaultManager + SavingCore
- ✅ Implement C3 (Partial Early Withdrawal) — SavingCore
- ✅ 203/203 tests passing
- ✅ Coverage: 100% stmts, 93.33% branch, 100% funcs, 100% lines
- ✅ Deploy Sepolia — 3 contracts mới
- ✅ Fix 6 frontend bugs (Home.tsx, MyDeposits.tsx, contracts.ts, etc.)
- ✅ Update scripts addresses + tạo demo-setup.ts
- ✅ Cập nhật README.md, architectureDesign.md, plan.md, AGENTS.md
- ✅ Bonus: +10 points (C2 + C3)
