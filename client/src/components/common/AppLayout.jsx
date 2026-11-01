import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { alertAPI } from "../../services/api";
import { getSocket } from "../../services/socket";
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import NotificationBell from "./NotificationBell";
import useIsMobile from "../../utils/useIsMobile";

export default function AppLayout({ children }) {
  const { user } = useAuth();
  const [alertCount, setAlertCount] = useState(0);
  const [navOpen, setNavOpen] = useState(false);
  const isMobile = useIsMobile();
  const location = useLocation();

  // Close the drawer after navigating, and when the screen grows back to desktop width
  useEffect(() => { setNavOpen(false); }, [location.pathname]);
  useEffect(() => { if (!isMobile) setNavOpen(false); }, [isMobile]);

  useEffect(() => {
    if (!user || user.role === "citizen") return;
    alertAPI.list({ acknowledged: false })
      .then((res) => setAlertCount(res.data.data?.length || 0))
      .catch(() => {});

    const socket = getSocket();
    const handleNewAlert = () => setAlertCount((c) => c + 1);
    const handleAlertAck = () => setAlertCount((c) => Math.max(0, c - 1));
    socket.on("alert:created", handleNewAlert);
    socket.on("alert:updated", handleAlertAck);
    return () => {
      socket.off("alert:created", handleNewAlert);
      socket.off("alert:updated", handleAlertAck);
    };
  }, [user]);

  return (
    <div className="app-layout">
      {isMobile && (
        <header className="mobile-topbar">
          <button className="mobile-menu-btn" aria-label="Open menu" aria-expanded={navOpen} onClick={() => setNavOpen((o) => !o)}>
            <Menu size={22} />
          </button>
          <div className="mobile-brand">🛡️ RakshakAI</div>
          <NotificationBell />
        </header>
      )}
      {isMobile && navOpen && <div className="sidebar-overlay" onClick={() => setNavOpen(false)} />}
      <Sidebar alertCount={alertCount} isMobile={isMobile} open={navOpen} onNavigate={() => setNavOpen(false)} />
      <main className="app-main">
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
