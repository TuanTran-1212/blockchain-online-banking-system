# Architecture Design — Online Banking System

## 1. System Overview

```
+------------------------------------------------------------------+
|                        FRONTEND (React + TypeScript)              |
|   +------------+   +----------------+   +---------------------+   |
|   |  Home Page |   | Open Deposit   |   |   My Deposits       |   |
|   | - Plans    |   | - Select Plan  |   | - List deposits     |   |
|   | - Vault    |   | - Input amount |   | - Withdraw          |   |
|   |   balance  |   | - Approve+Open |   | - Early withdraw    |   |
|   +------+-----+   +-------+--------+   | - Renew             |   |
|          |                 |             +-----------+---------+   |
|          +-----------------+-------------------------+            |
|                                    |                              |
|                           ethers.js + MetaMask                    |
|                                    |                              |
+------------------------------------+------------------------------+
                                     |
                          MetaMask Extension
                          (Wallet Provider)
                                     |
+------------------------------------+------------------------------+
|                          SEPOLIA TESTNET                          |
|                                                                   |
|  +-------------------+   +-------------------+   +-----------+   |
|  |    SavingCore      |   |   VaultManager    |   | MockUSDC  |   |
|  |    (ERC721)        |-->|   (Ownable)       |<--| (ERC20)   |   |
|  | - Plans            |   | - totalDeposits   |   | - 6 dec   |   |
|  | - Deposits         |   | - vaultBalance    |   | - mint    |   |
|  | - NFT certificates |   | - fund/withdraw   |   +-----------+   |
|  +-------------------+   +-------------------+                   |
|                                                                   |
+-------------------------------------------------------------------+
```

## 2. Contract Relationships

```
                    Owner (Admin)
                        |
                        | fund(amount)
                        | createPlan()
                        v
               +--------+--------+
               |  VaultManager   |<--- usdc.balanceOf(vault) = actual balance
               |                 |     totalDeposits = tracked user deposits
               |  vaultBalance   |     totalOwedInterest = C2 solvency guard
               |  totalDeposits  |
               +--------+--------+
                        ^
                        | withdrawFromVault(to, amount)      [principal]
                        | withdrawInterest(to, amount)       [interest]
                        | depositToVault(amount)             [tracking]
                        | recordInterestOwed(amount)         [C2: track obligation]
                        | releaseInterestOwed(amount)        [C2: release obligation]
                        |
               +--------+--------+
               |   SavingCore    |--- ERC721("SavingCertificate", "SCERT")
               |                 |
               | plans: Plan[]   |--- User deposits USDC via approve + openDeposit
               | deposits: Dep[] |--- NFT minted as deposit certificate
               | feeReceiver     |--- Receives early withdraw penalties
               +-----------------+
                        |
                        | usdc.safeTransferFrom(user, vault, amount)
                        v
               +--------+--------+
               |    MockUSDC     |
               |  ERC20 (6 dec)  |
               |  mint() owner   |
               +-----------------+
```

### Key Relationships

| From | To | Action | Purpose |
|------|-----|--------|---------|
| Owner | VaultManager | `fund(amount)` | Deposit USDC liquidity reserve |
| Owner | SavingCore | `createPlan(...)` | Create deposit product |
| User | MockUSDC | `approve(savingCore, amount)` | Authorize SavingCore to spend |
| User | SavingCore | `openDeposit(planId, amount)` | Open term deposit |
| SavingCore | MockUSDC | `safeTransferFrom(user, vault, amount)` | Move USDC to vault |
| SavingCore | VaultManager | `depositToVault(amount)` | Track deposited amount |
| SavingCore | VaultManager | `recordInterestOwed(amount)` | C2: Record interest obligation |
| SavingCore | VaultManager | `releaseInterestOwed(amount)` | C2: Release interest obligation |
| SavingCore | ERC721 | `_mint(user, depositId)` | Mint NFT certificate |
| User | SavingCore | `withdrawAtMaturity(id)` | Withdraw with interest |
| User | SavingCore | `earlyWithdraw(id)` | Withdraw with penalty |
| User | SavingCore | `partialEarlyWithdraw(id, amt)` | C3: Partial early withdraw |
| User | SavingCore | `renewDeposit(id, planId)` | Manual renew |
| User | SavingCore | `autoRenewDeposit(id)` | Auto renew after grace period |

