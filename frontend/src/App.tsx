import { useState, useEffect } from "react";
import { useWallet } from "./hooks/useWallet";
import { fetchOwner } from "./config/contracts";
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
    if (!wallet.provider || !wallet.isCorrectNetwork) {
      setOwnerAddress(null);
      return;
    }
    fetchOwner(wallet.provider)
      .then(setOwnerAddress)
      .catch((err) => {
        console.error("Failed to fetch owner:", err);
        setOwnerAddress(null);
      });
  }, [wallet.provider, wallet.isCorrectNetwork]);

  const isAdmin = Boolean(
    wallet.address && ownerAddress && wallet.address.toLowerCase() === ownerAddress.toLowerCase()
  );

  return (
    <div className="app">
      <Navbar
        address={wallet.address}
        isCorrectNetwork={wallet.isCorrectNetwork}
        isConnecting={wallet.isConnecting}
        connect={wallet.connect}
        disconnect={wallet.disconnect}
        switchToSepolia={wallet.switchToSepolia}
        activePage={activePage}
        setActivePage={setActivePage}
      />

      <main className="main-content">
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
