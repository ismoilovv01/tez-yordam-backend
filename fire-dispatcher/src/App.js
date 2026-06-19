import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [dispatcherToken, setDispatcherToken] = useState(localStorage.getItem('fireDispatcherToken'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (phone, code) => {
    setLoading(true);
    setError(null);
    if (code === null) {
      try {
        await axios.post(`${API_URL}/api/auth/send-code`, { phone });
        setLoading(false);
        return;
      } catch (err) {
        setError(err.response?.data?.error || 'Kod yuborishda xato');
        setLoading(false);
        return;
      }
    }
    try {
      const response = await axios.post(`${API_URL}/api/auth/verify-code`, { phone, code });
      const { token, user } = response.data;
      if (user.user_type !== 'dispatcher') {
        setError('Faqat dispetcherlar kirishi mumkin');
        setLoading(false);
        return;
      }
      localStorage.setItem('fireDispatcherToken', token);
      setDispatcherToken(token);
      setCurrentScreen('dashboard');
    } catch (err) {
      setError(err.response?.data?.error || 'Noto\'g\'ri kod');
    }
    setLoading(false);
  };

  const handleLogout = () => {
    localStorage.removeItem('fireDispatcherToken');
    setDispatcherToken(null);
    setCurrentScreen('login');
  };

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Yopish</button>
        </div>
      )}
      {loading && (
        <div className="loading-overlay">
          <div className="spinner"></div>
        </div>
      )}
      {currentScreen === 'login' && (
        <LoginScreen onLogin={handleLogin} loading={loading} />
      )}
      {currentScreen === 'dashboard' && (
        <DashboardScreen token={dispatcherToken} onLogout={handleLogout} />
      )}
    </div>
  );
}

export default App;