## 3. Data Structures

### Plan

```
+------------------------------------------------------------------+
| Plan                                                              |
+------------------------------------------------------------------+
| tenorDays            : uint256    Term length in days              |
| aprBps               : uint256    Annual rate in basis points      |
| minDeposit           : uint256    Minimum deposit amount           |
| maxDeposit           : uint256    Maximum deposit (0 = unlimited)  |
| earlyWithdrawPenaltyBps : uint256 Penalty for early withdrawal     |
| enabled              : bool       Is plan active                   |
+------------------------------------------------------------------+

Example:
  Plan 0: tenorDays=180, aprBps=375 (3.75%), minDeposit=100 USDC
          maxDeposit=0 (unlimited), penaltyBps=650 (6.50%)
```

### Deposit

```
+------------------------------------------------------------------+
| Deposit                                                           |
+------------------------------------------------------------------+
| planId          : uint256        Which plan was used               |
| owner           : address        Deposit owner                     |
| principal       : uint256        Deposited amount                  |
| startAt         : uint256        Opening timestamp                 |
| maturityAt      : uint256        Maturity timestamp                |
| aprBpsAtOpen    : uint256        APR snapshot at deposit time      |
| penaltyBpsAtOpen: uint256        Penalty snapshot at deposit time  |
| status          : DepositStatus  Current status                    |
+------------------------------------------------------------------+

Snapshot Pattern:
  aprBpsAtOpen = plan.aprBps at the moment of openDeposit()
  penaltyBpsAtOpen = plan.earlyWithdrawPenaltyBps at the moment of openDeposit()
  -> If admin updates plan APR later, existing deposits keep original rate
```

### DepositStatus State Machine

```
                         openDeposit()
                              |
                              v
                    +-------------------+
                    |                   |
                    |      ACTIVE       |<---------+
                    |                   |          |
                    +--------+----------+          |
                             |                     |
            +----------------+----------+          |
            |                |          |          |
    withdrawAtMaturity  earlyWithdraw  renewDeposit  autoRenewDeposit
            |                |          |          |
            v                v          v          v
    +-------------+  +-------------+  +-------------+  +--------------+
    |  WITHDRAWN  |  |  WITHDRAWN  |  |  MANUAL     |  | AUTO         |
    |  (NFT burn) |  |  (NFT burn) |  |  RENEWED    |  | RENEWED      |
    +-------------+  +-------------+  |  (NFT burn) |  | (NFT burn)   |
                                      |  + new dep  |  | + new dep    |
                                      +-------------+  +--------------+

Rules:
  - Only Active deposits can be operated on
  - Withdrawn: final state (deposit settled)
  - ManualRenewed: old deposit closed, new deposit opened
  - AutoRenewed: same as manual but triggered after grace period
```

## 4. Flow Diagrams

### Flow 1: Open Deposit

```
User                  Frontend              SavingCore            VaultManager         MockUSDC
 |                       |                      |                      |                  |
 |-- connect wallet ---->|                      |                      |                  |
 |-- select plan -------->|                      |                      |                  |
 |-- enter amount ------->|                      |                      |                  |
 |                       |-- approve(savingCore)|                      |                  |
 |                       |                      |                      |       approve()  |
 |                       |-- openDeposit ------>|                      |                  |
 |                       |                      |-- safeTransferFrom(user, vault, amount) ->
 |                       |                      |                      |                  |
 |                       |                      |                      |   depositToVault  |
 |                       |                      |-- depositToVault --->|                  |
 |                       |                      |                      |-- totalDeposits += amount
 |                       |                      |-- _mint(user, depositId) (ERC721)       |
 |                       |<-- depositId --------|                      |                  |
 |<-- NFT minted --------|                      |                      |                  |
```

