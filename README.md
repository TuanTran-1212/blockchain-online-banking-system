# Online Banking System — Blockchain Final Project

## Student Information

| Field | Value |
|-------|-------|
| Student ID | 2231200077 |
| A (last digit) | 7 |
| B (second-to-last digit) | 7 |

## Personal Variant

| Parameter | Formula | Value |
|-----------|---------|-------|
| Grace period (auto-renew) | (A mod 3) + 2 | **3 days** |
| Default APR | 200 + A x 25 | **375 bps = 3.75%** |
| Early withdraw penalty | 300 + B x 50 | **650 bps = 6.50%** |
| Default tenor | B=7 (odd) | **180 days** |

---

## Project Overview

A decentralized term deposit system built on Ethereum (Sepolia testnet) where users can:

- **Open term deposits** with configurable tenor and APR
- **Earn simple interest** paid from a vault-funded liquidity pool
- **Withdraw at maturity** with principal + interest
- **Early withdraw** with penalty (principal forfeited to feeReceiver)
- **Renew deposits** manually or auto-renew after grace period
- **Receive ERC721 NFT certificates** for each deposit

---

## Architecture

See [architectureDesign.md](./architectureDesign.md) for detailed system architecture, contract relationships, flow diagrams, and security analysis.

---

## Smart Contracts

### MockUSDC (`0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269`)

- ERC20 token with 6 decimals (simulates USDC)
- Owner can mint freely for testing
- Used as the payment token for deposits

### VaultManager (`0x29b7e818Eaa803111788eFE924ff3682093CA3a8`)

- Manages liquidity pool for user deposits
- Owner can fund/withdraw USDC reserves
- Tracks `totalDeposits` for solvency checks
- **C2: Tracks `totalOwedInterest` — blocks admin withdraw if vault would be below interest obligations**
- SavingCore calls `depositToVault`/`withdrawFromVault`/`withdrawInterest`/`recordInterestOwed`/`releaseInterestOwed`

### SavingCore (`0x468864a15B76327f578d0dCb0E544D4C6A1aEC03`)

- Core business logic contract
- ERC721 NFT certificates ("SavingCertificate" / "SCERT")
- Manages deposit plans (create, update, enable/disable)
- 6 deposit flows: open, withdraw at maturity, early withdraw, **partial early withdraw (C3)**, renew, auto-renew
- Snapshot pattern: APR and penalty are snapshotted at deposit time

---

## Test Coverage

```
-------------------|----------|----------|----------|----------|
File               |  % Stmts | % Branch |  % Funcs |  % Lines |
-------------------|----------|----------|----------|----------|
 contracts\        |      100 |    93.33 |      100 |      100 |
  MockUSDC.sol     |      100 |      100 |      100 |      100 |
  SavingCore.sol   |      100 |     93.9 |      100 |      100 |
  VaultManager.sol |      100 |    90.48 |      100 |      100 |
-------------------|----------|----------|----------|----------|
All files          |      100 |    93.33 |      100 |      100 |
-------------------|----------|----------|----------|----------|
```

**Total Tests: 203 — all passing**

### Test Files

| File | Tests | Coverage Focus |
|------|-------|---------------|
| MockUSDC.test.ts | 8 | ERC20, mint, transfer |
| VaultManager.test.ts | 14 | Fund, withdraw, solvency |
| VaultManager.edge.test.ts | 28 | Boundary, events, access |
| SavingCore.test.ts | 27 | 5 flows, plans, interest |
| SavingCore.edge.test.ts | 52 | Edge cases, timing, access |
| Coverage.test.ts | 31 | Uncovered branches |
| Coverage.branch.test.ts | 21 | Branch fix: paused, invalid params |
| **Challenges.test.ts** | **22** | **C2 solvency guard + C3 partial early withdraw** |

---

## Deployments (Sepolia)

