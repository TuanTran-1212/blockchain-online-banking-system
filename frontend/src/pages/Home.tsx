import { useState, useEffect } from "react";
import { ethers } from "ethers";
import { fetchPlans, type Plan, formatUSDC, getVaultManager } from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  address: string | null;
  isCorrectNetwork: boolean;
}

export default function Home({ provider, address, isCorrectNetwork }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [vaultBalance, setVaultBalance] = useState<string>("0");

  useEffect(() => {
    if (!provider || !isCorrectNetwork) return;
    (async () => {
      const p = await fetchPlans(provider);
      setPlans(p);
      const vm = getVaultManager(provider);
      const bal = await vm.vaultBalance();
      setVaultBalance(formatUSDC(bal));
    })();
  }, [provider, isCorrectNetwork]);

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h2>Online Banking System</h2>
        <p>Connect MetaMask to Sepolia network to view deposit plans.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Deposit Plans</h2>
      <div className="info-box">
        <strong>Vault Balance:</strong> {Number(vaultBalance).toLocaleString()} USDC
      </div>

      <div className="plans-grid">
        {plans.filter(pl => pl.enabled).map((plan) => (
          <div key={plan.id} className="plan-card">
            <h3>Plan #{plan.id}</h3>
            <div className="plan-details">
              <div className="plan-row">
                <span>Tenor:</span>
                <span><strong>{plan.tenorDays}</strong> days</span>
              </div>
              <div className="plan-row">
                <span>APR:</span>
                <span className="apr">{(plan.aprBps / 100).toFixed(2)}%</span>
              </div>
              <div className="plan-row">
                <span>Min Deposit:</span>
                <span>{formatUSDC(plan.minDeposit)} USDC</span>
              </div>
              <div className="plan-row">
                <span>Max Deposit:</span>
                <span>{formatUSDC(plan.maxDeposit)} USDC</span>
              </div>
              <div className="plan-row">
                <span>Early Withdrawal Penalty:</span>
                <span>{(plan.earlyWithdrawPenaltyBps / 100).toFixed(2)}%</span>
              </div>
            </div>
            <div className="plan-status enabled">Enabled</div>
          </div>
        ))}
      </div>

      {plans.filter(pl => pl.enabled).length === 0 && (
        <p className="empty-state">No active plans available.</p>
      )}

      {address && (
        <div className="info-box" style={{ marginTop: "1rem" }}>
          <strong>Connected:</strong> {address.slice(0, 6)}...{address.slice(-4)}
        </div>
      )}
    </div>
  );
}
