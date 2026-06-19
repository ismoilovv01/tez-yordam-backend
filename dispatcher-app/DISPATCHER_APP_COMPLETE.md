# Dispatcher Dashboard - Complete Setup Guide

## Quick Start

1. Create folder: `dispatcher-app`
2. Download all files from outputs
3. Organize into this structure:
```
dispatcher-app/
├── public/
│   └── index.html
├── src/
│   ├── screens/
│   │   ├── LoginScreen.js
│   │   └── DashboardScreen.js
│   ├── styles/
│   │   ├── LoginScreen.css
│   │   └── DashboardScreen.css
│   ├── App.js
│   ├── App.css
│   ├── index.js
│   └── index.css
├── .env
└── package.json
```

4. Run:
```bash
npm install
npm start
```

## Files to Create

### public/index.html
```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Dispatcher - Tez Yordam</title>
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
```

### .env
```
REACT_APP_API_URL=http://localhost:3000
```

### src/index.js
```javascript
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

### src/index.css
```css
body {
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#root {
  width: 100%;
  height: 100%;
}

html, body, #root {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}
```

### src/App.js
```javascript
import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import LoginScreen from './screens/LoginScreen';
import DashboardScreen from './screens/DashboardScreen';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function App() {
  const [currentScreen, setCurrentScreen] = useState('login');
  const [dispatcherToken, setDispatcherToken] = useState(localStorage.getItem('dispatcherToken'));
  const [dispatcherId, setDispatcherId] = useState(localStorage.getItem('dispatcherId'));
  const [dispatcherPhone, setDispatcherPhone] = useState(localStorage.getItem('dispatcherPhone'));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleLogin = async (phone, code) => {
    setLoading(true);
    setError(null);
    try {
      await axios.post(`${API_URL}/api/auth/send-code`, { phone });

      setTimeout(async () => {
        try {
          const response = await axios.post(`${API_URL}/api/auth/verify-code`, {
            phone,
            code
          });

          const { token, user } = response.data;
          
          localStorage.setItem('dispatcherToken', token);
          localStorage.setItem('dispatcherId', user.id);
          localStorage.setItem('dispatcherPhone', phone);

          setDispatcherToken(token);
          setDispatcherId(user.id);
          setDispatcherPhone(phone);
          setCurrentScreen('dashboard');
        } catch (err) {
          setError(err.response?.data?.error || 'Invalid code');
        }
        setLoading(false);
      }, 1000);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send code');
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('dispatcherToken');
    localStorage.removeItem('dispatcherId');
    localStorage.removeItem('dispatcherPhone');
    setDispatcherToken(null);
    setDispatcherId(null);
    setDispatcherPhone(null);
    setCurrentScreen('login');
  };

  return (
    <div className="app">
      {error && (
        <div className="error-banner">
          <p>{error}</p>
          <button onClick={() => setError(null)}>Dismiss</button>
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
        <DashboardScreen 
          token={dispatcherToken}
          onLogout={handleLogout}
        />
      )}
    </div>
  );
}

export default App;
```

### src/App.css
```css
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen',
    'Ubuntu', 'Cantarell', 'Fira Sans', 'Droid Sans', 'Helvetica Neue',
    sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background: #f5f5f5;
}

.app {
  width: 100%;
  height: 100vh;
  overflow: hidden;
}

.error-banner {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: #dc3545;
  color: white;
  padding: 12px 16px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  z-index: 1000;
}

.error-banner p {
  margin: 0;
  flex: 1;
}

.error-banner button {
  background: rgba(255,255,255,0.3);
  border: none;
  color: white;
  padding: 6px 12px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}

.loading-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 999;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255,255,255,0.3);
  border-top-color: white;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### src/screens/LoginScreen.js
```javascript
import React, { useState } from 'react';
import '../styles/LoginScreen.css';

function LoginScreen({ onLogin, loading }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone');
  const [error, setError] = useState('');

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!phone.match(/^\+?[0-9]{10,15}$/)) {
      setError('Please enter a valid phone number');
      return;
    }

    setStep('code');
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (code.length !== 6) {
      setError('Code must be 6 digits');
      return;
    }

    onLogin(phone, code);
  };

  const handleBackToPhone = () => {
    setStep('phone');
    setCode('');
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <h1 className="app-title">Dispatcher</h1>
          <p className="app-subtitle">Tez Yordam Control Center</p>
        </div>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="login-form">
            <h2>Dispatcher Login</h2>
            <p className="form-description">Enter your phone number</p>

            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                placeholder="+998 (99) 123-45-67"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError('');
                }}
                disabled={loading}
                autoFocus
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !phone}
            >
              {loading ? 'Sending code...' : 'Send Code'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <h2>Verify Code</h2>
            <p className="form-description">
              Enter the 6-digit code sent to <strong>{phone}</strong>
            </p>

            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                placeholder="000000"
                maxLength="6"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/[^0-9]/g, '');
                  setCode(val);
                  setError('');
                }}
                disabled={loading}
                autoFocus
                className="code-input"
              />
              <small className="hint">Check backend console for code</small>
            </div>

            {error && <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify & Login'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleBackToPhone}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
```

