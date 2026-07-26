import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  fetchUserDeposits,
  type Deposit,
  type Plan,
  fetchPlans,
  formatUSDC,
  parseUSDC,
  getSavingCore,
  calculateInterest,
  DEPOSIT_STATUS,
} from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  isCorrectNetwork: boolean;
}

const GRACE_PERIOD_DAYS = 3;
const GRACE_PERIOD_SECONDS = GRACE_PERIOD_DAYS * 86400;

export default function MyDeposits({
  provider,
  signer,
  address,
  isCorrectNetwork,
}: Props) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{
    id: number;
    status: string;
    message: string;
  } | null>(null);
  const [renewPlanId, setRenewPlanId] = useState<{ [depositId: number]: number }>({});
  const [partialAmount, setPartialAmount] = useState<{ [depositId: number]: string }>({});

  const loadData = useCallback(async () => {
    if (!provider || !address || !isCorrectNetwork) return;
    setLoading(true);
    try {
      const [d, p] = await Promise.all([
        fetchUserDeposits(provider, address),
        fetchPlans(provider),
      ]);
      setDeposits(d);
      setPlans(p);
    } catch (err) {
      console.error("Failed to load deposits:", err);
    } finally {
      setLoading(false);
    }
  }, [provider, address, isCorrectNetwork]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleWithdraw = async (depositId: number) => {
    if (!signer) return;
    try {
      setTxStatus({ id: depositId, status: "withdrawing", message: "Đang rút tiền..." });
      const core = getSavingCore(signer);
      const tx = await core.withdrawAtMaturity(depositId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Rút tiền thành công!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Giao dịch thất bại" });
    }
  };

  const handleRenew = async (depositId: number) => {
    if (!signer) return;
    const newPlanId = renewPlanId[depositId] ?? 0;
    try {
      setTxStatus({ id: depositId, status: "renewing", message: "Đang gia hạn..." });
      const core = getSavingCore(signer);
      const tx = await core.renewDeposit(depositId, newPlanId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Gia hạn thành công!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Giao dịch thất bại" });
    }
  };

  const handleAutoRenew = async (depositId: number) => {
    if (!signer) return;
    try {
      setTxStatus({ id: depositId, status: "renewing", message: "Đang tự động gia hạn..." });
      const core = getSavingCore(signer);
      const tx = await core.autoRenewDeposit(depositId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Tự động gia hạn thành công!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Giao dịch thất bại" });
    }
  };

  const handleEarlyWithdraw = async (depositId: number) => {
    if (!signer) return;
    try {
      setTxStatus({ id: depositId, status: "withdrawing", message: "Đang rút trước hạn..." });
      const core = getSavingCore(signer);
      const tx = await core.earlyWithdraw(depositId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Rút trước hạn thành công!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Giao dịch thất bại" });
    }
  };

  const handlePartialEarlyWithdraw = async (depositId: number) => {
    if (!signer) return;
    const amountStr = partialAmount[depositId];
    if (!amountStr || Number(amountStr) <= 0) {
      setTxStatus({ id: depositId, status: "error", message: "Nhập số tiền hợp lệ" });
      return;
    }
    const amount = parseUSDC(amountStr);
    try {
      setTxStatus({ id: depositId, status: "withdrawing", message: "Đang rút trước hạn một phần..." });
      const core = getSavingCore(signer);
      const tx = await core.partialEarlyWithdraw(depositId, amount);
      await tx.wait();
      setTxStatus({
        id: depositId,
        status: "success",
        message: "Rút trước hạn một phần thành công!",
      });
      setPartialAmount({ ...partialAmount, [depositId]: "" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Giao dịch thất bại" });
    }
  };

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h1 className="page-title">Giao dịch của tôi</h1>
        <p className="help-text">Kết nối MetaMask với mạng Sepolia.</p>
      </div>
    );
  }

  const activeDeposits = deposits.filter((d) => d.status === 0);
  const completedDeposits = deposits.filter((d) => d.status !== 0);

  const now = Math.floor(Date.now() / 1000);

  return (
    <div className="page">
      <div className="deposit-card-v2" style={{ marginBottom: 0, padding: 0 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "1.25rem 1.5rem",
          }}
        >
          <h1 className="page-title" style={{ margin: 0 }}>
            Giao dịch của tôi
          </h1>
          <button className="btn-secondary btn-sm" onClick={loadData} disabled={loading}>
            {loading ? "Đang tải..." : "Làm mới"}
          </button>
        </div>
      </div>

      {activeDeposits.length === 0 && completedDeposits.length === 0 && !loading && (
        <p className="empty-state">Chưa có giao dịch nào.</p>
      )}

      {activeDeposits.length > 0 && (
        <div className="section-grid" style={{ marginTop: "1.5rem" }}>
          {activeDeposits.map((d) => {
            const maturityTs = Number(d.maturityAt);
            const startTs = Number(d.startAt);
            const isMatured = now >= maturityTs;
            const daysLeft = Math.max(0, Math.ceil((maturityTs - now) / 86400));
            const autoRenewEligibleAt = maturityTs + GRACE_PERIOD_SECONDS;
            const isAutoRenewEligible = now >= autoRenewEligibleAt;
            const daysUntilAutoRenew = Math.max(
              0,
              Math.ceil((autoRenewEligibleAt - now) / 86400)
            );
            const tenorSeconds = d.maturityAt - d.startAt;
            const estInterest = calculateInterest(
              d.principal,
              d.aprBpsAtOpen,
              tenorSeconds
            );

            const partialVal = Number(partialAmount[d.id] || "0");
            const partialBigInt = partialVal > 0 ? parseUSDC(String(partialVal)) : 0n;
            const penaltyBps = BigInt(d.penaltyBpsAtOpen);
            const penaltyAmount = (partialBigInt * penaltyBps) / 10000n;
            const userPayout = partialBigInt - penaltyAmount;
            const remaining = d.principal - partialBigInt;
            const showPartialCalc =
              partialVal > 0 && partialBigInt > 0n && partialBigInt <= d.principal;

            return (
              <div key={d.id} className="deposit-card-v2 section-full">
                <div className="deposit-top">
                  <span className="tag tag-blue">Giao dịch #{d.id}</span>
                  {isMatured ? (
                    <span className="tag tag-yellow">Đã đáo hạn</span>
                  ) : (
                    <span className="tag tag-green">Đang gửi</span>
                  )}
                </div>
                <div className="deposit-body">
                  <div className="deposit-info">
                    <div className="info-row">
                      <span className="info-label">Vốn</span>
                      <span className="info-value">{formatUSDC(d.principal)} USDC</span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Lãi suất</span>
                      <span className="info-value">
                        {(d.aprBpsAtOpen / 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Lãi ước tính</span>
                      <span className="info-value green">
                        {formatUSDC(estInterest)} USDC
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Ngày gửi</span>
                      <span className="info-value">
                        {new Date(startTs * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Ngày đáo hạn</span>
                      <span className="info-value">
                        {new Date(maturityTs * 1000).toLocaleDateString()}
                      </span>
                    </div>
                    <div className="info-row">
                      <span className="info-label">Còn lại</span>
                      <span className="info-value">
                        {isMatured ? (
                          <span className="tag tag-yellow" style={{ marginLeft: 0 }}>
                            Đã đáo hạn!
                          </span>
                        ) : (
                          `${daysLeft} ngày`
                        )}
                      </span>
                    </div>
                  </div>
                  <div className="deposit-actions">
                    {isMatured ? (
                      <>
                        <button
                          className="btn-success btn-full"
                          onClick={() => handleWithdraw(d.id)}
                        >
                          Rút tiền
                        </button>
                        <div className="action-divider" />
                        <div className="form-group">
                          <label>Gia hạn sang kế hoạch</label>
                          <select
                            value={renewPlanId[d.id] ?? 0}
                            onChange={(e) =>
                              setRenewPlanId({
                                ...renewPlanId,
                                [d.id]: Number(e.target.value),
                              })
                            }
                          >
                            {plans
                              .filter((p) => p.enabled)
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  Kế hoạch #{p.id} — {p.tenorDays}ngày,{" "}
                                  {(p.aprBps / 100).toFixed(2)}%
                                </option>
                              ))}
                          </select>
                        </div>
                        <button
                          className="btn-primary btn-full"
                          onClick={() => handleRenew(d.id)}
                        >
                          Gia hạn
                        </button>
                        <div className="action-divider" />
                        {isAutoRenewEligible ? (
                          <button
                            className="btn-warning btn-full"
                            onClick={() => handleAutoRenew(d.id)}
                          >
                            Tự động gia hạn
                          </button>
                        ) : (
                          <p className="form-hint">
                            Tự động gia hạn sau {daysUntilAutoRenew} ngày (thời hạn ân hạn)
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        <button
                          className="btn-warning btn-full"
                          onClick={() => handleEarlyWithdraw(d.id)}
                        >
                          Rút trước hạn
                        </button>
                        <div className="action-divider" />
                        <div className="form-group">
                          <label>Rút một phần từ vốn</label>
                          <input
                            type="number"
                            value={partialAmount[d.id] ?? ""}
                            onChange={(e) =>
                              setPartialAmount({
                                ...partialAmount,
                                [d.id]: e.target.value,
                              })
                            }
                            placeholder="0.00"
                            min="0"
                          />
                          <span className="form-hint">USDC</span>
                        </div>
                        {showPartialCalc && (
                          <p className="help-text">
                            Phí phạt: {(Number(penaltyBps) / 100).toFixed(2)}% → Bạn
                            nhận: {formatUSDC(userPayout)} USDC | Còn lại:{" "}
                            {formatUSDC(remaining)} USDC
                          </p>
                        )}
                        <button
                          className="btn-primary btn-full"
                          onClick={() => handlePartialEarlyWithdraw(d.id)}
                          disabled={
                            !partialAmount[d.id] ||
                            Number(partialAmount[d.id]) <= 0
                          }
                        >
                          Rút một phần
                        </button>
                      </>
                    )}
                  </div>
                </div>
                {txStatus?.id === d.id && (
                  <div className={`status-message ${txStatus.status}`}>
                    {txStatus.message}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {completedDeposits.length > 0 && (
        <div className="section-grid" style={{ marginTop: "1.5rem" }}>
          {completedDeposits.map((d) => (
            <div key={d.id} className="deposit-card-v2 section-full">
              <div className="deposit-top">
                <span className="tag tag-blue">Giao dịch #{d.id}</span>
                <span className="tag tag-gray">
                  {DEPOSIT_STATUS[d.status]}
                </span>
              </div>
              <div className="deposit-body">
                <div className="deposit-info">
                  <div className="info-row">
                    <span className="info-label">Vốn</span>
                    <span className="info-value">{formatUSDC(d.principal)} USDC</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Kế hoạch</span>
                    <span className="info-value">#{d.planId}</span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Ngày gửi</span>
                    <span className="info-value">
                      {new Date(Number(d.startAt) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="info-row">
                    <span className="info-label">Ngày đáo hạn</span>
                    <span className="info-value">
                      {new Date(Number(d.maturityAt) * 1000).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