| Contract | Address | Deployer |
|----------|---------|----------|
| MockUSDC | `0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269` | `0x6F4431...26492` |
| VaultManager | `0x29b7e818Eaa803111788eFE924ff3682093CA3a8` | `0x6F4431...26492` |
| SavingCore | `0x468864a15B76327f578d0dCb0E544D4C6A1aEC03` | `0x6F4431...26492` |

---

## How to Run

### Install Dependencies

```bash
# Smart contracts
cd project
npm install --legacy-peer-deps

# Frontend
cd project/frontend
npm install
```

### Run Tests

```bash
cd project
npx hardhat test
```

### Run Coverage

```bash
cd project
npx hardhat coverage
```

### Run Frontend

```bash
cd project/frontend
npm run dev
```

### Deploy to Sepolia

```bash
cd project
npx hardhat deploy --network sepolia
```

---

## Design Answers

### Q1: NFT có thể transfer không?

**Không — hiện tại NFT bị khóa vì business logic kiểm tra `owner == msg.sender`.**

ERC721 base (OpenZeppelin) hỗ trợ `transferFrom` / `safeTransferFrom`, nhưng tất cả user functions (`withdrawAtMaturity`, `earlyWithdraw`, `partialEarlyWithdraw`, `renewDeposit`, `autoRenewDeposit`) đều check:
```solidity
require(dep.owner == msg.sender, "Not your deposit");
```

Vì `owner` được set lúc `openDeposit` và không bao giờ thay đổi, transferring NFT sang address khác sẽ:
- Người nhận mới (owner mới ERC721) không thể gọi任何 flow → tiền bị khóa
- Người gửi cũ mất quyền kiểm tra ERC721 nhưng vẫn giữ quyền trong mapping

**Đây là thiết kế có chủ đích:** NFT chỉ serve as certificate, không phải tradable asset. Nếu cần transfer trong tương lai, cần update mapping owner qua `_transfer` hook.

---

### Q2: Vault trống thì sao?

**VaultManager có 3 layer bảo vệ:**

1. **`withdrawFromVault()`** — check `totalDeposits >= amount` → revert nếu vault dưới tracked deposits
2. **`withdrawInterest()`** — check `balance >= totalDeposits + amount` → revert nếu không đủ tiền trả interest
3. **`withdraw()` (admin)** — check `balance - totalDeposits - totalOwedInterest >= amount` → block nếu vault sẽ dưới obligations

**Trường hợp worst case:** Vault trả hết principal + interest cho tất cả deposits, nhưng không còn gì cho admin. Admin vẫn có thể withdraw phần "free" (balance - totalDeposits - totalOwedInterest).

**C2 Solvency Guard** đảm bảo vault không bao giờ bị drained dưới mức đã cam kết trả interest. Nếu vault mất solvency, admin bị block withdraw.

---

### Q3: Bot chết giữa chừng (auto-renew)?

**Auto-renew phụ thuộc vào bot/off-chain caller — không có guarantee on-chain.**

Nếu bot chết:
- Deposit vẫn **Active**, user vẫn có thể gọi `withdrawAtMaturity()` hoặc `earlyWithdraw()` bất cứ lúc nào
- Sau `maturityAt + GRACE_PERIOD_DAYS` (3 ngày), người dùng vẫn có thể gọi `autoRenewDeposit()` — không có time limit
- Nếu không ai gọi auto-renew sau grace period, deposit vẫn ở trạng thái Active, chờ user gọi `withdrawAtMaturity()` hoặc `renewDeposit()`

**Thực tế:** Không có forced auto-renew. Bot chỉ là convenience layer — user có thể tự quản lý deposits.

---

### Q4: Rounding dust?

**Sử dụng integer division — có thể mất 1 wei dust.**

Interest formula:
```solidity
(principal * aprBps * tenorSeconds) / (365 days * 10_000)
```

Ví dụ: `100 * 375 * 15552000 / 31536000000 = 187.499...` → Solidity truncate xuống `187` → mất 0.5 USDC (với 6 decimals)

**Impact:** Dust tích lũy theo thời gian nhưng không đủ significant. Vault có thể có 1-2 wei "extra" không thuộc principal hay interest obligation.

