import { createContext, useContext, useState, useEffect } from "react";
import { authAPI } from "../services/api";
import { connectSocket, disconnectSocket } from "../services/socket";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    try {
      const stored = localStorage.getItem("ps9_user");
      return stored ? JSON.parse(stored) : null;
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem("ps9_token");
    if (token) {
      authAPI
        .me()
        .then((res) => {
          setUser(res.data.data);
          connectSocket();
        })
        .catch(() => {
          localStorage.removeItem("ps9_token");
          localStorage.removeItem("ps9_user");
          setUser(null);
        })
        .finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (email, password) => {
    const res = await authAPI.login({ email, password });
    const { token, user: userData } = res.data.data;
    localStorage.setItem("ps9_token", token);
    localStorage.setItem("ps9_user", JSON.stringify(userData));
    setUser(userData);
    connectSocket();
    return userData;
  };

  const logout = () => {
    localStorage.removeItem("ps9_token");
    localStorage.removeItem("ps9_user");
    setUser(null);
    disconnectSocket();
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    const { token, user: userData } = res.data.data;
    localStorage.setItem("ps9_token", token);
    localStorage.setItem("ps9_user", JSON.stringify(userData));
    setUser(userData);
    connectSocket();
    return userData;
  };

  return (
    <AuthContext.Provider value={{ user, login, logout, register, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