### src/screens/DashboardScreen.js
```javascript
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/DashboardScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function DashboardScreen({ token, onLogout }) {
  const [emergencies, setEmergencies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapInstance, setMapInstance] = useState(null);

  // Load Yandex Maps
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://api-maps.yandex.ru/2.1/?apikey=YOUR_API_KEY&lang=en_US';
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        initializeMap();
      });
    };
    document.body.appendChild(script);

    return () => {
      if (script) document.body.removeChild(script);
    };
  }, []);

  // Initialize map
  const initializeMap = () => {
    const map = new window.ymaps.Map('dispatcher-map', {
      center: [41.2995, 69.2401],
      zoom: 13,
      controls: ['zoomControl']
    });

    setMapInstance(map);
    setMapLoaded(true);
    fetchEmergencies();
  };

  // Fetch emergencies
  const fetchEmergencies = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API_URL}/api/emergencies?status=new`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setEmergencies(response.data);
      updateMap(response.data);
    } catch (err) {
      console.error('Error fetching emergencies:', err);
    }
    setLoading(false);
  };

  // Update map with markers
  const updateMap = (emerg) => {
    if (!mapInstance) return;

    mapInstance.geoObjects.removeAll();

    emerg.forEach((e) => {
      const placemark = new window.ymaps.Placemark(
        [parseFloat(e.latitude), parseFloat(e.longitude)],
        { 
          balloonContent: `Emergency #${e.id}<br>${e.service_type}<br>${new Date(e.created_at).toLocaleTimeString()}`
        },
        { preset: 'islands#redIcon' }
      );
      mapInstance.geoObjects.add(placemark);
    });
  };

  // Confirm emergency
  const handleConfirm = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${id}/confirm`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchEmergencies();
    } catch (err) {
      console.error('Error confirming:', err);
    }
  };

  // Dispatch emergency
  const handleDispatch = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${id}/dispatch`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchEmergencies();
    } catch (err) {
      console.error('Error dispatching:', err);
    }
  };

  // Complete emergency
  const handleComplete = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${id}/complete`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchEmergencies();
    } catch (err) {
      console.error('Error completing:', err);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <div className="dashboard-header">
        <h1>Dispatcher Control Center</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={fetchEmergencies} disabled={loading}>
            🔄 Refresh
          </button>
          <button className="btn-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/* Map */}
        <div className="map-section">
          <div id="dispatcher-map" className="dispatcher-map"></div>
          {!mapLoaded && <div className="loading-map">Loading map...</div>}
        </div>

        {/* Emergencies List */}
        <div className="emergencies-section">
          <h2>Active Emergencies ({emergencies.length})</h2>
          <div className="emergencies-list">
            {emergencies.length === 0 ? (
              <p className="no-emergencies">No active emergencies</p>
            ) : (
              emergencies.map((e) => (
                <div key={e.id} className="emergency-item">
                  <div className="emergency-info">
                    <p className="emergency-id">#{e.id}</p>
                    <p className="emergency-type">🚑 {e.service_type}</p>
                    <p className="emergency-location">
                      📍 {parseFloat(e.latitude).toFixed(4)}, {parseFloat(e.longitude).toFixed(4)}
                    </p>
                    <p className="emergency-time">
                      {new Date(e.created_at).toLocaleTimeString()}
                    </p>
                    {e.description && (
                      <p className="emergency-description">"{e.description}"</p>
                    )}
                  </div>
                  <div className="emergency-actions">
                    <button
                      className="btn-action btn-confirm"
                      onClick={() => handleConfirm(e.id)}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      className="btn-action btn-dispatch"
                      onClick={() => handleDispatch(e.id)}
                    >
                      → Dispatch
                    </button>
                    <button
                      className="btn-action btn-complete"
                      onClick={() => handleComplete(e.id)}
                    >
                      ✓ Complete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;
```

