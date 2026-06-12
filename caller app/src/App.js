import React, { useState, useEffect, useRef } from 'react';
import './App.css';
import SplashScreen from './screens/SplashScreen';
import RoleScreen from './screens/RoleScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import EmergencyScreen from './screens/EmergencyScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import ProfileScreen from './screens/ProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen';

const SCREEN_ORDER = ['splash', 'role', 'login', 'home', 'emergency', 'confirmation', 'notifications', 'profile'];

function App() {
  const [screen, setScreen] = useState('splash');
  const [direction, setDirection] = useState('forward');
  const [animating, setAnimating] = useState(false);
  const [userToken, setUserToken] = useState(localStorage.getItem('userToken'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [emergencyId, setEmergencyId] = useState(null);
  const [callerLocation, setCallerLocation] = useState(null);
  const [role, setRole] = useState(null);

  // Initialize Telegram WebApp SDK if running inside Telegram
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;

    try {
      tg.ready();
      tg.expand();

      // Prevent accidental swipe-to-close while interacting with the app
      if (typeof tg.disableVerticalSwipes === 'function') {
        tg.disableVerticalSwipes();
      }

      // Match the app background to Telegram's theme where possible
      const bg = tg.themeParams?.bg_color;
      if (bg) {
        document.body.style.background = bg;
      }

      // Reflect our brand color in Telegram's header/background chrome
      if (typeof tg.setHeaderColor === 'function') {
        try { tg.setHeaderColor('#e74c3c'); } catch {}
      }
      if (typeof tg.setBackgroundColor === 'function') {
        try { tg.setBackgroundColor('#f0f4ff'); } catch {}
      }
    } catch {}
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localStorage.getItem('userToken')) {
        navigate('home');
      } else {
        navigate('role');
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  const navigate = (to) => {
    const fromIdx = SCREEN_ORDER.indexOf(screen);
    const toIdx = SCREEN_ORDER.indexOf(to);
    const dir = toIdx >= fromIdx ? 'forward' : 'back';
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setScreen(to);
      setAnimating(false);
    }, 10);
  };

  const handleLogin = (userData, token) => {
    localStorage.setItem('userToken', token);
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('userPhone', userData.phone);
    localStorage.setItem('user', JSON.stringify(userData));
    setUserToken(token);
    setUser(userData);
    navigate('home');
  };

  const handleSendEmergency = (dispatchCenterId, serviceType = 'ambulance', lat, lng) => {
    setEmergencyId(dispatchCenterId);
    if (lat && lng) setCallerLocation({ lat, lng });
    navigate('emergency');
  };

  const handleLogout = () => {
    localStorage.clear();
    setUserToken(null);
    setUser(null);
    setEmergencyId(null);
    navigate('role');
  };

  const screenClass = `screen-wrapper ${direction === 'forward' ? 'slide-in-right' : 'slide-in-left'} ${animating ? 'animating' : ''}`;

  return (
    <div className="app">
      <div className={screenClass} key={screen}>
        {screen === 'splash' && <SplashScreen />}

        {screen === 'role' && (
          <RoleScreen onSelectRole={(r) => { setRole(r); navigate('login'); }} />
        )}

        {screen === 'login' && (
          <LoginScreen
            role={role}
            onLogin={handleLogin}
            onBack={() => navigate('role')}
          />
        )}

        {screen === 'home' && (
          <HomeScreen
            user={user}
            token={userToken}
            onCallEmergency={() => navigate('emergency')}
            onProfile={() => navigate('profile')}
            onNotifications={() => navigate('notifications')}
          />
        )}

        {screen === 'emergency' && (
          <EmergencyScreen
            onSendEmergency={handleSendEmergency}
            onBack={() => navigate('home')}
            onNotifications={() => navigate('notifications')}
            onLogout={handleLogout}
            token={userToken}
            dispatchCenterId={emergencyId}
            serviceType={null}
          />
        )}

        {screen === 'confirmation' && (
          <ConfirmationScreen
            emergencyId={emergencyId}
            userToken={userToken}
            callerLocation={callerLocation}
            onNewEmergency={() => navigate('home')}
            onBack={() => navigate('home')}
            onLogout={handleLogout}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen
            user={user}
            token={userToken}
            onBack={() => navigate('home')}
            onLogout={handleLogout}
            onNotifications={() => navigate('notifications')}
          />
        )}

        {screen === 'notifications' && (
          <NotificationsScreen
            token={userToken}
            onBack={() => navigate('home')}
          />
        )}
      </div>
    </div>
  );
}

export default App;
