import { useState, useEffect, useCallback } from "react";
import { ethers } from "ethers";
import { SEPOLIA_CHAIN_ID } from "../config/contracts";

interface WalletState {
  address: string | null;
  provider: ethers.BrowserProvider | null;
  signer: ethers.Signer | null;
  chainId: number | null;
  isCorrectNetwork: boolean;
}

export function useWallet() {
  const [wallet, setWallet] = useState<WalletState>({
    address: null,
    provider: null,
    signer: null,
    chainId: null,
    isCorrectNetwork: false,
  });
  const [isConnecting, setIsConnecting] = useState(false);

  const connect = useCallback(async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }

    setIsConnecting(true);
    try {
      const provider = new ethers.BrowserProvider(window.ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setWallet({
        address: accounts[0],
        provider,
        signer,
        chainId: Number(network.chainId),
        isCorrectNetwork: Number(network.chainId) === SEPOLIA_CHAIN_ID,
      });
    } catch (err) {
      console.error("Connection failed:", err);
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const disconnect = useCallback(() => {
    setWallet({
      address: null,
      provider: null,
      signer: null,
      chainId: null,
      isCorrectNetwork: false,
    });
  }, []);

  const switchToSepolia = useCallback(async () => {
    if (!window.ethereum) return;
    try {
      await window.ethereum.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: `0x${SEPOLIA_CHAIN_ID.toString(16)}` }],
      });
    } catch (err) {
      console.error("Switch failed:", err);
    }
  }, []);

  useEffect(() => {
    if (!window.ethereum) return;

    const handleAccountsChanged = async (accounts: string[]) => {
      if (accounts.length === 0) {
        disconnect();
        return;
      }

      const newAddress = accounts[0];
      const provider = new ethers.BrowserProvider(window.ethereum);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setWallet({
        address: newAddress,
        provider,
        signer,
        chainId: Number(network.chainId),
        isCorrectNetwork: Number(network.chainId) === SEPOLIA_CHAIN_ID,
      });
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
  }, [connect, disconnect]);

  return { ...wallet, connect, disconnect, switchToSepolia, isConnecting };
}

declare global {
  interface Window {
    ethereum?: any;
  }
}