### Flow 2: Withdraw at Maturity

```
User                  Frontend              SavingCore            VaultManager         MockUSDC
 |                       |                      |                      |                  |
 |-- withdrawAtMaturity->|                      |                      |                  |
 |                       |-- withdrawAtMaturity(depositId) ----------->|                  |
 |                       |                      |-- calculateInterest   |                  |
 |                       |                      |   = principal * apr * tenor / (365*10000) |
 |                       |                      |-- withdrawFromVault(user, principal) --->|
 |                       |                      |                      |-- totalDeposits -= principal
 |                       |                      |                      |-- safeTransfer(user, principal)
 |                       |                      |-- withdrawInterest(user, interest) ----->|
 |                       |                      |                      |-- safeTransfer(user, interest)
 |                       |                      |-- _burn(depositId) (NFT burned)         |
 |                       |                      |-- status = Withdrawn |                  |
 |                       |<-- success -----------|                      |                  |
 |<-- principal + interest returned -------------|                      |                  |
```

### Flow 3: Early Withdraw

```
User                  Frontend              SavingCore            VaultManager
 |                       |                      |                      |
 |-- earlyWithdraw ----->|                      |                      |
 |                       |-- earlyWithdraw(depositId) ---------------->|
 |                       |                      |-- penalty = principal * penaltyBps / 10000
 |                       |                      |-- userPayout = principal - penalty
 |                       |                      |-- withdrawFromVault(feeReceiver, penalty)
 |                       |                      |   (penalty goes to admin/feeReceiver)
 |                       |                      |-- withdrawFromVault(user, userPayout)
 |                       |                      |   (user gets principal - penalty)
 |                       |                      |-- _burn(depositId)
 |                       |                      |-- status = Withdrawn
 |                       |<-- success -----------|
 |<-- user gets (principal - penalty) ----------|
 |                       |                      |
 |   Interest: 0 (forfeited)                   |
 |   Penalty: sent to feeReceiver              |
```

### Flow 4: Manual Renew

```
User                  Frontend              SavingCore            VaultManager
 |                       |                      |                      |
 |-- renewDeposit ------>|                      |                      |
 |   (depositId, newPlanId)                     |                      |
 |                       |-- renewDeposit(depositId, newPlanId) ----->|
 |                       |                      |-- interest = calculateInterest(...)
 |                       |                      |-- newPrincipal = principal + interest
 |                       |                      |-- Check new plan constraints
 |                       |                      |   (minDeposit, maxDeposit)
 |                       |                      |-- depositToVault(interest) [virtual]
 |                       |                      |   (interest stays in vault, just track it)
 |                       |                      |-- oldDep.status = ManualRenewed
 |                       |                      |-- _burn(oldDepositId) (old NFT burned)
 |                       |                      |-- Create new Deposit struct
 |                       |                      |-- _mint(user, newDepositId) (new NFT)
 |                       |<-- newDepositId -----|
 |<-- new deposit created with principal + interest
```

### Flow 5: Auto Renew (after Grace Period)

```
User                  Frontend              SavingCore            VaultManager
 |                       |                      |                      |
 |   [maturityAt + 3 days grace period elapsed] |                      |
 |                       |                      |                      |
 |-- autoRenewDeposit ->|                      |                      |
 |                       |-- autoRenewDeposit(depositId) ------------->|
 |                       |                      |-- Check: timestamp >= maturityAt + 3 days
 |                       |                      |-- interest = calculateInterest(...)
 |                       |                      |-- newPrincipal = principal + interest
 |                       |                      |-- Same plan, same APR, same penalty
 |                       |                      |-- (uses original snapshots, not current plan)
 |                       |                      |-- depositToVault(interest) [virtual]
 |                       |                      |-- oldDep.status = AutoRenewed
 |                       |                      |-- _burn(oldDepositId)
 |                       |                      |-- Create new deposit with SAME snapshots
 |                       |                      |-- _mint(owner, newDepositId)
 |                       |<-- newDepositId -----|
```

