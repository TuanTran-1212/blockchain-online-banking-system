import { ethers } from "ethers";
import MockUSDC from "../abis/MockUSDC.json";
import VaultManager from "../abis/VaultManager.json";
import SavingCore from "../abis/SavingCore.json";

export const CONTRACTS = {
  MockUSDC: {
    address: "0x45BAB50D9DFCE9176A64fA6Ce12Bb9288E2B5269",
    abi: (MockUSDC as any).abi,
  },
  VaultManager: {
    address: "0x1521290278AAa3f9E8eC25866A1DC63B6d48Aa00",
    abi: (VaultManager as any).abi,
  },
  SavingCore: {
    address: "0x0f21053868fE011919d0d8FacFa0aab1cf72dCDf",
    abi: (SavingCore as any).abi,
  },
};

export const SEPOLIA_CHAIN_ID = 11155111;
export const SEPOLIA_RPC = "https://ethereum-sepolia-rpc.publicnode.com";
export const DECIMALS = 6;

export interface Plan {
  id: number;
  tenorDays: number;
  aprBps: number;
  minDeposit: bigint;
  maxDeposit: bigint;
  earlyWithdrawPenaltyBps: number;
  enabled: boolean;
}

export interface Deposit {
  id: number;
  planId: number;
  owner: string;
  principal: bigint;
  startAt: bigint;
  maturityAt: bigint;
  aprBpsAtOpen: number;
  penaltyBpsAtOpen: number;
  status: number;
}

export interface VaultHealth {
  balance: bigint;
  totalDeposits: bigint;
  totalOwedInterest: bigint;
  isSolvent: boolean;
  availableLiquidity: bigint;
}

export const DEPOSIT_STATUS = ["Đang gửi", "Đã rút", "Gia hạn", "Tự động gia hạn"];

export function getSavingCore(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACTS.SavingCore.address, CONTRACTS.SavingCore.abi, signerOrProvider);
}

export function getMockUSDC(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACTS.MockUSDC.address, CONTRACTS.MockUSDC.abi, signerOrProvider);
}

export function getVaultManager(signerOrProvider: ethers.Signer | ethers.Provider) {
  return new ethers.Contract(CONTRACTS.VaultManager.address, CONTRACTS.VaultManager.abi, signerOrProvider);
}

export async function fetchPlans(signerOrProvider: ethers.Signer | ethers.Provider): Promise<Plan[]> {
  const core = getSavingCore(signerOrProvider);
  const count = await core.planCount();
  const plans: Plan[] = [];

  for (let i = 0; i < Number(count); i++) {
    const p = await core.getPlan(i);
    plans.push({
      id: i,
      tenorDays: Number(p.tenorDays),
      aprBps: Number(p.aprBps),
      minDeposit: p.minDeposit,
      maxDeposit: p.maxDeposit,
      earlyWithdrawPenaltyBps: Number(p.earlyWithdrawPenaltyBps),
      enabled: p.enabled,
    });
  }
  return plans;
}

export async function fetchUserDeposits(
  signerOrProvider: ethers.Signer | ethers.Provider,
  userAddress: string
): Promise<Deposit[]> {
  const core = getSavingCore(signerOrProvider);
  const depositIds = await core.getUserDeposits(userAddress);
  const deposits: Deposit[] = [];

  for (const id of depositIds) {
    const d = await core.getDeposit(id);
    deposits.push({
      id: Number(id),
      planId: Number(d.planId),
      owner: d.owner,
      principal: d.principal,
      startAt: d.startAt,
      maturityAt: d.maturityAt,
      aprBpsAtOpen: Number(d.aprBpsAtOpen),
      penaltyBpsAtOpen: Number(d.penaltyBpsAtOpen),
      status: Number(d.status),
    });
  }
  return deposits;
}

export async function fetchVaultHealth(provider: ethers.Provider): Promise<VaultHealth> {
  const vm = getVaultManager(provider);
  const [balance, totalDeposits, totalOwedInterest, isSolvent, availableLiquidity] = await Promise.all([
    vm.vaultBalance(),
    vm.totalDeposits(),
    vm.totalOwedInterest(),
    vm.isSolvent(),
    vm.getAvailableLiquidity(),
  ]);
  return { balance, totalDeposits, totalOwedInterest, isSolvent, availableLiquidity };
}

export async function fetchOwner(provider: ethers.Provider): Promise<string> {
  const core = getSavingCore(provider);
  return await core.owner();
}

export async function fetchUSDCBalance(provider: ethers.Provider, address: string): Promise<bigint> {
  const usdc = getMockUSDC(provider);
  return await usdc.balanceOf(address);
}

export function formatUSDC(amount: bigint): string {
  return ethers.formatUnits(amount, DECIMALS);
}

export function parseUSDC(amount: string): bigint {
  return ethers.parseUnits(amount, DECIMALS);
}

export function calculateInterest(principal: bigint, aprBps: number, tenorSeconds: bigint): bigint {
  const BPS = 10000n;
  const SECONDS_PER_YEAR = 365n * 24n * 3600n;
  return (principal * BigInt(aprBps) * tenorSeconds) / (SECONDS_PER_YEAR * BPS);
}
