import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import { fetchOwner, setActiveNetwork, getContractAddress } from "./config/contracts";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import OpenDeposit from "./pages/OpenDeposit";
import MyDeposits from "./pages/MyDeposits";
import AuditLog from "./pages/AuditLog";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("home");
  const [ownerAddress, setOwnerAddress] = useState<string | null>(null);
  const wallet = useWallet();

  useEffect(() => {
    if (wallet.chainId) {
      setActiveNetwork(wallet.chainId);
    }
  }, [wallet.chainId]);

  useEffect(() => {
    if (!wallet.provider || !wallet.isCorrectNetwork) {
      setOwnerAddress(null);
      return;
    }

    const savingCoreAddr = getContractAddress("SavingCore");
    if (!savingCoreAddr) {
      console.warn("No contract addresses for this network. Deploy contracts first.");
      setOwnerAddress(null);
      return;
    }

    fetchOwner(wallet.provider)
      .then(setOwnerAddress)
      .catch((err) => {
        console.error("Failed to fetch owner:", err);
        setOwnerAddress(null);
      });
  }, [wallet.provider, wallet.isCorrectNetwork, wallet.chainId]);

  const isAdmin = Boolean(
    wallet.address && ownerAddress && wallet.address.toLowerCase() === ownerAddress.toLowerCase()
  );

  const hasContracts = Boolean(getContractAddress("SavingCore"));

  return (
    <div className="app">
      <Navbar
        address={wallet.address}
        isCorrectNetwork={wallet.isCorrectNetwork}
        isConnecting={wallet.isConnecting}
        connect={wallet.connect}
        disconnect={wallet.disconnect}
        switchToSepolia={wallet.switchToSepolia}
        switchToLocalhost={wallet.switchToLocalhost}
        isLocalhost={wallet.isLocalhost}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main-content">
        {wallet.isCorrectNetwork && !hasContracts && (
          <div className="status-message error" style={{ marginBottom: "1rem" }}>
            Chưa deploy contract trên mạng này. Hãy chạy <code>npx hardhat deploy</code> trước.
          </div>
        )}

        {activePage === "home" && (
          <Home
            provider={wallet.provider}
            signer={wallet.signer}
            address={wallet.address}
            isCorrectNetwork={wallet.isCorrectNetwork}
            isAdmin={isAdmin}
          />
        )}
        {activePage === "open" && (
          <OpenDeposit
            provider={wallet.provider}
            signer={wallet.signer}
            address={wallet.address}
            isCorrectNetwork={wallet.isCorrectNetwork}
          />
        )}
        {activePage === "mydeposits" && (
          <MyDeposits
            provider={wallet.provider}
            signer={wallet.signer}
            address={wallet.address}
            isCorrectNetwork={wallet.isCorrectNetwork}
          />
        )}
        {activePage === "audit" && (
          <AuditLog
            provider={wallet.provider}
            isCorrectNetwork={wallet.isCorrectNetwork}
            address={wallet.address}
            isAdmin={isAdmin}
          />
        )}
      </main>

      <footer className="footer">
        <p>Online Banking System — Blockchain</p>
      </footer>
    </div>
  );
}

export default App;
