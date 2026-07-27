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
- Anyone can mint freely (test-only faucet pattern)
- Used as the payment token for deposits

### VaultManager (`0x1521290278AAa3f9E8eC25866A1DC63B6d48Aa00`)

- Manages liquidity pool for user deposits
- Owner can fund/withdraw USDC reserves
- Tracks `totalDeposits` for solvency checks
- **C2: Tracks `totalOwedInterest` — blocks admin withdraw if vault would be below interest obligations**
- SavingCore calls `depositToVault`/`withdrawFromVault`/`withdrawInterest`/`recordInterestOwed`/`releaseInterestOwed`

### SavingCore (`0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf`)

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

**Total Tests: 217 — all passing**

### Test Files

| File | Tests | Coverage Focus |
|------|-------|---------------|
| MockUSDC.test.ts | 6 | ERC20, mint, transfer |
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
| VaultManager | `0x1521290278AAa3f9E8eC25866A1DC63B6d48Aa00` | `0x6F4431...26492` |
| SavingCore | `0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf` | `0x6F4431...26492` |

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

**Không — NFT certificate là soulbound (không thể chuyển nhượng).**

Ngoài check `dep.owner == msg.sender` trong business logic, contract còn override `_update()` của ERC721:

```solidity
function _update(address to, uint256 tokenId, address auth)
    internal override returns (address)
{
    require(
        auth == address(this) || auth == address(0) || to == address(0),
        "NFT is non-transferable"
    );
    return super._update(to, tokenId, auth);
}
```

- `auth == address(this)` — cho phép contract internally mint/burn
- `auth == address(0)` — cho phép initial mint
- `to == address(0)` — cho phép burn (withdraw/renew)
- **Bất kỳ `transferFrom`/`safeTransferFrom` nào từ user đều bị block**

**Nếu transfer được thì sao?** Người nhận mới (owner mới ERC721) không thể gọi bất kỳ flow nào vì `dep.owner` trong mapping vẫn là address cũ → tiền bị khóa vĩnh viễn.

**Đây là thiết kế có chủ đích:** NFT chỉ serve as certificate (chứng nhận khoản gửi), không phải tradable asset. Không có logic cần transfer certificate.

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

**Sử dụng integer division — có thể mất vài wei dust mỗi giao dịch.**

Interest formula:
```solidity
(principal * aprBps * tenorSeconds) / (365 days * 10_000)
```

Ví dụ: `10000 USDC * 375 bps * 180 ngày` = `10000 * 375 * 15552000 / 31536000000 = 184.931...` → Solidity truncate xuống `184` USDC (mất ~0.93 USDC dust).

**Ai giữ dust?** Dust ở lại trong VaultManager contract balance. Vault sẽ có balance cao hơn tổng principal + interest obligation một chút.

**Có gây revert không?** Không. Dust đủ nhỏ để không ảnh hưởng bất kỳ check solvency hay balance nào.

**Có ảnh hưởng balance không?** Rất ít. Sau hàng nghìn giao dịch, dust tích lũy có thể lên vài USDC — vẫn trong vault, vẫn là tài sản của owner. Nếu cần chính xác tuyệt đối, có thể dùng `mulDiv` của OpenZeppelin (PRBMath) nhưng trade-off là gas cao hơn. Hiện tại integer truncation là chuẩn mực industry.

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

**Deposit vẫn bình thường — disable chỉ chặn deposits mới và auto-renew.**

Khi `disablePlan(planId)`:
- Deposit hiện tại với plan này vẫn **Active** — tất cả flow (`withdrawAtMaturity`, `earlyWithdraw`, `partialEarlyWithdraw`, `renewDeposit`) hoạt động bình thường
- `openDeposit()` check `plan.enabled` → revert nếu plan disabled
- `renewDeposit()` check `plans[newPlanId].enabled` → chỉ validate plan mới
- `autoRenewDeposit()` check `plans[oldDep.planId].enabled` → **cũng block auto-renew** (`require(currentPlan.enabled, "Plan is disabled")` tại `SavingCore.sol:429`)

**Đây là thiết kế đúng:** Disable plan là business decision — ngừng nhận deposits mới, nhưng existing deposits phải được phục vụ đến maturity. Auto-renew cũng bị chặn vì plan đã disabled.

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
|   +-- MockUSDC.test.ts      MockUSDC tests (6)
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
