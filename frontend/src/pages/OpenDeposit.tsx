import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  fetchPlans,
  fetchUSDCBalance,
  type Plan,
  formatUSDC,
  parseUSDC,
  getMockUSDC,
  getSavingCore,
  calculateInterest,
} from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  isCorrectNetwork: boolean;
}

export default function OpenDeposit({
  provider,
  signer,
  address,
  isCorrectNetwork,
}: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "approving" | "opening" | "success" | "error">("idle");
  const [message, setMessage] = useState("");
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);

  useEffect(() => {
    if (!provider || !isCorrectNetwork) return;
    fetchPlans(provider).then((p) => {
      setPlans(p);
      const enabled = p.filter((pl) => pl.enabled);
      if (enabled.length > 0 && selectedPlan === 0) {
        setSelectedPlan(enabled[0].id);
      }
    });
  }, [provider, isCorrectNetwork]);

  useEffect(() => {
    if (!provider || !address) return;
    fetchUSDCBalance(provider, address)
      .then((bal) => setUsdcBalance(formatUSDC(bal)))
      .catch(() => setUsdcBalance(null));
  }, [provider, address]);

  const enabledPlans = plans.filter((p) => p.enabled);
  const selectedPlanData = enabledPlans.find((p) => p.id === selectedPlan);

  const estimatedInterest =
    selectedPlanData && amount && Number(amount) > 0
      ? calculateInterest(parseUSDC(amount), selectedPlanData.aprBps, BigInt(selectedPlanData.tenorDays) * 24n * 3600n)
      : null;

  const totalAtMaturity =
    estimatedInterest !== null ? parseUSDC(amount) + estimatedInterest : null;

  const earlyPenaltyExample =
    selectedPlanData && estimatedInterest
      ? (parseUSDC(amount) * BigInt(selectedPlanData.earlyWithdrawPenaltyBps)) / 10000n
      : null;

  const insufficientBalance =
    usdcBalance !== null && amount ? Number(usdcBalance) < Number(amount) : false;

  const handleOpen = async () => {
    if (!signer || !address || !amount) return;
    const plan = enabledPlans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    const depositAmount = parseUSDC(amount);
    if (depositAmount < plan.minDeposit) {
      setStatus("error");
      setMessage(`Số tiền gửi tối thiểu là ${formatUSDC(plan.minDeposit)} USDC`);
      return;
    }
    if (plan.maxDeposit !== 0n && depositAmount > plan.maxDeposit) {
      setStatus("error");
      setMessage(`Số tiền gửi tối đa là ${formatUSDC(plan.maxDeposit)} USDC`);
      return;
    }

    try {
      setStatus("approving");
      setMessage("Bước 1/2: Đang phê duyệt chuyển USDC...");

      const usdc = getMockUSDC(signer);
      const core = getSavingCore(signer);
      const approveTx = await usdc.approve(await core.getAddress(), depositAmount);
      await approveTx.wait();

      setStatus("opening");
      setMessage("Bước 2/2: Đang mở tiết kiệm...");

      const openTx = await core.openDeposit(selectedPlan, depositAmount);
      await openTx.wait();

      setStatus("success");
      setMessage("Gửi tiết kiệm thành công! Xem Giao dịch của tôi.");
      setAmount("");
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.reason || err?.message || "Giao dịch thất bại");
    }
  };

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h2 className="page-title">Gửi tiết kiệm</h2>
        <p style={{ color: "var(--text-muted)" }}>Kết nối MetaMask với mạng Sepolia.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2 className="page-title">Gửi tiết kiệm mới</h2>

      <div className="section-grid">
        {/* Left: Form */}
        <div className="card">
          <div className="card-header">
            <div className="card-title">Chi tiết gửi</div>
          </div>

          <div className="form-group">
            <label>Chọn kế hoạch</label>
            <select
              value={selectedPlan}
              onChange={(e) => setSelectedPlan(Number(e.target.value))}
            >
              {enabledPlans.map((p) => (
                <option key={p.id} value={p.id}>
                  Kế hoạch #{p.id} — {p.tenorDays} ngày, {(p.aprBps / 100).toFixed(2)}% APR
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label>Số tiền gửi (USDC)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Nhập số tiền..."
              min="0"
              step="1"
            />
            {usdcBalance !== null && (
              <div className="form-hint">
                Số dư: {Number(usdcBalance).toLocaleString()} USDC
              </div>
            )}
            {insufficientBalance && (
              <div className="form-hint" style={{ color: "var(--danger)" }}>
                Số dư không đủ
              </div>
            )}
          </div>

          {selectedPlanData && (
            <div className="help-text-blue">
              Tối thiểu: {formatUSDC(selectedPlanData.minDeposit)} USDC
              {selectedPlanData.maxDeposit !== 0n
                ? ` | Tối đa: ${formatUSDC(selectedPlanData.maxDeposit)} USDC`
                : " | Tối đa: Không giới hạn"}
            </div>
          )}

          <div style={{ marginTop: "1rem" }}>
            <button
              className="btn-primary btn-full"
              onClick={handleOpen}
              disabled={status === "approving" || status === "opening" || !amount || insufficientBalance}
            >
              {status === "approving"
                ? "Đang phê duyệt USDC..."
                : status === "opening"
                ? "Đang gửi tiết kiệm..."
                : "Gửi tiết kiệm"}
            </button>
          </div>

          {message && (
            <div
              className={`status-message ${
                status === "success" ? "success" : status === "error" ? "error" : "info"
              }`}
            >
              {message}
            </div>
          )}
        </div>

        {/* Right: Preview */}
        {selectedPlanData && amount && Number(amount) > 0 && estimatedInterest !== null ? (
          <div className="preview-panel">
            <h4>Tóm tắt</h4>

            <div className="info-row">
              <span className="info-label">Kế hoạch</span>
              <span className="info-value">#{selectedPlanData.id} — {selectedPlanData.tenorDays} ngày</span>
            </div>
            <div className="info-row">
              <span className="info-label">APR</span>
              <span className="info-value green">{(selectedPlanData.aprBps / 100).toFixed(2)}%</span>
            </div>
            <div className="info-row">
              <span className="info-label">Phí rút sớm</span>
              <span className="info-value">{(selectedPlanData.earlyWithdrawPenaltyBps / 100).toFixed(2)}%</span>
            </div>

            <div style={{ borderTop: "1px dashed #bfdbfe", margin: "0.75rem 0" }} />

            <div className="preview-label">Lãi ước tính</div>
            <div className="preview-big">{formatUSDC(estimatedInterest)} USDC</div>

            <div className="info-row" style={{ marginTop: "0.5rem" }}>
              <span className="info-label">Tổng khi đáo hạn</span>
              <span className="info-value" style={{ fontSize: "1.1rem" }}>
                {formatUSDC(totalAtMaturity!)} USDC
              </span>
            </div>

            {earlyPenaltyExample !== null && (
              <div className="help-text" style={{ marginTop: "0.75rem" }}>
                Phí rút sớm: bạn mất {formatUSDC(earlyPenaltyExample)} USDC trên khoản gửi {Number(amount).toLocaleString()} USDC.
              </div>
            )}
          </div>
        ) : (
          <div className="card" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
            <p style={{ color: "var(--text-muted)", textAlign: "center" }}>
              Chọn kế hoạch và nhập số tiền để xem tóm tắt.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
