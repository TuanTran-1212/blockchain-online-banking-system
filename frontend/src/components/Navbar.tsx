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
          Trang chủ
        </button>
        <button
          className={`nav-link ${activePage === "open" ? "active" : ""}`}
          onClick={() => setActivePage("open")}
        >
          Gửi tiết kiệm
        </button>
        <button
          className={`nav-link ${activePage === "mydeposits" ? "active" : ""}`}
          onClick={() => setActivePage("mydeposits")}
        >
          Giao dịch của tôi
        </button>
        {address && (
          <button
            className={`nav-link ${activePage === "audit" ? "active" : ""}`}
            onClick={() => setActivePage("audit")}
          >
            Nhật ký giao dịch
          </button>
        )}
      </div>

      <div className="navbar-wallet">
        {address ? (
          <div className="wallet-info">
            {!isCorrectNetwork && (
              <button className="btn-warning btn-sm" onClick={switchToSepolia}>
                Chuyển sang Sepolia
              </button>
            )}
            <span className="wallet-address">
              {address.slice(0, 6)}...{address.slice(-4)}
            </span>
            <button className="btn-disconnect" onClick={disconnect}>
              Logout
            </button>
          </div>
        ) : (
          <button className="btn-primary" onClick={connect} disabled={isConnecting}>
            {isConnecting ? "Đang kết nối..." : "Kết nối ví"}
          </button>
        )}
      </div>
    </nav>
  );
}
