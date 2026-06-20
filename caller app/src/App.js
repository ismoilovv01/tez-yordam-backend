import React, { useState, useEffect } from 'react';
import './App.css';
import SplashScreen from './screens/SplashScreen';
import RoleScreen from './screens/RoleScreen';
import LoginScreen from './screens/LoginScreen';
import HomeScreen from './screens/HomeScreen';
import EmergencyScreen from './screens/EmergencyScreen';
import ConfirmationScreen from './screens/ConfirmationScreen';
import ProfileScreen from './screens/ProfileScreen';
import NotificationsScreen from './screens/NotificationsScreen';
import DriverHomeScreen from './screens/driver/DriverHomeScreen';
import DriverCallHistoryScreen from './screens/driver/DriverCallHistoryScreen';
import FeedbackScreen from './screens/FeedbackScreen';
import EmergencyNumbersScreen from './screens/EmergencyNumbersScreen';
import LocationTracker from './components/LocationTracker';
import SoundNotification from './components/SoundNotification';

const SCREEN_ORDER = [
  'splash', 'role', 'login', 'home', 'emergency-numbers', 'emergency', 'confirmation', 'notifications', 'profile',
  'driver-home', 'driver-history', 'driver-profile', 'feedback',
];

function App() {
  const [screen, setScreen] = useState('splash');
  const [direction, setDirection] = useState('forward');
  const [animating, setAnimating] = useState(false);

  // Caller auth state
  const [userToken, setUserToken] = useState(localStorage.getItem('userToken'));
  const [user, setUser] = useState(JSON.parse(localStorage.getItem('user') || 'null'));
  const [emergencyId, setEmergencyId] = useState(() => {
    try { const e = JSON.parse(localStorage.getItem('last_emergency') || 'null'); return e?.id || null; } catch { return null; }
  });
  const [callerLocation, setCallerLocation] = useState(() => {
    try { return JSON.parse(localStorage.getItem('caller_location') || 'null'); } catch { return null; }
  });

  // Driver auth state
  const [driverToken, setDriverToken] = useState(localStorage.getItem('driver_token'));
  const [driverUser, setDriverUser] = useState(JSON.parse(localStorage.getItem('driver_user') || 'null'));
  const [driverServiceType, setDriverServiceType] = useState(localStorage.getItem('driver_service_type') || 'ambulance');

  const [role, setRole] = useState(null);
  const [feedbackCtx, setFeedbackCtx] = useState({ type: 'caller', emergencyId: null, returnTo: 'profile' });
  const openFeedback = (type, emergencyId, returnTo) => { setFeedbackCtx({ type, emergencyId, returnTo }); navigate(type === 'driver' ? 'feedback' : 'feedback'); };

  // Params for a NEW emergency request (set when user taps a service card)
  const [pendingDispatchCenterId, setPendingDispatchCenterId] = useState(null);
  const [pendingServiceType, setPendingServiceType] = useState('ambulance');

  // Initialize Telegram WebApp SDK if running inside Telegram
  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (!tg) return;
    try {
      tg.ready();
      tg.expand();
      if (typeof tg.disableVerticalSwipes === 'function') tg.disableVerticalSwipes();
      const bg = tg.themeParams?.bg_color;
      if (bg) document.body.style.background = bg;
      if (typeof tg.setHeaderColor === 'function') { try { tg.setHeaderColor('#e74c3c'); } catch {} }
      if (typeof tg.setBackgroundColor === 'function') { try { tg.setBackgroundColor('#f0f4ff'); } catch {} }
    } catch {}
  }, []);

  // Initial routing: restore caller or driver session
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localStorage.getItem('driver_token')) {
        navigate('driver-home');
      } else if (localStorage.getItem('userToken')) {
        // If there's an active emergency cached, go straight to confirmation
        try {
          const em = JSON.parse(localStorage.getItem('last_emergency') || 'null');
          if (em && em.id && !['completed', 'cancelled', 'rejected'].includes(em.status)) {
            navigate('confirmation');
          } else {
            navigate('home');
          }
        } catch { navigate('home'); }
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

  // ── Caller handlers ────────────────────────────────────────────
  const handleLogin = (userData, token) => {
    localStorage.setItem('userToken', token);
    localStorage.setItem('userId', userData.id);
    localStorage.setItem('userPhone', userData.phone);
    localStorage.setItem('user', JSON.stringify(userData));
    setUserToken(token);
    setUser(userData);
    navigate('home');
  };

  const handleStartEmergency = (dispatchCenterId, serviceType) => {
    setPendingDispatchCenterId(dispatchCenterId || null);
    setPendingServiceType(serviceType || 'ambulance');
    navigate('emergency');
  };

  const handleSendEmergency = (id, lat, lng) => {
    setEmergencyId(id);
    if (lat && lng) {
      const loc = { lat, lng };
      setCallerLocation(loc);
      localStorage.setItem('caller_location', JSON.stringify(loc));
    }
    navigate('confirmation');
  };

  const handleOpenActiveEmergency = (emergency) => {
    if (!emergency) return;
    setEmergencyId(emergency.id);
    const lat = parseFloat(emergency.latitude ?? emergency.lat);
    const lng = parseFloat(emergency.longitude ?? emergency.lng);
    if (!isNaN(lat) && !isNaN(lng)) {
      const loc = { lat, lng };
      setCallerLocation(loc);
      localStorage.setItem('caller_location', JSON.stringify(loc));
    }
    navigate('confirmation');
  };

  const handleLogout = () => {
    localStorage.removeItem('userToken');
    localStorage.removeItem('userId');
    localStorage.removeItem('userPhone');
    localStorage.removeItem('user');
    localStorage.removeItem('last_emergency');
    localStorage.removeItem('caller_location');
    setUserToken(null);
    setUser(null);
    setEmergencyId(null);
    navigate('role');
  };

  // ── Driver handlers ────────────────────────────────────────────
  const handleDriverLogin = (userData, token, serviceType) => {
    const st = serviceType || 'ambulance';
    localStorage.setItem('driver_token', token);
    localStorage.setItem('driver_user', JSON.stringify(userData));
    localStorage.setItem('driver_service_type', st);
    setDriverToken(token);
    setDriverUser(userData);
    setDriverServiceType(st);
    navigate('driver-home');
  };

  const handleDriverLogout = () => {
    localStorage.removeItem('driver_token');
    localStorage.removeItem('driver_user');
    localStorage.removeItem('driver_service_type');
    setDriverToken(null);
    setDriverUser(null);
    navigate('role');
  };

  // Visual accent + marker per driver service type
  const driverVariant = {
    ambulance: { accentColor: '#4fc3f7', markerEmoji: '🚑' },
    police:    { accentColor: '#1565c0', markerEmoji: '👮' },
    fire:      { accentColor: '#e67e22', markerEmoji: '🚒' },
  }[driverServiceType] || { accentColor: '#4fc3f7', markerEmoji: '🚑' };

  const screenClass = `screen-wrapper ${direction === 'forward' ? 'slide-in-right' : 'slide-in-left'} ${animating ? 'animating' : ''}`;

  return (
    <div className="app">
      {/* Driver background tasks */}
      {driverToken && <LocationTracker token={driverToken} />}
      {driverToken && screen === 'driver-home' && <SoundNotification token={driverToken} />}

      <div className={screenClass} key={screen}>
        {screen === 'splash' && <SplashScreen />}

        {screen === 'role' && (
          <RoleScreen onSelectRole={(r) => { setRole(r); navigate('login'); }} />
        )}

        {screen === 'login' && (
          <LoginScreen
            role={role}
            onLogin={handleLogin}
            onDriverLogin={handleDriverLogin}
            onBack={() => navigate('role')}
          />
        )}

        {/* ── Caller screens ── */}
        {screen === 'home' && (
          <HomeScreen
            user={user}
            token={userToken}
            onCallEmergency={handleStartEmergency}
            onEmergencyNumbers={() => navigate('emergency-numbers')}
            onProfile={() => navigate('profile')}
            onNotifications={() => navigate('notifications')}
            onOpenActiveEmergency={handleOpenActiveEmergency}
          />
        )}

        {screen === 'emergency' && (
          <EmergencyScreen
            onSendEmergency={handleSendEmergency}
            onBack={() => navigate('home')}
            onNotifications={() => navigate('notifications')}
            onLogout={handleLogout}
            token={userToken}
            dispatchCenterId={pendingDispatchCenterId}
            serviceType={pendingServiceType}
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
            onFeedback={() => openFeedback('caller', emergencyId, 'home')}
          />
        )}

        {screen === 'profile' && (
          <ProfileScreen
            user={user}
            token={userToken}
            onBack={() => navigate('home')}
            onLogout={handleLogout}
            onNotifications={() => navigate('notifications')}
            onFeedback={() => openFeedback('caller', null, 'profile')}
          />
        )}

        {screen === 'emergency-numbers' && (
          <EmergencyNumbersScreen onBack={() => navigate('home')} />
        )}

        {screen === 'notifications' && (
          <NotificationsScreen
            token={userToken}
            onBack={() => navigate('home')}
          />
        )}

        {/* ── Driver screens ── */}
        {screen === 'driver-home' && (
          <DriverHomeScreen
            token={driverToken}
            user={driverUser}
            onLogout={handleDriverLogout}
            onProfile={() => navigate('driver-profile')}
            onNotifications={() => navigate('driver-history')}
            onFeedback={(callId) => openFeedback('driver', callId, 'driver-home')}
            accentColor={driverVariant.accentColor}
            markerEmoji={driverVariant.markerEmoji}
          />
        )}

        {screen === 'driver-profile' && (
          <ProfileScreen
            user={driverUser}
            token={driverToken}
            onBack={() => navigate('driver-home')}
            onLogout={handleDriverLogout}
            onNotifications={() => navigate('driver-history')}
            onFeedback={() => openFeedback('driver', null, 'driver-profile')}
          />
        )}

        {screen === 'driver-history' && (
          <DriverCallHistoryScreen
            token={driverToken}
            onBack={() => navigate('driver-home')}
            onLogout={handleDriverLogout}
          />
        )}
        {screen === 'feedback' && (
          <FeedbackScreen
            token={feedbackCtx.type === 'driver' ? driverToken : userToken}
            emergencyId={feedbackCtx.emergencyId}
            type={feedbackCtx.type}
            afterCall={!!feedbackCtx.emergencyId}
            onBack={() => navigate(feedbackCtx.returnTo)}
            onDone={() => navigate(feedbackCtx.returnTo)}
          />
        )}
      </div>
    </div>
  );
}

export default App;