### src/styles/LoginScreen.css
```css
.login-container {
  width: 100%;
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  padding: 16px;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: white;
  border-radius: 16px;
  padding: 32px;
  box-shadow: 0 8px 32px rgba(0,0,0,0.15);
}

.logo-section {
  text-align: center;
  margin-bottom: 32px;
}

.app-title {
  font-size: 32px;
  font-weight: 700;
  color: #2c3e50;
  margin: 0 0 8px;
}

.app-subtitle {
  color: #666;
  font-size: 14px;
  margin: 0;
}

.login-form {
  width: 100%;
}

.login-form h2 {
  font-size: 20px;
  color: #333;
  margin-bottom: 8px;
}

.form-description {
  color: #666;
  font-size: 14px;
  margin-bottom: 24px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  font-weight: 600;
  color: #333;
  margin-bottom: 8px;
  font-size: 14px;
}

.form-group input {
  width: 100%;
  padding: 12px;
  border: 1px solid #ddd;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.2s;
}

.form-group input:focus {
  outline: none;
  border-color: #2c3e50;
  box-shadow: 0 0 0 3px rgba(44, 62, 80, 0.1);
}

.code-input {
  text-align: center;
  letter-spacing: 8px;
  font-size: 20px;
  font-weight: 600;
}

.hint {
  display: block;
  color: #999;
  font-size: 12px;
  margin-top: 6px;
}

.btn-primary {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  color: white;
  border: none;
  padding: 14px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 16px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
}

.btn-primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(44, 62, 80, 0.4);
}

.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-secondary {
  background: transparent;
  color: #666;
  border: 1px solid #ddd;
  padding: 12px 20px;
  border-radius: 8px;
  font-weight: 500;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s;
  width: 100%;
  margin-top: 8px;
}

.btn-secondary:hover:not(:disabled) {
  border-color: #999;
  background: #f9f9f9;
}

.error-message {
  background: #ffebee;
  color: #c62828;
  padding: 12px;
  border-radius: 4px;
  margin: 12px 0;
  font-size: 14px;
  border-left: 4px solid #c62828;
}
```

### src/styles/DashboardScreen.css
```css
.dashboard-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: white;
  overflow: hidden;
}

.dashboard-header {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  color: white;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.dashboard-header h1 {
  font-size: 24px;
  margin: 0;
}

.header-actions {
  display: flex;
  gap: 12px;
}

.btn-refresh, .btn-logout {
  background: rgba(255,255,255,0.2);
  color: white;
  border: 1px solid rgba(255,255,255,0.3);
  padding: 8px 16px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  transition: all 0.2s;
}

.btn-refresh:hover, .btn-logout:hover {
  background: rgba(255,255,255,0.3);
}

.dashboard-content {
  display: flex;
  flex: 1;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

.map-section {
  flex: 1;
  position: relative;
  background: #f5f5f5;
  border-radius: 8px;
  overflow: hidden;
}

.dispatcher-map {
  width: 100%;
  height: 100%;
}

.loading-map {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: white;
  padding: 20px;
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

.emergencies-section {
  width: 320px;
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.emergencies-section h2 {
  font-size: 16px;
  color: #333;
  padding: 16px;
  margin: 0;
  border-bottom: 1px solid #eee;
  background: #f9f9f9;
}

.emergencies-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
}

.no-emergencies {
  padding: 32px 16px;
  text-align: center;
  color: #999;
  font-size: 14px;
}

.emergency-item {
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 8px;
  transition: all 0.2s;
}

.emergency-item:hover {
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.emergency-info {
  margin-bottom: 12px;
}

.emergency-id {
  font-weight: 600;
  color: #2c3e50;
  margin: 0 0 4px;
  font-size: 13px;
}

.emergency-type {
  color: #dc3545;
  font-weight: 500;
  margin: 0 0 4px;
  font-size: 12px;
}

.emergency-location {
  color: #666;
  margin: 0 0 4px;
  font-size: 11px;
  font-family: monospace;
}

.emergency-time {
  color: #999;
  margin: 0;
  font-size: 11px;
}

.emergency-description {
  color: #555;
  font-size: 11px;
  margin: 6px 0 0;
  font-style: italic;
}

.emergency-actions {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.btn-action {
  padding: 6px 10px;
  border: none;
  border-radius: 4px;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-confirm {
  background: #4CAF50;
  color: white;
}

.btn-confirm:hover {
  background: #45a049;
}

.btn-dispatch {
  background: #2196f3;
  color: white;
}

.btn-dispatch:hover {
  background: #0b7dda;
}

.btn-complete {
  background: #ff9800;
  color: white;
}

.btn-complete:hover {
  background: #e68900;
}

@media (max-width: 1024px) {
  .dashboard-content {
    flex-direction: column;
  }

  .emergencies-section {
    width: 100%;
    height: 200px;
  }
}
```

## Setup Steps

1. Create dispatcher-app folder
2. Download all files
3. Organize in structure above
4. `npm install`
5. `npm start`

App runs on port 3002 or next available.

## Login

Use your dispatcher phone number (same as backend user). Get code from backend console.

