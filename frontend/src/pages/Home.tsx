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
        const [cPaused, vPaused] = await Promise.all([core.paused(), vm.paused()]);
        setCorePaused(cPaused);
        setVmPaused(vPaused);
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
      <div className="stat-cards">
        <div className="stat-card">
          <div className="stat-icon blue">💰</div>
          <div className="stat-info">
            <div className="stat-label">Số dư USDC</div>
            <div className="stat-value">
              {loading ? "..." : usdcBalance !== null ? `${Number(usdcBalance).toLocaleString()}` : "--"}
            </div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">📊</div>
          <div className="stat-info">
            <div className="stat-label">Giao dịch đang active</div>
            <div className="stat-value">{activeDeposits.length}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon yellow">📈</div>
          <div className="stat-info">
            <div className="stat-label">Tổng vốn</div>
            <div className="stat-value">{formatUSDC(totalPrincipal)}</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon green">💎</div>
          <div className="stat-info">
            <div className="stat-label">Lãi ước tính</div>
            <div className="stat-value green">{formatUSDC(totalEstInterest)}</div>
          </div>
        </div>

        {isAdmin && (
          <>
            <div className="stat-card">
              <div className="stat-icon blue">💼</div>
              <div className="stat-info">
                <div className="stat-label">Số dư quỹ</div>
                <div className="stat-value">{vaultHealth ? `${formatUSDC(vaultHealth.balance)} USDC` : "—"}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon green">🏦</div>
              <div className="stat-info">
                <div className="stat-label">Tổng tiền gửi</div>
                <div className="stat-value green">{vaultHealth ? `${formatUSDC(vaultHealth.totalDeposits)} USDC` : "—"}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className="stat-icon yellow">⚠️</div>
              <div className="stat-info">
                <div className="stat-label">Lãi nợ</div>
                <div className="stat-value">{vaultHealth ? `${formatUSDC(vaultHealth.totalOwedInterest)} USDC` : "—"}</div>
              </div>
            </div>
            <div className="stat-card">
              <div className={`stat-icon ${vaultHealth?.isSolvent ? "green" : "red"}`}>✅</div>
              <div className="stat-info">
                <div className="stat-label">Thanh khoản khả dụng</div>
                <div className="stat-value" style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  {vaultHealth ? `${formatUSDC(vaultHealth.availableLiquidity)} USDC` : "—"}
                  {vaultHealth && (
                    <span className={`tag ${vaultHealth.isSolvent ? "tag-green" : "tag-red"}`}>
                      {vaultHealth.isSolvent ? "Đạt" : "Chưa đạt"}
                    </span>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

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
