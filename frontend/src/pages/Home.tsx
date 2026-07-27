import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  fetchPlans,
  fetchUSDCBalance,
  fetchUserDeposits,
  fetchVaultHealth,
  type Plan,
  type Deposit,
  type VaultHealth,
  formatUSDC,
  parseUSDC,
  getMockUSDC,
  getSavingCore,
  getVaultManager,
  calculateInterest,
} from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  isCorrectNetwork: boolean;
  isAdmin: boolean;
}

export default function Home({
  provider,
  signer,
  address,
  isCorrectNetwork,
  isAdmin,
}: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [vaultHealth, setVaultHealth] = useState<VaultHealth | null>(null);
  const [totalDepositCount, setTotalDepositCount] = useState(0);
  const [corePaused, setCorePaused] = useState(false);
  const [vmPaused, setVmPaused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<string | null>(null);

  const [newTenorDays, setNewTenorDays] = useState("");
  const [newAprBps, setNewAprBps] = useState("");
  const [newMinDeposit, setNewMinDeposit] = useState("");
  const [newMaxDeposit, setNewMaxDeposit] = useState("");
  const [newPenaltyBps, setNewPenaltyBps] = useState("");

  const [updatePlanId, setUpdatePlanId] = useState("");
  const [updateAprBps, setUpdateAprBps] = useState("");

  const [fundAmount, setFundAmount] = useState("");
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [newFeeReceiver, setNewFeeReceiver] = useState("");

  const loadData = useCallback(async () => {
    if (!provider || !isCorrectNetwork) return;
    setLoading(true);
    setError(null);
    try {
      const [p, depList] = await Promise.all([
        fetchPlans(provider),
        address ? fetchUserDeposits(provider, address) : Promise.resolve([]),
      ]);
      setPlans(p);
      setDeposits(depList);
      if (address) {
        const usdcBal = await fetchUSDCBalance(provider, address);
        setUsdcBalance(formatUSDC(usdcBal));
      }
      if (isAdmin) {
        const vh = await fetchVaultHealth(provider);
        setVaultHealth(vh);
        const core = getSavingCore(provider);
        const vm = getVaultManager(provider);
        const [cPaused, vPaused, depCount] = await Promise.all([core.paused(), vm.paused(), core.depositCount()]);
        setCorePaused(cPaused);
        setVmPaused(vPaused);
        setTotalDepositCount(Number(depCount));
      }
    } catch (err: any) {
      console.error("Failed to load data:", err);
      setError(err?.message || "Failed to load blockchain data");
    } finally {
      setLoading(false);
    }
  }, [provider, isCorrectNetwork, address, isAdmin]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCreatePlan = async () => {
    if (!signer) return;
    if (!newTenorDays || !newAprBps || !newMinDeposit || !newPenaltyBps) {
      setTxStatus("Vui lòng nhập đầy đủ thông tin");
      return;
    }
    try {
      setTxStatus("Đang tạo kế hoạch...");
      const core = getSavingCore(signer);
      const tx = await core.createPlan(
        Number(newTenorDays),
        Number(newAprBps),
        parseUSDC(newMinDeposit),
        newMaxDeposit ? parseUSDC(newMaxDeposit) : 0,
        Number(newPenaltyBps)
      );
      await tx.wait();
      setTxStatus("Tạo kế hoạch thành công!");
      setNewTenorDays("");
      setNewAprBps("");
      setNewMinDeposit("");
      setNewMaxDeposit("");
      setNewPenaltyBps("");
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleEnablePlan = async (planId: number) => {
    if (!signer) return;
    try {
      setTxStatus(`Đang bật kế hoạch #${planId}...`);
      const core = getSavingCore(signer);
      const tx = await core.enablePlan(planId);
      await tx.wait();
      setTxStatus(`Đã bật kế hoạch #${planId}!`);
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleDisablePlan = async (planId: number) => {
    if (!signer) return;
    try {
      setTxStatus(`Đang tắt kế hoạch #${planId}...`);
      const core = getSavingCore(signer);
      const tx = await core.disablePlan(planId);
      await tx.wait();
      setTxStatus(`Đã tắt kế hoạch #${planId}!`);
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleUpdateApr = async () => {
    if (!signer || !updatePlanId || !updateAprBps) return;
    try {
      setTxStatus(`Đang cập nhật lãi suất kế hoạch #${updatePlanId}...`);
      const core = getSavingCore(signer);
      const tx = await core.updatePlanApr(Number(updatePlanId), Number(updateAprBps));
      await tx.wait();
      setTxStatus(`Đã cập nhật lãi suất kế hoạch #${updatePlanId}!`);
      setUpdatePlanId("");
      setUpdateAprBps("");
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleFund = async () => {
    if (!signer || !fundAmount) return;
    try {
      setTxStatus("Đang phê duyệt chuyển USDC...");
      const usdc = getMockUSDC(signer);
      const vm = getVaultManager(signer);
      const amount = parseUSDC(fundAmount);
      const approveTx = await usdc.approve(await vm.getAddress(), amount);
      await approveTx.wait();

      setTxStatus("Đang nạp quỹ...");
      const tx = await vm.fund(amount);
      await tx.wait();
      setTxStatus("Nạp quỹ thành công!");
      setFundAmount("");
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleWithdraw = async () => {
    if (!signer || !withdrawAmount) return;
    try {
      setTxStatus("Đang rút quỹ...");
      const vm = getVaultManager(signer);
      const tx = await vm.withdraw(parseUSDC(withdrawAmount));
      await tx.wait();
      setTxStatus("Rút quỹ thành công!");
      setWithdrawAmount("");
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleToggleSavingCore = async () => {
    if (!signer) return;
    try {
      setTxStatus(corePaused ? "Đang tiếp tục SavingCore..." : "Đang tạm dừng SavingCore...");
      const core = getSavingCore(signer);
      const tx = corePaused ? await core.unpause() : await core.pause();
      await tx.wait();
      setTxStatus(corePaused ? "Đã tiếp tục SavingCore" : "Đã tạm dừng SavingCore");
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleToggleVaultManager = async () => {
    if (!signer) return;
    try {
      setTxStatus(vmPaused ? "Đang tiếp tục VaultManager..." : "Đang tạm dừng VaultManager...");
      const vm = getVaultManager(signer);
      const tx = vmPaused ? await vm.unpause() : await vm.pause();
      await tx.wait();
      setTxStatus(vmPaused ? "Đã tiếp tục VaultManager" : "Đã tạm dừng VaultManager");
      loadData();
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  const handleSetFeeReceiver = async () => {
    if (!signer || !newFeeReceiver) return;
    if (!ethers.isAddress(newFeeReceiver)) {
      setTxStatus("Địa chỉ không hợp lệ");
      return;
    }
    try {
      setTxStatus("Đang cập nhật địa chỉ nhận phí...");
      const core = getSavingCore(signer);
      const tx = await core.setFeeReceiver(newFeeReceiver);
      await tx.wait();
      setTxStatus("Cập nhật thành công!");
      setNewFeeReceiver("");
    } catch (err: any) {
      setTxStatus(err?.reason || "Giao dịch thất bại");
    }
  };

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h2 className="page-title">Chào mừng</h2>
        <p style={{ color: "var(--text-muted)" }}>
          Vui lòng kết nối MetaMask với mạng Sepolia để truy cập tài khoản.
        </p>
      </div>
    );
  }

  const activeDeposits = deposits.filter((d) => d.status === 0);
  const totalPrincipal = activeDeposits.reduce((sum, d) => sum + d.principal, 0n);
  const totalEstInterest = activeDeposits.reduce((sum, d) => {
    const tenor = d.maturityAt - d.startAt;
    return sum + calculateInterest(d.principal, d.aprBpsAtOpen, tenor);
  }, 0n);

  return (
    <div className="page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1.5rem" }}>
        <h2 className="page-title">Dashboard</h2>
        <button className="btn-secondary btn-sm" onClick={loadData} disabled={loading}>
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {error && (
        <div className="status-message error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {/* Stat Cards */}
      <div className="stat-cards" style={{ gridTemplateColumns: isAdmin ? "repeat(4, 1fr)" : "repeat(3, 1fr)" }}>
        {/* Card 1: Số dư ví — always shown */}
        <div className="stat-card">
          <div className="stat-icon blue">💰</div>
          <div className="stat-info">
            <div className="stat-label">Số dư ví</div>
            <div className="stat-value">
              {loading ? "..." : usdcBalance !== null ? `${Number(usdcBalance).toLocaleString()}` : "--"}
            </div>
          </div>
        </div>

        {/* Card 2 & 3: Admin vs User */}
        {isAdmin ? (
          <>
            <div className="stat-card">
              <div className="stat-icon green">📋</div>
              <div className="stat-info">
                <div className="stat-label">Tổng số gói</div>
                <div className="stat-value">{plans.length}</div>
                <div className="stat-sub">
                  <span>{plans.filter(p => p.enabled).length} đang mở</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon yellow">🏦</div>
              <div className="stat-info">
                <div className="stat-label">Tổng số khoản gửi</div>
                <div className="stat-value">{totalDepositCount}</div>
                <div className="stat-sub">
                  <span>{activeDeposits.length} đang hoạt động</span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="stat-card">
              <div className="stat-icon green">💵</div>
              <div className="stat-info">
                <div className="stat-label">Tiết kiệm</div>
                <div className="stat-value">{activeDeposits.length} khoản</div>
                <div className="stat-sub">
                  <span><strong>{formatUSDC(totalPrincipal)}</strong> USDC</span>
                </div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon yellow">📈</div>
              <div className="stat-info">
                <div className="stat-label">Lãi ước tính</div>
                <div className="stat-value green">+{formatUSDC(totalEstInterest)}</div>
              </div>
            </div>
          </>
        )}

        {/* Card 4: Rủi ro hệ thống — admin only */}
        {isAdmin && vaultHealth && (() => {
          const vaultBal = Number(formatUSDC(vaultHealth.balance));
          const totalDep = Number(formatUSDC(vaultHealth.totalDeposits));
          const ratio = totalDep > 0 ? vaultBal / totalDep : vaultBal > 0 ? 999 : 0;
          const ratioPct = Math.min(ratio * 100, 999);
          const riskColor = ratio >= 2 ? "green" : ratio >= 1 ? "yellow" : "red";
          const riskLabel = ratio >= 2 ? "Thấp" : ratio >= 1 ? "Trung bình" : "Cao";
          const riskDesc = ratio >= 2
            ? "Dự trữ dồi dào, hệ thống hoạt động bình thường"
            : ratio >= 1
            ? "Dự trữ ở mức trung bình, cần theo dõi"
            : "Cảnh báo: dự trữ không đủ trả nợ!";
          const fillPct = Math.min(ratioPct, 100);

          return (
            <div className="stat-card">
              <div className={`stat-icon ${riskColor}`}>⚡</div>
              <div className="stat-info">
                <div className="stat-label">Rủi ro hệ thống</div>
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.25rem" }}>
                  <span className={`risk-badge ${riskColor}`}>{riskLabel}</span>
                </div>
                <div className="solvency-bar">
                  <div
                    className={`solvency-fill ${riskColor}`}
                    style={{ width: `${fillPct}%` }}
                  />
                </div>
                <div className="risk-desc">{riskDesc}</div>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Vault Health — Admin only, full width */}
      {isAdmin && vaultHealth && (() => {
        const vaultBal = Number(formatUSDC(vaultHealth.balance));
        const totalDep = Number(formatUSDC(vaultHealth.totalDeposits));
        const ratio = totalDep > 0 ? vaultBal / totalDep : vaultBal > 0 ? 999 : 0;
        const ratioPct = Math.min(ratio * 100, 999);
        const fillPct = Math.min(ratioPct, 100);
        const ratioColor = ratio >= 2 ? "green" : ratio >= 1 ? "yellow" : "red";

        return (
          <div className="card section-full" style={{ marginBottom: "1.5rem" }}>
            <div className="card-header">
              <div>
                <h3 className="card-title">Sức khỏe quỹ</h3>
                <p className="card-subtitle">Tổng quan tình hình tài chính hệ thống</p>
              </div>
              <span className={`risk-badge ${ratioColor}`}>
                Tỷ lệ dự trữ: {ratioPct >= 999 ? "∞" : ratioPct.toFixed(0)}%
              </span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "1.25rem" }}>
              <div className="metric-box">
                <div className="stat-label">Số dư quỹ</div>
                <div className="stat-value" style={{ fontSize: "1.1rem" }}>{formatUSDC(vaultHealth.balance)} USDC</div>
              </div>
              <div className="metric-box">
                <div className="stat-label">Tổng tiền gửi</div>
                <div className="stat-value" style={{ fontSize: "1.1rem" }}>{formatUSDC(vaultHealth.totalDeposits)} USDC</div>
              </div>
              <div className="metric-box">
                <div className="stat-label">Nợ lãi phải trả</div>
                <div className="stat-value" style={{ fontSize: "1.1rem", color: "var(--warning)" }}>{formatUSDC(vaultHealth.totalOwedInterest)} USDC</div>
              </div>
              <div className="metric-box">
                <div className="stat-label">Thanh khoản khả dụng</div>
                <div className="stat-value" style={{ fontSize: "1.1rem", color: vaultHealth.isSolvent ? "var(--success)" : "var(--danger)" }}>{formatUSDC(vaultHealth.availableLiquidity)} USDC</div>
              </div>
            </div>
            <div style={{ marginTop: "1.25rem" }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span className="stat-label">Tỷ lệ dự trữ (Tỷ lệ quỹ / Tổng tiền gửi)</span>
                <span className="stat-label" style={{ fontWeight: 600 }}>{ratioPct >= 999 ? "∞" : ratioPct.toFixed(1)}%</span>
              </div>
              <div className="solvency-bar" style={{ height: "10px" }}>
                <div className={`solvency-fill ${ratioColor}`} style={{ width: `${fillPct}%` }} />
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: "0.35rem" }}>
                <span className="help-text">0%</span>
                <span className="help-text">100% (đạt)</span>
                <span className="help-text">200%+ (dồi dào)</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Plans Grid */}
      <h3 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "0.75rem" }}>
        Kế hoạch tiết kiệm
      </h3>

      <div className="section-grid">
        {plans.map((plan) => {
          const tenorSeconds = BigInt(plan.tenorDays) * 24n * 3600n;
          const samplePrincipal = ethers.parseUnits("10000", 6);
          const estInterest = calculateInterest(samplePrincipal, plan.aprBps, tenorSeconds);

          return (
            <div
              key={plan.id}
              className="card"
              style={{ borderLeft: `4px solid ${plan.enabled ? "var(--success)" : "var(--text-muted)"}` }}
            >
              <div className="card-header">
                <div>
                  <div className="card-title">Kế hoạch #{plan.id}</div>
                  <div className="card-subtitle">{plan.tenorDays} ngày</div>
                </div>
                <span className={`tag ${plan.enabled ? "tag-green" : "tag-gray"}`}>
                  {plan.enabled ? "Đang mở" : "Đã tắt"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">APR</span>
                <span className="info-value green">{(plan.aprBps / 100).toFixed(2)}%</span>
              </div>
              <div className="info-row">
                <span className="info-label">Tối thiểu</span>
                <span className="info-value">{formatUSDC(plan.minDeposit)} USDC</span>
              </div>
              <div className="info-row">
                <span className="info-label">Tối đa</span>
                <span className="info-value">
                  {plan.maxDeposit !== 0n ? `${formatUSDC(plan.maxDeposit)} USDC` : "Không giới hạn"}
                </span>
              </div>
              <div className="info-row">
                <span className="info-label">Phí rút sớm</span>
                <span className="info-value">{(plan.earlyWithdrawPenaltyBps / 100).toFixed(2)}%</span>
              </div>
              <div className="info-row">
                <span className="info-label">Lãi ước tính (10k USDC)</span>
                <span className="info-value green">{formatUSDC(estInterest)} USDC</span>
              </div>
            </div>
          );
        })}

        {plans.length === 0 && !loading && (
          <div className="empty-state section-full">Chưa có kế hoạch nào</div>
        )}
      </div>

      {/* Admin Sections */}
      {isAdmin && (
        <div className="section-grid">
          {/* Left: Plan Management */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quản lý kế hoạch</h3>
              <p className="card-subtitle">{plans.length} kế hoạch đã cấu hình</p>
            </div>

            {plans.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                {plans.map((plan) => (
                  <div key={plan.id} className="info-row" style={{ flexWrap: "wrap", alignItems: "center" }}>
                    <span className="info-label" style={{ minWidth: "auto" }}>Kế hoạch #{plan.id}</span>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", alignItems: "center", flex: 1 }}>
                      <span className="help-text">{plan.tenorDays}d</span>
                      <span className="help-text">{(plan.aprBps / 100).toFixed(2)}%</span>
                      <span className="help-text">{formatUSDC(plan.minDeposit)} USDC</span>
                      <span className="help-text">{plan.maxDeposit !== 0n ? `${formatUSDC(plan.maxDeposit)} USDC` : "∞"}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                      <span className={`tag ${plan.enabled ? "tag-green" : "tag-gray"}`}>
                        {plan.enabled ? "Đang mở" : "Đã tắt"}
                      </span>
                      {plan.enabled ? (
                        <button className="btn-warning btn-sm" onClick={() => handleDisablePlan(plan.id)}>
                          Tắt
                        </button>
                      ) : (
                        <button className="btn-primary btn-sm" onClick={() => handleEnablePlan(plan.id)}>
                          Bật
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="empty-state">{loading ? "Đang tải kế hoạch..." : "Chưa tạo kế hoạch nào"}</div>
            )}

            {/* Create New Plan */}
            <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <h4 className="card-title" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Tạo kế hoạch mới</h4>
              <div className="form-group">
                <label>Kỳ hạn (ngày)</label>
                <input
                  type="number"
                  value={newTenorDays}
                  onChange={(e) => setNewTenorDays(e.target.value)}
                  placeholder="VD: 90"
                />
              </div>
              <div className="form-group">
                <label>Lãi suất (bps)</label>
                <input
                  type="number"
                  value={newAprBps}
                  onChange={(e) => setNewAprBps(e.target.value)}
                  placeholder="VD: 375 = 3.75%"
                />
              </div>
              <div className="form-group">
                <label>Tối thiểu (USDC)</label>
                <input
                  type="number"
                  value={newMinDeposit}
                  onChange={(e) => setNewMinDeposit(e.target.value)}
                  placeholder="VD: 100"
                />
              </div>
              <div className="form-group">
                <label>Tối đa (0 = không giới hạn)</label>
                <input
                  type="number"
                  value={newMaxDeposit}
                  onChange={(e) => setNewMaxDeposit(e.target.value)}
                  placeholder="0 = không giới hạn"
                />
              </div>
              <div className="form-group">
                <label>Phí rút sớm (bps)</label>
                <input
                  type="number"
                  value={newPenaltyBps}
                  onChange={(e) => setNewPenaltyBps(e.target.value)}
                  placeholder="VD: 650"
                />
              </div>
              <button className="btn-primary btn-full" onClick={handleCreatePlan}>
                Tạo kế hoạch
              </button>
            </div>

            {/* Update Plan APR */}
            <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <h4 className="card-title" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Cập nhật lãi suất</h4>
              <div className="form-group">
                <label>Mã kế hoạch</label>
                <input
                  type="number"
                  value={updatePlanId}
                  onChange={(e) => setUpdatePlanId(e.target.value)}
                  placeholder="Mã kế hoạch"
                />
              </div>
              <div className="form-group">
                <label>Lãi suất mới (bps)</label>
                <input
                  type="number"
                  value={updateAprBps}
                  onChange={(e) => setUpdateAprBps(e.target.value)}
                  placeholder="VD: 500 = 5.00%"
                />
              </div>
              <button className="btn-primary btn-full" onClick={handleUpdateApr}>
                Cập nhật
              </button>
            </div>
          </div>

          {/* Right: Vault Operations */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Quản lý quỹ</h3>
              <p className="card-subtitle">Quản lý quỹ và trạng thái hợp đồng</p>
            </div>

            {/* Fund Vault */}
            <div style={{ marginBottom: "1.5rem" }}>
              <h4 className="card-title" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Nạp quỹ</h4>
              <div className="form-group">
                <label>Số tiền (USDC)</label>
                <input
                  type="number"
                  value={fundAmount}
                  onChange={(e) => setFundAmount(e.target.value)}
                  placeholder="Số tiền nạp"
                />
                <span className="form-hint">Cần phê duyệt USDC trước</span>
              </div>
              <button className="btn-success btn-full" onClick={handleFund} disabled={!fundAmount}>
                Nạp quỹ
              </button>
            </div>

            <div style={{ marginBottom: "1.5rem", paddingBottom: "1.5rem", borderBottom: "1px solid var(--border, #e5e7eb)" }}>
              <h4 className="card-title" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Rút quỹ dự trữ</h4>
              <div className="form-group">
                <label>Số tiền (USDC)</label>
                <input
                  type="number"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  placeholder="Số tiền rút"
                />
              </div>
              <button
                className="btn-warning btn-full"
                onClick={handleWithdraw}
                disabled={!withdrawAmount}
              >
                Rút quỹ dự trữ
              </button>
            </div>

            {/* Contract Controls */}
            <div>
              <h4 className="card-title" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Điều khiển hợp đồng</h4>
              <div className="action-row" style={{ gap: "0.75rem" }}>
                <button
                  className={`${corePaused ? "btn-primary" : "btn-danger"} btn-full`}
                  onClick={handleToggleSavingCore}
                >
                  {corePaused ? "Tiếp tục SavingCore" : "Tạm dừng SavingCore"}
                </button>
                <button
                  className={`${vmPaused ? "btn-primary" : "btn-danger"} btn-full`}
                  onClick={handleToggleVaultManager}
                >
                  {vmPaused ? "Tiếp tục VaultManager" : "Tạm dừng VaultManager"}
                </button>
              </div>
              <p className="help-text" style={{ marginTop: "0.75rem" }}>
                Tạm dừng sẽ vô hiệu hóa nạp/rút trên hợp đồng tương ứng.
              </p>
            </div>

            {/* Fee Receiver Management */}
            <div style={{ marginTop: "1.5rem", paddingTop: "1.5rem", borderTop: "1px solid var(--border, #e5e7eb)" }}>
              <h4 className="card-title" style={{ fontSize: "0.875rem", marginBottom: "1rem" }}>Địa chỉ nhận phí rút sớm</h4>
              <div className="form-group">
                <label>Địa chỉ mới</label>
                <input
                  type="text"
                  value={newFeeReceiver}
                  onChange={(e) => setNewFeeReceiver(e.target.value)}
                  placeholder="0x..."
                  style={{ fontFamily: "monospace", fontSize: "0.8rem" }}
                />
                <span className="form-hint">Phí phạt rút sớm sẽ chuyển đến địa chỉ này</span>
              </div>
              <button className="btn-primary btn-full" onClick={handleSetFeeReceiver} disabled={!newFeeReceiver}>
                Cập nhật
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transaction Status */}
      {txStatus && (
        <div
          className={`status-message ${
            txStatus.includes("thất bại") || txStatus.includes("error")
              ? "error"
              : txStatus.includes("...")
              ? "info"
              : "success"
          }`}
        >
          {txStatus}
        </div>
      )}
    </div>
  );
}
