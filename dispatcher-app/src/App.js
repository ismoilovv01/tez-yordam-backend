import React, { useState } from "react";
import axios from "axios";
import "./App.css";
import LoginScreen from "./screens/LoginScreen";
import DashboardScreen from "./screens/DashboardScreen";
import CenterAdminScreen from "./screens/CenterAdminScreen";

const API_URL = process.env.REACT_APP_API_URL || "http://localhost:3000";

function App() {
  const [token, setToken] = useState(() => localStorage.getItem("dispatcherToken"));
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem("dispatcherUser") || "null"); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async ({ phone, code, role }) => {
    setLoading(true);
    setError(null);
    try {
      const response = await axios.post(`${API_URL}/api/auth/dispatcher-login`, { phone, code, role });
      const { token: newToken, user: newUser } = response.data;
      localStorage.setItem("dispatcherToken", newToken);
      localStorage.setItem("dispatcherUser", JSON.stringify(newUser));
      setToken(newToken);
      setUser(newUser);
    } catch (err) {
      setError(err.response?.data?.error || "Kirish xatosi");
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem("dispatcherToken");
    localStorage.removeItem("dispatcherUser");
    setToken(null);
    setUser(null);
    setError(null);
  };

  if (token && user) {
    if (user.user_type === "dispatcher") {
      return <DashboardScreen token={token} onLogout={handleLogout} />;
    }
    if (user.user_type === "center_admin" || user.user_type === "admin") {
      return <CenterAdminScreen token={token} user={user} onLogout={handleLogout} />;
    }
    // Unknown role
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", flexDirection: "column", gap: 16 }}>
        <p>Bu hisob uchun ruxsat yo'q ({user.user_type})</p>
        <button onClick={handleLogout} style={{ padding: "10px 20px", borderRadius: 8, border: "none", background: "#e74c3c", color: "#fff", cursor: "pointer" }}>Chiqish</button>
      </div>
    );
  }

  return (
    <div className="app">
      <LoginScreen onLogin={handleLogin} loading={loading} error={error} />
    </div>
  );
}

export default App;
