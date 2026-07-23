import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import {
  fetchUserDeposits,
  type Deposit,
  type Plan,
  fetchPlans,
  formatUSDC,
  getSavingCore,
  DEPOSIT_STATUS,
} from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  isCorrectNetwork: boolean;
}

export default function MyDeposits({ provider, signer, address, isCorrectNetwork }: Props) {
  const [deposits, setDeposits] = useState<Deposit[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(false);
  const [txStatus, setTxStatus] = useState<{ id: number; status: string; message: string } | null>(null);
  const [renewPlanId, setRenewPlanId] = useState<{ [depositId: number]: number }>({});

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
      setTxStatus({ id: depositId, status: "withdrawing", message: "Withdrawing..." });
      const core = getSavingCore(signer);
      const tx = await core.withdrawAtMaturity(depositId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Withdrawn successfully!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Transaction failed" });
    }
  };

  const handleRenew = async (depositId: number) => {
    if (!signer) return;
    const newPlanId = renewPlanId[depositId] ?? 0;
    try {
      setTxStatus({ id: depositId, status: "renewing", message: "Renewing..." });
      const core = getSavingCore(signer);
      const tx = await core.renewDeposit(depositId, newPlanId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Renewed successfully!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Transaction failed" });
    }
  };

  const handleEarlyWithdraw = async (depositId: number) => {
    if (!signer) return;
    try {
      setTxStatus({ id: depositId, status: "withdrawing", message: "Early withdrawing..." });
      const core = getSavingCore(signer);
      const tx = await core.earlyWithdraw(depositId);
      await tx.wait();
      setTxStatus({ id: depositId, status: "success", message: "Early withdrawal completed!" });
      loadData();
    } catch (err: any) {
      setTxStatus({ id: depositId, status: "error", message: err?.reason || "Transaction failed" });
    }
  };

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h2>My Deposits</h2>
        <p>Connect MetaMask to Sepolia network.</p>
      </div>
    );
  }

  const activeDeposits = deposits.filter((d) => d.status === 0);
  const completedDeposits = deposits.filter((d) => d.status !== 0);

  return (
    <div className="page">
      <h2>My Deposits</h2>
      <button className="btn-secondary" onClick={loadData} disabled={loading}>
        {loading ? "Loading..." : "Refresh"}
      </button>

      {activeDeposits.length === 0 && completedDeposits.length === 0 && (
        <p className="empty-state">No deposits found.</p>
      )}

      {activeDeposits.length > 0 && (
        <>
          <h3>Active Deposits</h3>
          <div className="deposits-list">
            {activeDeposits.map((d) => {
              const plan = plans.find((p) => p.id === d.planId);
              const now = Math.floor(Date.now() / 1000);
              const isMatured = now >= Number(d.maturityAt);
              const daysLeft = Math.max(0, Math.ceil((Number(d.maturityAt) - now) / 86400));

              return (
                <div key={d.id} className="deposit-card active">
                  <div className="deposit-header">
                    <span className="deposit-id">Deposit #{d.id}</span>
                    <span className="status-badge active">Active</span>
                  </div>
                  <div className="deposit-details">
                    <div className="plan-row">
                      <span>Plan:</span>
                      <span>#{d.planId} ({plan?.tenorDays} days)</span>
                    </div>
                    <div className="plan-row">
                      <span>Principal:</span>
                      <span>{formatUSDC(d.principal)} USDC</span>
                    </div>
                    <div className="plan-row">
                      <span>APR at Open:</span>
                      <span>{(d.aprBpsAtOpen / 100).toFixed(2)}%</span>
                    </div>
                    <div className="plan-row">
                      <span>Start:</span>
                      <span>{new Date(Number(d.startAt) * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="plan-row">
                      <span>Maturity:</span>
                      <span>{new Date(Number(d.maturityAt) * 1000).toLocaleDateString()}</span>
                    </div>
                    <div className="plan-row">
                      <span>Time Remaining:</span>
                      <span className={isMatured ? "matured" : ""}>
                        {isMatured ? "Matured!" : `${daysLeft} days`}
                      </span>
                    </div>
                  </div>
                  <div className="deposit-actions">
                    {isMatured ? (
                      <>
                        <button className="btn-primary" onClick={() => handleWithdraw(d.id)}>
                          Withdraw
                        </button>
                        <select
                          value={renewPlanId[d.id] ?? 0}
                          onChange={(e) => setRenewPlanId({ ...renewPlanId, [d.id]: Number(e.target.value) })}
                        >
                          {plans.filter(p => p.enabled).map(p => (
                            <option key={p.id} value={p.id}>
                              Plan #{p.id} — {p.tenorDays}d, {(p.aprBps / 100).toFixed(2)}%
                            </option>
                          ))}
                        </select>
                        <button className="btn-secondary" onClick={() => handleRenew(d.id)}>
                          Renew
                        </button>
                      </>
                    ) : (
                      <button className="btn-warning" onClick={() => handleEarlyWithdraw(d.id)}>
                        Early Withdraw
                      </button>
                    )}
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
        </>
      )}

      {completedDeposits.length > 0 && (
        <>
          <h3>Completed Deposits</h3>
          <div className="deposits-list">
            {completedDeposits.map((d) => (
              <div key={d.id} className="deposit-card completed">
                <div className="deposit-header">
                  <span className="deposit-id">Deposit #{d.id}</span>
                  <span className="status-badge completed">{DEPOSIT_STATUS[d.status]}</span>
                </div>
                <div className="deposit-details">
                  <div className="plan-row">
                    <span>Plan:</span>
                    <span>#{d.planId}</span>
                  </div>
                  <div className="plan-row">
                    <span>Principal:</span>
                    <span>{formatUSDC(d.principal)} USDC</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
