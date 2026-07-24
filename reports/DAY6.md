# 📋 Báo Cáo Ngày 6 — Design Answers + README

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

## Phần 1: Mục Tiêu Ngày 6

### Checklist
- [x] Viết README.md với header Personal Variant
- [x] Trả lời 7 câu hỏi design

---

## Phần 2: 7 Câu Hỏi Design

### Q1: NFT có thể transfer không?

**Không — hiện tại NFT bị khóa vì business logic kiểm tra `owner == msg.sender`.**

ERC721 base hỗ trợ `transferFrom` / `safeTransferFrom`, nhưng tất cả user functions đều check:
```solidity
require(dep.owner == msg.sender, "Not your deposit");
```

Vì `owner` được set lúc `openDeposit` và không bao giờ thay đổi, transferring NFT sang address khác sẽ:
- Người nhận mới không thể gọi bất kỳ flow nào → tiền bị khóa
- Người gửi cũ mất quyền kiểm tra ERC721 nhưng vẫn giữ quyền trong mapping

**Đây là thiết kế có chủ đích:** NFT chỉ serve as certificate, không phải tradable asset.

---

### Q2: Vault trống thì sao?

**VaultManager có 3 layer bảo vệ:**

| Layer | Function | Check |
|---|---|---|
| 1 | `withdrawFromVault()` | `totalDeposits >= amount` |
| 2 | `withdrawInterest()` | `balance >= totalDeposits + amount` |
| 3 | `withdraw()` (admin) | `balance - totalDeposits - totalOwedInterest >= amount` |

**C2 Solvency Guard** đảm bảo vault không bao giờ bị drained dưới mức đã cam kết trả interest.

---

### Q3: Bot chết giữa chừng (auto-renew)?

**Auto-renew phụ thuộc vào bot/off-chain caller — không có guarantee on-chain.**

Nếu bot chết:
- Deposit vẫn **Active**, user vẫn có thể gọi `withdrawAtMaturity()` hoặc `earlyWithdraw()` bất cứ lúc nào
- Sau `maturityAt + GRACE_PERIOD_DAYS` (3 ngày), người dùng vẫn có thể gọi `autoRenewDeposit()` — không có time limit
- Nếu không ai gọi auto-renew, deposit vẫn ở trạng thái Active, chờ user gọi `withdrawAtMaturity()` hoặc `renewDeposit()`

**Thực tế:** Bot chỉ là convenience layer — user có thể tự quản lý deposits.

---

### Q4: Rounding dust?

**Sử dụng integer division — có thể mất 1 wei dust.**

Interest formula:
```solidity
(principal * aprBps * tenorSeconds) / (365 days * 10_000)
```

Ví dụ: `100 * 375 * 15552000 / 31536000000 = 187.499...` → truncate xuống `187`

**Impact:** Dust tích lũy nhưng không đủ significant. Vault có thể có 1-2 wei "extra" không thuộc principal hay interest obligation.

---

### Q5: Boundary times?

**5 boundary cases được xử lý:**

| Case | Xử lý |
|---|---|
| `block.timestamp == maturityAt` | Cho phép withdraw (`>=`) |
| `block.timestamp == maturityAt + 3 days` | Grace period kết thúc, auto-renew mở |
| Deposit mở đúng `block.timestamp` | `startAt = block.timestamp` |
| Interest calculation `tenorSeconds = 0` | `calculateInterest()` trả 0 |
| Open deposit khi vault balance = `totalDeposits` | Revert nếu có interest > 0 |

---

### Q6: Plan disabled khi deposit đang active?

**Deposit vẫn bình thường — disable chỉ chặn deposits mới.**

Khi `disablePlan(planId)`:
- Deposit hiện tại vẫn **Active** — tất cả flow hoạt động
- `openDeposit()` check `plan.enabled` → revert
- `renewDeposit()` chỉ validate plan mới
- `autoRenewDeposit()` dùng original plan, không check `enabled`

**Đây là thiết kế đúng:** Disable plan là business decision — ngừng nhận deposits mới, nhưng existing deposits phải được phục vụ đến maturity.

---

### Q7: Tấn công có thể nghĩ ra?

**5 attack vectors phân tích:**

| Attack | Mức độ | Bảo vệ |
|---|---|---|
| Reentrancy | Cao | `nonReentrant` trên tất cả external functions |
| Vault draining | Cao | C2 Solvency Guard + withdraw check |
| Interest manipulation | Trung | APR/penalty snapshot khi open |
| Plan manipulation | Trung | Owner-only, `require(plan.enabled)` |
| Front-running | Thấp | Không có MEV-sensitive logic |

**Chi tiết:**

1. **Reentrancy:** OpenZeppelin `ReentrancyGuard` + state update trước external calls → an toàn
2. **Vault draining:** Admin có thể drain free balance nhưng không thể drain principal/interest obligations
3. **Interest manipulation:** APR snapshot tại block.timestamp của openDeposit. Thay đổi plan APR → deposits mới affected, deposits cũ giữ nguyên
4. **Plan manipulation:** `disablePlan()` chỉ chặn deposits mới. Không có way nào thay đổi deposits đang active
5. **Front-running:** Không có auction logic, price oracle, liquidation → không có MEV incentive

**Điểm yếu tiềm ẩn:**
- Nếu `recordInterestOwed()` và `releaseInterestOwed()` không được gọi đúng, `totalOwedInterest` có thể sai lệch
- Frontend có thể hiển thị sai nếu RPC node sync chậm (không phải smart contract issue)

---

## Kết Luận Ngày 6

Ngày 6 đã hoàn thành:
- [x] Viết README.md với header Personal Variant
- [x] Trả lời 7 câu hỏi design chi tiết (NFT transfer, vault trống, bot chết, rounding, boundary, plan disabled, attack vectors)
- [x] Cập nhật README.md với Design Answers section
