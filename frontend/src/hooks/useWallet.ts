import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { SEPOLIA_CHAIN_ID, HARDHAT_CHAIN_ID } from "../config/contracts";

const VALID_CHAIN_IDS = [SEPOLIA_CHAIN_ID, HARDHAT_CHAIN_ID];

interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
  isLocalhost: boolean;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null,
    chainId: null,
    isCorrectNetwork: false,
    isLocalhost: false,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const updateWalletState = useCallback(async (accounts: string[]) => {
    if (!window.ethereum) return;
    const provider = new ethers.BrowserProvider(window.ethereum);
    const signer = await provider.getSigner();
    const network = await provider.getNetwork();
    const chainId = Number(network.chainId);
    const isLocalhost = chainId === HARDHAT_CHAIN_ID;

    setWallet({
      address: accounts[0],
      provider,
      signer,
      chainId,
      isCorrectNetwork: VALID_CHAIN_IDS.includes(chainId),
      isLocalhost,
    });
  }, []);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Vui lòng cài đặt MetaMask!");
      return;
    }

    setIsConnecting(true);
    try {
      const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
      await updateWalletState(accounts);
    } catch (err) {
      console.error("Connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, [updateWalletState]);

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      provider: null,
      signer: null,
      chainId: null,
      isCorrectNetwork: false,
      isLocalhost: false,
    });
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}`,
            chainName: "Sepolia Testnet",
            rpcUrls: ["https://ethereum-sepolia-rpc.publicnode.com"],
            nativeCurrency: { name: "Sepolia ETH", symbol: "ETH", decimals: 18 },
            blockExplorerUrls: ["https://sepolia.etherscan.io"],
          }],
        });
      }
    }
  }, []);

  const switchToLocalhost = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}` }],
      });
    } catch (err: any) {
      if (err.code === 4902) {
        await window.ethereum.request({
          method: "wallet_addEthereumChain",
          params: [{
            chainId: `0x${HARDHAT_CHAIN_ID.toString(16)}`,
            chainName: "Hardhat Localhost",
            rpcUrls: ["http://127.0.0.1:8545"],
            nativeCurrency: { name: "ETH", symbol: "ETH", decimals: 18 },
          }],
        });
      }
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
        return;
      }
      await updateWalletState(accounts);
    };

    const handleChainChanged = () => {
      window.location.reload();
    };

    window.ethereum.on("accountsChanged", handleAccountsChanged);
    window.ethereum.on("chainChanged", handleChainChanged);

    return () => {
      window.ethereum.removeListener("accountsChanged", handleAccountsChanged);
      window.ethereum.removeListener("chainChanged", handleChainChanged);
    };
  }, [disconnect, updateWalletState]);

  return { ...wallet, connect, disconnect, switchToSepolia, switchToLocalhost, isConnecting };
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
