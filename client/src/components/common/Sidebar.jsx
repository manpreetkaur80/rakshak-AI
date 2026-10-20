import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  LayoutDashboard, AlertTriangle, Truck, Bell, BarChart3,
  Map, LogOut, Shield, User, Activity, ClipboardList
} from "lucide-react";

const NAV_ITEMS = {
  operator: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/incidents", icon: AlertTriangle, label: "Incidents" },
    { to: "/resources", icon: Truck, label: "Resources" },
    { to: "/alerts", icon: Bell, label: "Alerts" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
  ],
  admin: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/incidents", icon: AlertTriangle, label: "Incidents" },
    { to: "/resources", icon: Truck, label: "Resources" },
    { to: "/alerts", icon: Bell, label: "Alerts" },
    { to: "/analytics", icon: BarChart3, label: "Analytics" },
    { to: "/admin", icon: Shield, label: "Admin" },
  ],
  responder: [
    { to: "/responder", icon: Activity, label: "My Assignments" },
    { to: "/incidents", icon: ClipboardList, label: "Incidents" },
  ],
  citizen: [
    { to: "/report", icon: AlertTriangle, label: "Report Emergency" },
    { to: "/track", icon: Map, label: "Track Incident" },
  ],
  hospital: [
    { to: "/dashboard", icon: LayoutDashboard, label: "Dashboard" },
    { to: "/resources", icon: Truck, label: "Resources" },
  ],
};

export default function Sidebar({ alertCount = 0 }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_ITEMS[user?.role] || NAV_ITEMS.citizen;

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <aside className="app-sidebar">
      <div className="sidebar-brand">
        <div className="sidebar-brand-name">🛡️ RakshakAI</div>
        <div className="sidebar-brand-sub">Emergency Response Platform</div>
      </div>

      <nav className="sidebar-nav">
        <div className="sidebar-section-label">Navigation</div>
        {items.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) => `sidebar-link${isActive ? " active" : ""}`}
          >
            <Icon size={16} />
            {label}
            {label === "Alerts" && alertCount > 0 && (
              <span className="badge">{alertCount > 99 ? "99+" : alertCount}</span>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-user-info">
          <div className="sidebar-avatar">
            {user?.name?.charAt(0).toUpperCase() || <User size={14} />}
          </div>
          <div>
            <div className="sidebar-user-name">{user?.name}</div>
            <div className="sidebar-user-role">{user?.role}</div>
          </div>
        </div>
        <button className="btn btn-ghost btn-sm btn-full" onClick={handleLogout}>
          <LogOut size={13} /> Sign Out
        </button>
      </div>
    </aside>
  );
}
