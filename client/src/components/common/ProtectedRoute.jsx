import { Navigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";

export default function ProtectedRoute({ children, roles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="loading-center" style={{ height: "100vh" }}>
        <div className="spinner spinner-lg" />
        <span>Loading...</span>
      </div>
    );
  }

  if (!user) return <Navigate to="/login" replace />;

  if (roles && !roles.includes(user.role)) {
    const redirects = {
      citizen: "/report",
      responder: "/responder",
      operator: "/dashboard",
      admin: "/dashboard",
      hospital: "/dashboard",
    };
    return <Navigate to={redirects[user.role] || "/login"} replace />;
  }

  return children;
}
