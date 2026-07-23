

interface Props {
  address: string | null;
  isCorrectNetwork: boolean;
  isConnecting: boolean;
  connect: () => void;
  disconnect: () => void;
  switchToSepolia: () => void;
  activePage: string;
  setActivePage: (page: string) => void;
}

export default function Navbar({
  address,
  isCorrectNetwork,
  isConnecting,
  connect,
  disconnect,
  switchToSepolia,
  activePage,
  setActivePage,
}: Props) {
  return (
    <nav className="navbar">
      <div className="navbar-brand">
        <h1>Online Banking</h1>
      </div>

      <div className="navbar-links">
        <button
          className={`nav-link ${activePage === "home" ? "active" : ""}`}
          onClick={() => setActivePage("home")}
        >
          Home
        </button>
        <button
          className={`nav-link ${activePage === "open" ? "active" : ""}`}
          onClick={() => setActivePage("open")}
        >
          Open Deposit
        </button>
        <button
          className={`nav-link ${activePage === "mydeposits" ? "active" : ""}`}
          onClick={() => setActivePage("mydeposits")}
        >
          My Deposits
        </button>
      </div>

      <div className="navbar-wallet">
        {address ? (
          <div className="wallet-info">
            {!isCorrectNetwork && (
              <button className="btn-warning" onClick={switchToSepolia}>
                Switch to Sepolia
              </button>
            )}
            <span className="wallet-address">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <button className="btn-disconnect" onClick={disconnect}>
              Disconnect
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={connect} disabled={isConnecting}>
            {isConnecting ? "Connecting..." : "Connect MetaMask"}
          </button>
        )}
      </div>
    </nav>
  );
}