## 5. Interest Calculation

```
Formula:
  interest = (principal * aprBps * tenorSeconds) / (365 days * 10,000)

Where:
  principal          = deposited amount (e.g., 10,000 USDC = 10,000,000,000 wei)
  aprBps             = annual percentage rate in basis points (e.g., 375 = 3.75%)
  tenorSeconds       = maturityAt - startAt (e.g., 180 days = 15,552,000 seconds)
  365 days           = 31,536,000 seconds
  10,000             = BPS_DENOMINATOR

Example:
  principal  = 10,000 USDC = 10,000,000,000 (6 decimals)
  aprBps     = 375 (3.75%)
  tenor      = 180 days = 15,552,000 seconds

  interest = (10,000,000,000 * 375 * 15,552,000) / (31,536,000 * 10,000)
           = 58,320,000,000,000,000,000 / 315,360,000,000
           = 185,000,000 (185.0 USDC)

  User receives: principal (10,000) + interest (185) = 10,185 USDC

Key Points:
  - Simple interest (not compound)
  - Uses snapshot APR at deposit time (not current plan APR)
  - Integer division (truncation, no rounding)
  - Interest paid from vault reserves (owner-funded liquidity)
```

## 6. Vault Fund Flow

```
Phase 1: Setup
  Owner ──fund(100,000 USDC)──> VaultManager
  vaultBalance = 100,000
  totalDeposits = 0
  availableLiquidity = 100,000 (free for interest)

Phase 2: User Deposits
  User1 ──openDeposit(10,000)──> SavingCore
  SavingCore ──safeTransferFrom(user1, vault, 10,000)──> VaultManager
  SavingCore ──depositToVault(10,000)──> VaultManager
  vaultBalance = 110,000
  totalDeposits = 10,000
  availableLiquidity = 100,000 (unchanged — user money is separate)

Phase 3: User Withdraws at Maturity
  interest = 185 USDC
  SavingCore ──withdrawFromVault(user1, 10,000)──> VaultManager
    totalDeposits -= 10,000
    safeTransfer(user1, 10,000)
  SavingCore ──withdrawInterest(user1, 185)──> VaultManager
    safeTransfer(user1, 185)
    (totalDeposits unchanged)

  After: vaultBalance = 99,815
         totalDeposits = 0
         availableLiquidity = 99,815

Phase 4: Early Withdraw (penalty)
  penalty = 780 USDC (6.5% of 12,000)
  userPayout = 11,220 USDC
  SavingCore ──withdrawFromVault(feeReceiver, 780)──> VaultManager
  SavingCore ──withdrawFromVault(user1, 11,220)──> VaultManager

  After: vaultBalance = 88,000
         totalDeposits = 0

Solvent Check:
  vaultBalance >= totalDeposits → Always true if owner funds enough liquidity
  If vaultBalance < totalDeposits → Vault insolvent (cannot pay all users)
```

## 7. Security Architecture

### Access Control Matrix

```
+------------------+--------+--------+----------+------+
| Function         | Owner  | User   | SavingCore | Other |
+------------------+--------+--------+----------+------+
| createPlan       |   YES  |   NO   |    NO    |  NO  |
| updatePlanApr    |   YES  |   NO   |    NO    |  NO  |
| enablePlan       |   YES  |   NO   |    NO    |  NO  |
| disablePlan      |   YES  |   NO   |    NO    |  NO  |
| setFeeReceiver   |   YES  |   NO   |    NO    |  NO  |
| openDeposit      |   YES  |   YES  |    NO    |  NO  |
| withdrawAtMaturity|  YES  |   YES  |    NO    |  NO  |
| earlyWithdraw    |   YES  |   YES  |    NO    |  NO  |
| renewDeposit     |   YES  |   YES  |    NO    |  NO  |
| autoRenewDeposit |   YES  |   YES  |    NO    |  NO  |
| pause / unpause  |   YES  |   NO   |    NO    |  NO  |
| fund             |   YES  |   NO   |    NO    |  NO  |
| withdraw         |   YES  |   NO   |    NO    |  NO  |
| depositToVault   |    -   |   NO   |    YES   |  NO  |
| withdrawFromVault|    -   |   NO   |    YES   |  NO  |
| withdrawInterest |    -   |   NO   |    YES   |  NO  |
+------------------+--------+--------+----------+------+

Note: depositToVault/withdrawFromVault/withdrawInterest on VaultManager
      have NO onlyOwner modifier — callable by SavingCore (by design)
```