**Trade-off:** Solidity không có float. Có thể ceil bằng `+ (denominator - 1)` nhưng sẽ overcharge user. Hiện tại để nguyên — dust chấp nhận được.

---

### Q5: Boundary times?

**5 boundary cases được xử lý:**

| Case | Xử lý |
|---|---|
| `block.timestamp == maturityAt` | Cho phép withdraw (`>=`) |
| `block.timestamp == maturityAt + 3 days` | Grace period kết thúc, auto-renew mở |
| Deposit mở đúng `block.timestamp` | `startAt = block.timestamp` |
| Interest calculation `tenorSeconds = 0` | `calculateInterest()` trả 0 |
| Open deposit khi vault có balance = `totalDeposits` | Chưa đủ interest obligation, sẽ revert nếu có interest > 0 |

**Edge case với `autoRenewDeposit`:**
```solidity
uint256 gracePeriodEnd = oldDep.maturityAt + (GRACE_PERIOD_DAYS * 1 days);
require(block.timestamp >= gracePeriodEnd, "Grace period not ended");
```
Nếu gọi chính xác `maturityAt + 3 days`, `block.timestamp == gracePeriodEnd` → cho phép.

---

### Q6: Plan disabled khi deposit đang active?

**Deposit vẫn bình thường — disable chỉ chặn deposits mới.**

Khi `disablePlan(planId)`:
- Deposit hiện tại với plan này vẫn **Active** — tất cả flow hoạt động
- `openDeposit()` check `plan.enabled` → revert nếu plan disabled
- `renewDeposit()` check `plans[newPlanId].enabled` → chỉ validate plan mới
- `autoRenewDeposit()` dùng `plans[oldDep.planId]` nhưng không check `enabled`

**Đây là thiết kế đúng:** Disable plan là business decision — ngừng nhận deposits mới, nhưng existing deposits phải được phục vụ đến maturity.

---

### Q7: Tấn công có thể nghĩ ra?

**5 attack vectors phân tích:**

| Attack | Mức độ | Bảo vệ |
|---|---|---|
| **Reentrancy** | Cao | `nonReentrant` trên tất cả external functions |
| **Vault draining** | Cao | C2 Solvency Guard + `withdraw()` check |
| **Interest manipulation** | Trung | APR/penalty snapshot khi open, không thể thay đổi |
| **Plan manipulation** | Trung | Owner-only functions, `require(plan.enabled)` |
| **Front-running** | Thấp | Không có MEV-sensitive logic |

**Chi tiết:**

1. **Reentrancy attack:** OpenZeppelin `ReentrancyGuard` + state update trước external calls → an toàn
2. **Vault draining:** Admin có thể drain free balance nhưng không thể drain principal/interest obligations. C2 Solvency Guard chặn admin nếu vault below obligations
3. **Interest manipulation:** APR snapshot tại `block.timestamp` của `openDeposit`. Owner thay đổi plan APR → deposits mới affected, deposits cũ giữ nguyên
4. **Plan manipulation:** `disablePlan()` chỉ chặn deposits mới. `updatePlanApr()` chỉ affects deposits mới. Không có way nào để thay đổi deposits đang active
5. **Front-running:** Không có auction logic, không có price oracle, không có liquidation → không có MEV incentive

**Điểm yếu tiềm ẩn:**
- Nếu `recordInterestOwed()` và `releaseInterestOwed()` không được gọi đúng, `totalOwedInterest` có thể sai lệch. Hiện tại hardcode trong SavingCore flows → an toàn
- Frontend có thể hiển thị sai nếu RPC node sync chậm (không phải smart contract issue)

---

## Challenges

### C2: Solvency Guard (+5 bonus)

**Problem:** The base spec lets the admin drain the vault at any time via `withdraw()`. Deposits that were safe yesterday can become unpayable today — the bank could lock user money forever by never funding the vault.

