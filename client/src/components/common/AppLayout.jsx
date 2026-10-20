import { useState, useEffect } from "react";
import Sidebar from "./Sidebar";
import { alertAPI } from "../../services/api";
import { getSocket } from "../../services/socket";
import { useAuth } from "../../context/AuthContext";

export default function AppLayout({ children }) {
  const { user } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

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
      <Sidebar alertCount={alertCount} />
      <main className="app-main">
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}