### Security Features

```
+------------------------------------------------------------------+
| Security Layer          | Implementation                          |
+------------------------------------------------------------------+
| ReentrancyGuard         | All state-changing external functions   |
|                         | on both SavingCore and VaultManager     |
+------------------------------------------------------------------+
| Pausable                | Emergency stop: pause() / unpause()     |
|                         | Blocks: openDeposit, withdrawAtMaturity |
|                         | earlyWithdraw, renewDeposit,            |
|                         | autoRenewDeposit, fund, depositToVault, |
|                         | withdrawFromVault, withdrawInterest     |
+------------------------------------------------------------------+
| Ownable                 | Admin-only: createPlan, updatePlanApr,  |
|                         | enable/disable, fund, withdraw, pause   |
+------------------------------------------------------------------+
| Snapshot Pattern        | APR + penalty snapshotted at deposit    |
|                         | time → immune to plan parameter changes |
+------------------------------------------------------------------+
| SafeERC20               | All ERC20 transfers use safeTransfer    |
|                         | and safeTransferFrom (prevents hooks)   |
+------------------------------------------------------------------+
| Access Checks           | owner == msg.sender for deposit ops     |
|                         | depositId < depositCount bounds check   |
|                         | status == Active required for all ops   |
+------------------------------------------------------------------+
| Solvency Check          | vaultBalance >= totalDeposits           |
|                         | Available via isSolvent() view          |
+------------------------------------------------------------------+
```

## 8. Frontend Architecture

```
project/frontend/src/
|
+-- config/
|   +-- contracts.ts        Contract ABIs, addresses, helper functions
|                           - CONTRACTS (MockUSDC, VaultManager, SavingCore)
|                           - fetchPlans(), fetchUserDeposits()
|                           - formatUSDC(), parseUSDC()
|                           - calculateInterest()
|
+-- hooks/
|   +-- useWallet.ts        MetaMask wallet connection hook
|                           - connect(), disconnect(), switchToSepolia()
|                           - address, provider, signer, chainId
|                           - Auto-detect account/chain changes
|
+-- components/
|   +-- Navbar.tsx           Navigation bar + wallet connection button
|
+-- pages/
|   +-- Home.tsx             Plans list + vault balance display
|   +-- OpenDeposit.tsx      Two-step flow: Approve → Open Deposit
|   +-- MyDeposits.tsx       Active/completed deposits, withdraw, renew
|
+-- abis/
|   +-- MockUSDC.json        MockUSDC ABI (auto-generated from artifacts)
|   +-- VaultManager.json    VaultManager ABI
|   +-- SavingCore.json      SavingCore ABI
|
+-- App.tsx                  Main app + page routing
+-- App.css                  All styling
+-- main.tsx                 Entry point
```

### Frontend ↔ Contract Interaction

```
MetaMask  <-->  ethers.js  <-->  Frontend React App
   |                                  |
   |  accounts, sign                  |
   |                                  |
   v                                  v
Browser Provider              Contract Instances
                                  |
                    +-------------+-------------+
                    |             |             |
               MockUSDC     VaultManager   SavingCore
                    |             |             |
                    +------+------+------+------+
                           |             |
                    Sepolia Testnet (Ethereum L2)
```