**Solution:** Added `totalOwedInterest` tracking to VaultManager. When a deposit is opened, the expected interest obligation is recorded. The admin's `withdraw()` is blocked if it would reduce the vault below `totalDeposits + totalOwedInterest`. When a deposit is settled (withdrawn, renewed), the obligation is released.

**Key code:**
- `VaultManager.sol:55-63` — `withdraw()` checks `balance - totalDeposits - totalOwedInterest >= amount`
- `VaultManager.sol:115-130` — `recordInterestOwed()` / `releaseInterestOwed()` callbacks
- `SavingCore.sol:207-210` — Records interest on `openDeposit()`

**Trade-off:** Admin loses some withdrawal flexibility, but users gain guaranteed interest payout. The vault can never be drained below what's owed to depositors.

---

### C3: Partial Early Withdrawal (+5 bonus)

**Problem:** The base spec is all-or-nothing. A user who needs 10% of their money must break 100% of the deposit and lose the full penalty on the entire principal.

**Solution:** Added `partialEarlyWithdraw(depositId, withdrawAmount)` function. Penalty applies only to the withdrawn portion; the rest keeps earning interest at the original rate.

**Example:** User deposits 1000 USDC, needs 100 USDC early (penalty 6.5%):
- Old: break entire deposit → lose 65 USDC penalty
- New: withdraw 100 → lose only 6.5 USDC penalty, 900 USDC keeps earning 3.75% APR

**Key code:**
- `SavingCore.sol:290-328` — `partialEarlyWithdraw()` with proportional penalty
- Penalty: `(withdrawAmount * penaltyBpsAtOpen) / 10000`
- If `principal` reaches 0, NFT is burned and status set to Withdrawn

**Trade-off:** More complex state management (deposit stays active with reduced principal), but users get much more flexibility without losing interest on the remaining amount.

---

## Project Structure

```
project/
+-- contracts/
|   +-- MockUSDC.sol          ERC20 mock token (6 decimals)
|   +-- VaultManager.sol      Liquidity vault management
|   +-- SavingCore.sol        Core business logic + ERC721
+-- deploy/
|   +-- 1-deploy.ts           Deploy MockUSDC
|   +-- 2-deploy.ts           Deploy VaultManager + SavingCore
+-- test/
|   +-- MockUSDC.test.ts      MockUSDC tests (8)
|   +-- VaultManager.test.ts  VaultManager tests (14)
|   +-- VaultManager.edge.test.ts  VaultManager edge cases (28)
|   +-- SavingCore.test.ts    SavingCore tests (27)
|   +-- SavingCore.edge.test.ts  SavingCore edge cases (52)
|   +-- Coverage.test.ts      Coverage gap tests (31)
|   +-- Coverage.branch.test.ts  Branch fix tests (21)
|   +-- Challenges.test.ts     C2 + C3 challenge tests (22)
+-- scripts/
|   +-- create-plan.ts        Create plan on Sepolia
|   +-- fund-vault.ts         Fund vault with USDC
|   +-- check-status.ts       Check vault/deployer status
+-- frontend/
|   +-- src/
|   |   +-- config/contracts.ts   ABIs, addresses, helpers
|   |   +-- hooks/useWallet.ts    MetaMask connection
|   |   +-- components/Navbar.tsx Navigation
|   |   +-- pages/Home.tsx        Plans + vault balance
|   |   +-- pages/OpenDeposit.tsx Open deposit flow
|   |   +-- pages/MyDeposits.tsx  Manage deposits
|   +-- package.json
+-- reports/
|   +-- DAY1.md               Report Day 1 (Vietnamese)
|   +-- DAY2.md               Report Day 2 (Vietnamese)
|   +-- DAY3.md               Report Day 3 (Vietnamese)
|   +-- DAY4.md               Report Day 4 (Vietnamese)
|   +-- DAY5.md               Report Day 5 (Vietnamese)
|   +-- DAY6.md               Report Day 6 (Vietnamese)
+-- architectureDesign.md     System architecture + diagrams
+-- plan.md                   Project plan + progress
+-- hardhat.config.ts         Hardhat configuration
+-- package.json              Dependencies
```
