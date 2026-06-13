import React, { useState, useEffect } from 'react';
import LoginScreen from './screens/LoginScreen';
import DriverHomeScreen from './screens/HomeScreen';
import CallHistoryScreen from './screens/CallHistoryScreen';
import LocationTracker from './components/LocationTracker';
import SoundNotification from './components/SoundNotification';
import './App.css';

function App() {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [serviceType, setServiceType] = useState('ambulance');
  const [screen, setScreen] = useState('login');

  // Initialize Telegram WebApp SDK if running inside Telegram
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
      if (typeof tg.setHeaderColor === 'function') { try { tg.setHeaderColor('#e74c3c'); } catch {} }
    } catch {}
  }, []);

  useEffect(() => {
    const savedToken = localStorage.getItem('driver_token');
    const savedUser = localStorage.getItem('driver_user');
    const savedServiceType = localStorage.getItem('driver_service_type');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      setServiceType(savedServiceType || 'ambulance');
      setScreen('home');
    }
  }, []);

  const handleLogin = (userData, authToken, svcType) => {
    setUser(userData);
    setToken(authToken);
    const st = svcType || 'ambulance';
    setServiceType(st);
    localStorage.setItem('driver_token', authToken);
    localStorage.setItem('driver_user', JSON.stringify(userData));
    localStorage.setItem('driver_service_type', st);
    setScreen('home');
  };

  const handleLogout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem('driver_token');
    localStorage.removeItem('driver_user');
    localStorage.removeItem('driver_service_type');
    setScreen('login');
  };

  // Visual accent + marker per service type — mirrors mobile's
  // FireHomeScreen / PoliceHomeScreen / (ambulance) HomeScreen variants
  const variantProps = {
    ambulance: { accentColor: '#4fc3f7', markerEmoji: '🚑' },
    police:    { accentColor: '#1565c0', markerEmoji: '👮' },
    fire:      { accentColor: '#e67e22', markerEmoji: '🚒' },
  }[serviceType] || { accentColor: '#4fc3f7', markerEmoji: '🚑' };

  return (
    <div className="app">
      {token && <LocationTracker token={token} />}
      {token && screen === 'home' && <SoundNotification token={token} />}

      {screen === 'login' && (
        <LoginScreen onLogin={handleLogin} />
      )}

      {screen === 'home' && (
        <DriverHomeScreen
          token={token}
          user={user}
          onLogout={handleLogout}
          onProfile={() => setScreen('history')}
          onNotifications={() => setScreen('history')}
          accentColor={variantProps.accentColor}
          markerEmoji={variantProps.markerEmoji}
        />
      )}

      {screen === 'history' && (
        <CallHistoryScreen
          token={token}
          onBack={() => setScreen('home')}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;
