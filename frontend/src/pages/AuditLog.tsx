import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { formatUSDC, getSavingCore, getVaultManager } from "../config/contracts";

interface Props {
  provider: ethers.BrowserProvider | null;
  isCorrectNetwork: boolean;
  address: string | null;
  isAdmin: boolean;
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

const RPC_TIMEOUT_MS = 15000;
const SCAN_BLOCKS = 10000;
const CHUNK_SIZE = 2000;
const TIMESTAMP_BATCH = 20;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}: timeout ${ms / 1000}s`)), ms)
    ),
  ]);
}

async function fetchTimestampsBatched(
  provider: ethers.Provider,
  blockNumbers: number[]
): Promise<Record<number, number>> {
  const timestamps: Record<number, number> = {};
  for (let i = 0; i < blockNumbers.length; i += TIMESTAMP_BATCH) {
    const batch = blockNumbers.slice(i, i + TIMESTAMP_BATCH);
    await Promise.allSettled(
      batch.map(async (bn) => {
        try {
          const block = await withTimeout(provider.getBlock(bn), RPC_TIMEOUT_MS, `block#${bn}`);
          if (block) timestamps[bn] = block.timestamp;
        } catch {}
      })
    );
  }
  return timestamps;
}

export default function AuditLog({ provider, isCorrectNetwork, address, isAdmin }: Props) {
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

      const latestBlock = await withTimeout(
        provider.getBlockNumber(),
        RPC_TIMEOUT_MS,
        "getBlockNumber"
      );
      const fromBlock = Math.max(0, latestBlock - SCAN_BLOCKS);

      const ranges: Array<{ from: number; to: number }> = [];
      for (let start = fromBlock; start <= latestBlock; start += CHUNK_SIZE) {
        ranges.push({ from: start, to: Math.min(start + CHUNK_SIZE - 1, latestBlock) });
      }

      const queryAllRanges = async (
        label: string,
        filterFn: (from: number, to: number) => Promise<ethers.EventLog[] | ethers.Log[]>
      ): Promise<ethers.EventLog[]> => {
        const results: ethers.EventLog[] = [];
        for (const range of ranges) {
          try {
            const events = await withTimeout(
              filterFn(range.from, range.to),
              RPC_TIMEOUT_MS,
              `${label}#${range.from}-${range.to}`
            );
            results.push(...(events as ethers.EventLog[]));
          } catch (err: any) {
            console.warn(`${label} chunk failed:`, err.message);
          }
        }
        return results;
      };

      const failedTypes: string[] = [];
      const getEvents = (result: PromiseSettledResult<ethers.EventLog[]>, label: string): ethers.EventLog[] => {
        if (result.status === "fulfilled") return result.value;
        failedTypes.push(label);
        return [];
      };

      const allRaw: Array<{
        blockNumber: number;
        eventName: string;
        details: string;
        txHash: string;
      }> = [];

      if (isAdmin) {
        const [
          openedEvents,
          withdrawnEvents,
          earlyWithdrawnEvents,
          renewedEvents,
          partialEvents,
          planCreatedEvents,
          planAprUpdatedEvents,
          planEnabledEvents,
          planDisabledEvents,
          vaultFundedEvents,
          vaultWithdrawnEvents,
        ] = await Promise.allSettled([
          queryAllRanges("DepositOpened", (f, t) => core.queryFilter(core.filters.DepositOpened(), f, t)),
          queryAllRanges("DepositWithdrawn", (f, t) => core.queryFilter(core.filters.DepositWithdrawn(), f, t)),
          queryAllRanges("DepositEarlyWithdrawn", (f, t) => core.queryFilter(core.filters.DepositEarlyWithdrawn(), f, t)),
          queryAllRanges("DepositRenewed", (f, t) => core.queryFilter(core.filters.DepositRenewed(), f, t)),
          queryAllRanges("DepositPartialEarlyWithdrawn", (f, t) => core.queryFilter(core.filters.DepositPartialEarlyWithdrawn(), f, t)),
          queryAllRanges("PlanCreated", (f, t) => core.queryFilter(core.filters.PlanCreated(), f, t)),
          queryAllRanges("PlanAprUpdated", (f, t) => core.queryFilter(core.filters.PlanAprUpdated(), f, t)),
          queryAllRanges("PlanEnabled", (f, t) => core.queryFilter(core.filters.PlanEnabled(), f, t)),
          queryAllRanges("PlanDisabled", (f, t) => core.queryFilter(core.filters.PlanDisabled(), f, t)),
          queryAllRanges("VaultFunded", (f, t) => vm.queryFilter(vm.filters.VaultFunded(), f, t)),
          queryAllRanges("VaultWithdrawn", (f, t) => vm.queryFilter(vm.filters.VaultWithdrawn(), f, t)),
        ]);

        for (const e of getEvents(openedEvents, "DepositOpened")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositOpened",
            details: `Giao dịch #${e.args.depositId}, Kế hoạch #${e.args.planId}, Người gửi: ${String(e.args.owner).slice(0, 8)}..., Vốn: ${formatUSDC(e.args.principal)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(withdrawnEvents, "DepositWithdrawn")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositWithdrawn",
            details: `Giao dịch #${e.args.depositId}, Vốn: ${formatUSDC(e.args.principal)} USDC, Lãi: ${formatUSDC(e.args.interest)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(earlyWithdrawnEvents, "DepositEarlyWithdrawn")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositEarlyWithdrawn",
            details: `Giao dịch #${e.args.depositId}, Vốn: ${formatUSDC(e.args.principal)} USDC, Phí phạt: ${formatUSDC(e.args.penalty)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(renewedEvents, "DepositRenewed")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositRenewed",
            details: `Cũ #${e.args.oldDepositId} → Mới #${e.args.newDepositId}, Vốn: ${formatUSDC(e.args.newPrincipal)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(partialEvents, "DepositPartialEarlyWithdrawn")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositPartialEarlyWithdrawn",
            details: `Giao dịch #${e.args.depositId}, Rút: ${formatUSDC(e.args.withdrawAmount)} USDC, Phí phạt: ${formatUSDC(e.args.penalty)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(planCreatedEvents, "PlanCreated")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "PlanCreated",
            details: `Kế hoạch #${e.args.planId}, Kỳ hạn: ${e.args.tenorDays} ngày, Lãi suất: ${Number(e.args.aprBps) / 100}%`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(planAprUpdatedEvents, "PlanAprUpdated")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "PlanAprUpdated",
            details: `Kế hoạch #${e.args.planId}, Lãi cũ: ${Number(e.args.oldApr) / 100}%, Lãi mới: ${Number(e.args.newApr) / 100}%`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(planEnabledEvents, "PlanEnabled")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "PlanEnabled",
            details: `Kế hoạch #${e.args.planId}`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(planDisabledEvents, "PlanDisabled")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "PlanDisabled",
            details: `Kế hoạch #${e.args.planId}`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(vaultFundedEvents, "VaultFunded")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "VaultFunded",
            details: `Chủ: ${String(e.args.owner).slice(0, 10)}..., Số tiền: ${formatUSDC(e.args.amount)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(vaultWithdrawnEvents, "VaultWithdrawn")) {
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "VaultWithdrawn",
            details: `Chủ: ${String(e.args.owner).slice(0, 10)}..., Số tiền: ${formatUSDC(e.args.amount)} USDC`,
            txHash: e.transactionHash,
          });
        }
      } else {
        const depositIds: Set<number> = new Set();
        if (address) {
          try {
            const ids = await core.getUserDeposits(address);
            for (const id of ids) depositIds.add(Number(id));
          } catch {}
        }

        const [openedEvents, withdrawnEvents, earlyWithdrawnEvents, renewedEvents, partialEvents] =
          await Promise.allSettled([
            queryAllRanges("DepositOpened", (f, t) =>
              core.queryFilter(core.filters.DepositOpened(null, null, null), f, t)
            ),
            queryAllRanges("DepositWithdrawn", (f, t) =>
              core.queryFilter(core.filters.DepositWithdrawn(), f, t)
            ),
            queryAllRanges("DepositEarlyWithdrawn", (f, t) =>
              core.queryFilter(core.filters.DepositEarlyWithdrawn(), f, t)
            ),
            queryAllRanges("DepositRenewed", (f, t) =>
              core.queryFilter(core.filters.DepositRenewed(), f, t)
            ),
            queryAllRanges("DepositPartialEarlyWithdrawn", (f, t) =>
              core.queryFilter(core.filters.DepositPartialEarlyWithdrawn(), f, t)
            ),
          ]);

        for (const e of getEvents(openedEvents, "DepositOpened")) {
          if (e.args.owner.toLowerCase() !== address?.toLowerCase()) continue;
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositOpened",
            details: `Giao dịch #${e.args.depositId}, Kế hoạch #${e.args.planId}, Vốn: ${formatUSDC(e.args.principal)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(withdrawnEvents, "DepositWithdrawn")) {
          if (!depositIds.has(Number(e.args.depositId))) continue;
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositWithdrawn",
            details: `Giao dịch #${e.args.depositId}, Vốn: ${formatUSDC(e.args.principal)} USDC, Lãi: ${formatUSDC(e.args.interest)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(earlyWithdrawnEvents, "DepositEarlyWithdrawn")) {
          if (!depositIds.has(Number(e.args.depositId))) continue;
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositEarlyWithdrawn",
            details: `Giao dịch #${e.args.depositId}, Vốn: ${formatUSDC(e.args.principal)} USDC, Phí phạt: ${formatUSDC(e.args.penalty)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(renewedEvents, "DepositRenewed")) {
          if (!depositIds.has(Number(e.args.oldDepositId))) continue;
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositRenewed",
            details: `Cũ #${e.args.oldDepositId} → Mới #${e.args.newDepositId}, Vốn: ${formatUSDC(e.args.newPrincipal)} USDC`,
            txHash: e.transactionHash,
          });
        }
        for (const e of getEvents(partialEvents, "DepositPartialEarlyWithdrawn")) {
          if (!depositIds.has(Number(e.args.depositId))) continue;
          allRaw.push({
            blockNumber: e.blockNumber,
            eventName: "DepositPartialEarlyWithdrawn",
            details: `Giao dịch #${e.args.depositId}, Rút: ${formatUSDC(e.args.withdrawAmount)} USDC, Phí phạt: ${formatUSDC(e.args.penalty)} USDC`,
            txHash: e.transactionHash,
          });
        }
      }

      const uniqueBlocks = [...new Set(allRaw.map((e) => e.blockNumber))];
      const blockTimestamps = await fetchTimestampsBatched(provider, uniqueBlocks);

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
          `Một số sự kiện tải thất bại: ${failedTypes.join(", ")}. Hãy thử lại sau.`,
        ]);
      }
    } catch (err: any) {
      console.error("Failed to load audit log:", err);
      setError(err?.message || "Tải nhật ký giao dịch thất bại. Vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }, [provider, isCorrectNetwork, address, isAdmin]);

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
        <div>
          <h2 className="page-title">Nhật ký giao dịch</h2>
          <p className="card-subtitle" style={{ marginTop: "0.25rem" }}>
            {isAdmin ? "Tất cả giao dịch trên hệ thống" : `Giao dịch của ${address?.slice(0, 6)}...${address?.slice(-4)}`}
          </p>
        </div>
        <button
          className="btn-secondary btn-sm"
          onClick={handleRefresh}
          disabled={loading}
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      {loading && <p className="status-message info">Đang tải sự kiện... (có thể mất vài giây)</p>}

      {error && (
        <div className="status-message error" style={{ marginBottom: "1rem" }}>
          {error}
          <button className="btn-secondary btn-sm" style={{ marginLeft: "1rem" }} onClick={handleRefresh}>
            Thử lại
          </button>
        </div>
      )}

      {partialErrors.length > 0 && (
        <div className="status-message error" style={{ marginBottom: "1rem" }}>
          {partialErrors.map((msg, i) => (
            <div key={i}>{msg}</div>
          ))}
        </div>
      )}

      {!loading && logs.length === 0 && !error && (
        <div className="card">
          <p className="empty-state">
            {isAdmin
              ? "Chưa có sự kiện nào trên hệ thống."
              : "Bạn chưa có giao dịch nào. Hãy gửi tiết kiệm để bắt đầu."}
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
