import { useState } from "react";
import { useWallet } from "./hooks/useWallet";
import Navbar from "./components/Navbar";
import Home from "./pages/Home";
import OpenDeposit from "./pages/OpenDeposit";
import MyDeposits from "./pages/MyDeposits";
import "./App.css";

function App() {
  const [activePage, setActivePage] = useState("home");
  const wallet = useWallet();

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
            address={wallet.address}
            isCorrectNetwork={wallet.isCorrectNetwork}
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
      </main>

      <footer className="footer">
        <p>Online Banking System — Blockchain Course Final Project</p>
      </footer>
    </div>
  );
}

export default App;
