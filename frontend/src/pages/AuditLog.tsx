import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { formatUSDC, getSavingCore, getVaultManager } from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  isCorrectNetwork: boolean;
}

interface LogEntry {
  blockNumber: number;
  eventName: string;
  details: string;
  timestamp: string;
  txHash: string;
}

const EVENT_TAG_CLASS: Record<string, string> = {
  DepositOpened: "tag tag-green",
  DepositWithdrawn: "tag tag-blue",
  DepositEarlyWithdrawn: "tag tag-red",
  DepositRenewed: "tag tag-yellow",
  DepositPartialEarlyWithdrawn: "tag tag-yellow",
  PlanCreated: "tag tag-gray",
  PlanAprUpdated: "tag tag-gray",
  PlanEnabled: "tag tag-gray",
  PlanDisabled: "tag tag-gray",
  VaultFunded: "tag tag-green",
  VaultWithdrawn: "tag tag-red",
};

export default function AuditLog({ provider, isCorrectNetwork }: Props) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialErrors, setPartialErrors] = useState<string[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const fetchLogs = useCallback(async () => {
    if (!provider || !isCorrectNetwork) return;
    setLoading(true);
    setError(null);
    setPartialErrors([]);

    try {
      const core = getSavingCore(provider);
      const vm = getVaultManager(provider);

      const allRaw: Array<{
        blockNumber: number;
        eventName: string;
        details: string;
        txHash: string;
      }> = [];

      const failedTypes: string[] = [];

      const safeQuery = async (
        label: string,
        fn: () => Promise<ethers.EventLog[] | ethers.Log[]>
      ) => {
        try {
          return await fn();
        } catch (err: any) {
          console.warn(`Failed to query ${label}:`, err);
          failedTypes.push(label);
          return [] as ethers.EventLog[];
        }
      };

      const openedEvents = await safeQuery("DepositOpened", () =>
        core.queryFilter(core.filters.DepositOpened())
      );
      const withdrawnEvents = await safeQuery("DepositWithdrawn", () =>
        core.queryFilter(core.filters.DepositWithdrawn())
      );
      const earlyWithdrawnEvents = await safeQuery("DepositEarlyWithdrawn", () =>
        core.queryFilter(core.filters.DepositEarlyWithdrawn())
      );
      const renewedEvents = await safeQuery("DepositRenewed", () =>
        core.queryFilter(core.filters.DepositRenewed())
      );
      const partialEvents = await safeQuery("DepositPartialEarlyWithdrawn", () =>
        core.queryFilter(core.filters.DepositPartialEarlyWithdrawn())
      );
      const planCreatedEvents = await safeQuery("PlanCreated", () =>
        core.queryFilter(core.filters.PlanCreated())
      );
      const planAprUpdatedEvents = await safeQuery("PlanAprUpdated", () =>
        core.queryFilter(core.filters.PlanAprUpdated())
      );
      const planEnabledEvents = await safeQuery("PlanEnabled", () =>
        core.queryFilter(core.filters.PlanEnabled())
      );
      const planDisabledEvents = await safeQuery("PlanDisabled", () =>
        core.queryFilter(core.filters.PlanDisabled())
      );
      const vaultFundedEvents = await safeQuery("VaultFunded", () =>
        vm.queryFilter(vm.filters.VaultFunded())
      );
      const vaultWithdrawnEvents = await safeQuery("VaultWithdrawn", () =>
        vm.queryFilter(vm.filters.VaultWithdrawn())
      );

      for (const e of openedEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "DepositOpened",
          details: `Giao dịch #${e.args.depositId}, Kế hoạch #${e.args.planId}, Vốn: ${formatUSDC(e.args.principal)} USDC`,
          txHash: e.transactionHash,
        });
      }

      for (const e of withdrawnEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "DepositWithdrawn",
          details: `Giao dịch #${e.args.depositId}, Vốn: ${formatUSDC(e.args.principal)} USDC, Lãi: ${formatUSDC(e.args.interest)} USDC`,
          txHash: e.transactionHash,
        });
      }

      for (const e of earlyWithdrawnEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "DepositEarlyWithdrawn",
          details: `Giao dịch #${e.args.depositId}, Vốn: ${formatUSDC(e.args.principal)} USDC, Phí phạt: ${formatUSDC(e.args.penalty)} USDC`,
          txHash: e.transactionHash,
        });
      }

      for (const e of renewedEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "DepositRenewed",
          details: `Cũ #${e.args.oldDepositId} → Mới #${e.args.newDepositId}, Vốn: ${formatUSDC(e.args.newPrincipal)} USDC`,
          txHash: e.transactionHash,
        });
      }

      for (const e of partialEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "DepositPartialEarlyWithdrawn",
          details: `Giao dịch #${e.args.depositId}, Rút: ${formatUSDC(e.args.withdrawAmount)} USDC, Phí phạt: ${formatUSDC(e.args.penalty)} USDC`,
          txHash: e.transactionHash,
        });
      }

      for (const e of planCreatedEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "PlanCreated",
          details: `Kế hoạch #${e.args.planId}, Kỳ hạn: ${e.args.tenorDays} ngày, Lãi suất: ${Number(e.args.aprBps) / 100}%`,
          txHash: e.transactionHash,
        });
      }

      for (const e of planAprUpdatedEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "PlanAprUpdated",
          details: `Kế hoạch #${e.args.planId}, Lãi cũ: ${Number(e.args.oldApr) / 100}%, Lãi mới: ${Number(e.args.newApr) / 100}%`,
          txHash: e.transactionHash,
        });
      }

      for (const e of planEnabledEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "PlanEnabled",
          details: `Kế hoạch #${e.args.planId}`,
          txHash: e.transactionHash,
        });
      }

      for (const e of planDisabledEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "PlanDisabled",
          details: `Kế hoạch #${e.args.planId}`,
          txHash: e.transactionHash,
        });
      }

      for (const e of vaultFundedEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "VaultFunded",
          details: `Chủ: ${String(e.args.owner).slice(0, 10)}..., Số tiền: ${formatUSDC(e.args.amount)} USDC`,
          txHash: e.transactionHash,
        });
      }

      for (const e of vaultWithdrawnEvents as ethers.EventLog[]) {
        allRaw.push({
          blockNumber: e.blockNumber,
          eventName: "VaultWithdrawn",
          details: `Chủ: ${String(e.args.owner).slice(0, 10)}..., Số tiền: ${formatUSDC(e.args.amount)} USDC`,
          txHash: e.transactionHash,
        });
      }

      const uniqueBlocks = [...new Set(allRaw.map((e) => e.blockNumber))];
      const blockTimestamps: Record<number, number> = {};
      await Promise.all(
        uniqueBlocks.map(async (bn) => {
          try {
            const block = await provider!.getBlock(bn);
            if (block) blockTimestamps[bn] = block.timestamp;
          } catch {
            // ignore block fetch errors
          }
        })
      );

      const logsWithTime: LogEntry[] = allRaw
        .map((e) => ({
          ...e,
          timestamp: blockTimestamps[e.blockNumber]
            ? new Date(blockTimestamps[e.blockNumber] * 1000).toLocaleString()
            : "Không xác định",
        }))
        .sort((a, b) => b.blockNumber - a.blockNumber);

      setLogs(logsWithTime);

      if (failedTypes.length > 0) {
        setPartialErrors([
          `Tải thất bại: ${failedTypes.join(", ")}. Các sự kiện khác tải thành công.`,
        ]);
      }
    } catch (err: any) {
      console.error("Failed to load audit log:", err);
      setError(err?.message || "Tải nhật ký giao dịch thất bại");
    } finally {
      setLoading(false);
    }
  }, [provider, isCorrectNetwork]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs, refreshKey]);

  const handleRefresh = () => {
    setRefreshKey((k) => k + 1);
  };

  if (!provider || !isCorrectNetwork) {
    return (
      <div className="page">
        <h2 className="page-title">Nhật ký giao dịch</h2>
        <p>Kết nối MetaMask với mạng Sepolia.</p>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="card-header" style={{ marginBottom: "1rem" }}>
        <h2 className="page-title">Nhật ký giao dịch</h2>
        <button
          className="btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {loading && <p className="status-message info">Đang tải sự kiện...</p>}

      {error && (
        <div className="status-message error" style={{ marginBottom: "1rem" }}>
          {error}
        </div>
      )}

      {partialErrors.length > 0 && (
        <div className="status-message error" style={{ marginBottom: "1rem" }}>
          {partialErrors.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      {!loading && logs.length === 0 && (
        <div className="card">
          <p className="empty-state">
            Chưa có sự kiện nào. Các giao dịch gửi, rút và thao tác quỹ sẽ
            hiển thị tại đây khi có hoạt động trên hợp đồng.
          </p>
        </div>
      )}

      {logs.length > 0 && (
        <div className="card">
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Khối #</th>
                  <th>Sự kiện</th>
                  <th>Chi tiết</th>
                  <th>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log, idx) => (
                  <tr key={idx}>
                    <td style={{ fontFamily: "monospace" }}>{log.blockNumber}</td>
                    <td>
                      <span className={EVENT_TAG_CLASS[log.eventName] || "tag tag-gray"}>
                        {log.eventName}
                      </span>
                    </td>
                    <td>{log.details}</td>
                    <td>{log.timestamp}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
