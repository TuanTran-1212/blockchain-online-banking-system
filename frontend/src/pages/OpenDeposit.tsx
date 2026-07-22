import { useState, useEffect } from "react";
import { ethers } from "ethers";
import {
  fetchPlans,
  type Plan,
  formatUSDC,
  parseUSDC,
  getMockUSDC,
  getSavingCore,
  DECIMALS,
} from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  address: string | null;
  isCorrectNetwork: boolean;
}

export default function OpenDeposit({ provider, signer, address, isCorrectNetwork }: Props) {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [selectedPlan, setSelectedPlan] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState<"idle" | "approving" | "opening" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!provider || !isCorrectNetwork) return;
    fetchPlans(provider).then(setPlans);
  }, [provider, isCorrectNetwork]);

  const enabledPlans = plans.filter((p) => p.enabled);

  const handleOpen = async () => {
    if (!signer || !address || !amount) return;

    const plan = enabledPlans.find((p) => p.id === selectedPlan);
    if (!plan) return;

    const depositAmount = parseUSDC(amount);
    if (depositAmount < plan.minDeposit) {
      setStatus("error");
      setMessage(`Minimum deposit is ${formatUSDC(plan.minDeposit)} USDC`);
      return;
    }
    if (depositAmount > plan.maxDeposit) {
      setStatus("error");
      setMessage(`Maximum deposit is ${formatUSDC(plan.maxDeposit)} USDC`);
      return;
    }

    try {
      setStatus("approving");
      setMessage("Step 1/2: Approving USDC transfer...");

      const usdc = getMockUSDC(signer);
      const core = getSavingCore(signer);

      const approveTx = await usdc.approve(
        await core.getAddress(),
        depositAmount
      );
      await approveTx.wait();

      setStatus("opening");
      setMessage("Step 2/2: Opening deposit...");

      const openTx = await core.openDeposit(selectedPlan, depositAmount);
      await openTx.wait();

      setStatus("success");
      setMessage("Deposit opened successfully! Check My Deposits.");
      setAmount("");
    } catch (err: any) {
      setStatus("error");
      setMessage(err?.reason || err?.message || "Transaction failed");
    }
  };

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h2>Open Deposit</h2>
        <p>Connect MetaMask to Sepolia network.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <h2>Open Deposit</h2>

      <div className="form-group">
        <label>Select Plan</label>
        <select
          value={selectedPlan}
          onChange={(e) => setSelectedPlan(Number(e.target.value))}
        >
          {enabledPlans.map((p) => (
            <option key={p.id} value={p.id}>
              Plan #{p.id} — {p.tenorDays} days, {(p.aprBps / 100).toFixed(2)}% APR
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label>Deposit Amount (USDC)</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Enter amount..."
          min="0"
          step="1"
        />
        {enabledPlans.length > 0 && (
          <div className="hint">
            Min: {formatUSDC(enabledPlans.find((p) => p.id === selectedPlan)?.minDeposit || 0n)} USDC
            {" | Max: "}
            {formatUSDC(enabledPlans.find((p) => p.id === selectedPlan)?.maxDeposit || 0n)} USDC
          </div>
        )}
      </div>

      {enabledPlans.length > 0 && amount && (
        <div className="preview-box">
          <h4>Deposit Preview</h4>
          <div className="plan-row">
            <span>Tenor:</span>
            <span>{enabledPlans.find((p) => p.id === selectedPlan)?.tenorDays} days</span>
          </div>
          <div className="plan-row">
            <span>Interest Rate:</span>
            <span>{((enabledPlans.find((p) => p.id === selectedPlan)?.aprBps || 0) / 100).toFixed(2)}%</span>
          </div>
          <div className="plan-row">
            <span>Early Withdrawal Penalty:</span>
            <span>{((enabledPlans.find((p) => p.id === selectedPlan)?.earlyWithdrawPenaltyBps || 0) / 100).toFixed(2)}%</span>
          </div>
        </div>
      )}

      <button
        className="btn-primary"
        onClick={handleOpen}
        disabled={status === "approving" || status === "opening" || !amount}
      >
        {status === "approving"
          ? "Approving..."
          : status === "opening"
          ? "Opening..."
          : "Open Deposit"}
      </button>

      {message && (
        <div className={`status-message ${status === "success" ? "success" : status === "error" ? "error" : "info"}`}>
          {message}
        </div>
      )}
    </div>
  );
}
