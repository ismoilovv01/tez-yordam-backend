import React, { useState, useEffect, useRef } from 'react';
import '../styles/HomeScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

const ACTIVE_STATUSES = ['new', 'confirmed', 'assigned', 'on_the_way', 'arrived'];

const SERVICES = [
  { key: 'ambulance', icon: '🚑', name: 'Tez Yordam',  textColor: '#c0392b', bg: '#ffebee'  },
  { key: 'pharmacy',  icon: '🏥', name: 'Dorixona',    textColor: '#3949ab', bg: '#e8eaf6'  },
  { key: 'police',    icon: '🛡️', name: 'Politsiya',   textColor: '#1565c0', bg: '#e3f2fd'  },
  { key: 'fire',      icon: '🔥', name: "Yong'in",     textColor: '#bf360c', bg: '#fff3e0'  },
];

const CENTERS_CACHE_KEY = 'dispatch_centers_cache';

function HomeScreen({ user, token, onCallEmergency, onProfile, onNotifications, onOpenActiveEmergency }) {
  const [lastEmergency, setLastEmergency] = useState(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonName, setComingSoonName] = useState('');
  const [dispatchCenters, setDispatchCenters] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityName, setCityName] = useState('');

  const pollRef = useRef(null);

  useEffect(() => {
    fetchLastEmergency();
    fetchDispatchCenters();
    fetchCityName();
    pollRef.current = setInterval(fetchLastEmergency, 5000);
    return () => clearInterval(pollRef.current);
  }, []);

  // Resolve a human-readable city/region name from the browser's geolocation,
  // via the Google Geocoding API — mirrors the mobile HomeScreen behavior.
  const fetchCityName = () => {
    if (!navigator.geolocation || !GOOGLE_KEY) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=${GOOGLE_KEY}&language=uz`)
          .then(r => r.json())
          .then(data => {
            const components = data.results?.[0]?.address_components || [];
            const city = components.find(c => c.types.includes('locality'));
            const region = components.find(c => c.types.includes('administrative_area_level_1'));
            setCityName(city?.long_name || region?.long_name || '');
          })
          .catch(() => {});
      },
      () => {}, // silently ignore — fall back to default location text
      { timeout: 4000 }
    );
  };

  const fetchDispatchCenters = async () => {
    try {
      const cached = localStorage.getItem(CENTERS_CACHE_KEY);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (parsed && parsed.length > 0) setDispatchCenters(parsed);
        } catch {}
      }
      const res = await fetch(`${API_URL}/api/dispatch-centers`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setDispatchCenters(data);
          localStorage.setItem(CENTERS_CACHE_KEY, JSON.stringify(data));
        }
      }
    } catch {}
  };

  const fetchLastEmergency = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/my/last`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setLastEmergency(data && data.id ? data : null);
      }
    } catch {}
  };

  const handleComingSoon = (name) => {
    setComingSoonName(name);
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2500);
  };

  const isActiveEmergency = lastEmergency && ACTIVE_STATUSES.includes(lastEmergency.status);

  // Only ambulance is a live service for now — everything else shows
  // "Tez orada" (coming soon), matching mobile's hardcoded behavior.
  // This intentionally ignores dispatch_centers data for non-ambulance
  // services so police/fire/pharmacy stay gated even if centers exist.
  const isActive = (key) => key === 'ambulance';

  const handleServiceClick = (serviceType) => {
    // If there's an active emergency, redirect there instead of creating a new one
    if (isActiveEmergency) {
      if (onOpenActiveEmergency) onOpenActiveEmergency(lastEmergency);
      return;
    }
    if (!isActive(serviceType)) {
      const name = serviceType === 'police' ? 'Politsiya' : serviceType === 'fire' ? "Yong'in xizmati" : 'Dorixona';
      handleComingSoon(name);
      return;
    }
    const center = dispatchCenters.find(c => c.service_type === 'ambulance');
    onCallEmergency(center?.id || 1, 'ambulance');
  };

  const handleLastCallClick = () => {
    if (lastEmergency && onOpenActiveEmergency) onOpenActiveEmergency(lastEmergency);
  };

  const firstName = user?.first_name || user?.phone || 'Foydalanuvchi';

  const statusColor = (status) => {
    const colors = {
      new: '#f39c12', confirmed: '#3498db', assigned: '#9b59b6',
      on_the_way: '#e67e22', arrived: '#27ae60', completed: '#27ae60', cancelled: '#e74c3c'
    };
    return colors[status] || '#aaa';
  };

  const statusLabel = (status) => {
    const labels = {
      new: 'Yangi', confirmed: 'Tasdiqlandi', assigned: 'Haydovchi tayinlandi',
      on_the_way: "Yo'lda", arrived: 'Keldi', completed: 'Tugatildi', cancelled: 'Bekor qilindi'
    };
    return labels[status] || status;
  };

  const q = searchQuery.trim().toLowerCase();
  const filteredServices = q ? SERVICES.filter(s => s.name.toLowerCase().includes(q)) : SERVICES;

  return (
    <div className="home-container">
      {/* Coming soon modal */}
      {showComingSoon && (
        <div className="coming-soon-overlay">
          <div className="coming-soon-modal">
            <span className="coming-soon-emoji">🚀</span>
            <p className="coming-soon-title">{comingSoonName}</p>
            <p className="coming-soon-sub">Tez orada ishga tushadi!</p>
          </div>
        </div>
      )}

      {/* Gradient header */}
      <div className="home-header">
        <div className="home-header-top">
          <div>
            <p className="home-greeting">Salom, {firstName} 👋</p>
            <div className="home-location">
              <span className="home-location-icon">📍</span>
              <span className="home-location-text">{cityName ? `${cityName}, O'zbekiston` : "Toshkent, O'zbekiston"}</span>
            </div>
          </div>
          <button className="home-notif-btn" onClick={onNotifications}>
            🔔
            <div className="home-notif-dot" />
          </button>
        </div>
        <div className="home-search">
          <span className="home-search-icon">🔍</span>
          <input
            className="home-search-input"
            type="text"
            placeholder="Xizmat qidirish..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoCorrect="off"
            spellCheck="false"
          />
          {searchQuery && (
            <button className="home-search-clear" onClick={() => setSearchQuery('')}>×</button>
          )}
        </div>
      </div>

      {/* White content */}
      <div className="home-content">

        {/* Active emergency banner */}
        {isActiveEmergency && (
          <button className="home-active-banner" onClick={handleLastCallClick}>
            <div className="home-active-banner-icon">🚑</div>
            <div className="home-active-banner-info">
              <p className="home-active-banner-title">Faol chaqiruv #{lastEmergency.id}</p>
              <p className="home-active-banner-sub">{statusLabel(lastEmergency.status)} — bosing</p>
            </div>
            <span className="home-active-banner-arrow">›</span>
          </button>
        )}

        {/* Quick icons */}
        <div className="home-quick-icons">
          <button className="home-quick-btn" onClick={() => (isActiveEmergency ? handleLastCallClick() : onCallEmergency())}>
            <div className="home-quick-icon blue">📞</div>
            <span className="home-quick-label">Qo'ng'iroq</span>
          </button>
          <button className="home-quick-btn">
            <div className="home-quick-icon orange">📍</div>
            <span className="home-quick-label">Joylashuv</span>
          </button>
        </div>

        {/* Services */}
        <div className="home-section-header">
          <p className="home-section-title">Xizmatlar</p>
          <span className="home-section-all">Barchasi</span>
        </div>

        <div className="home-grid">
          {filteredServices.map((svc) => {
            const active = isActive(svc.key);
            return (
              <button
                key={svc.key}
                className={`home-service-card ${active ? 'active' : 'inactive'}`}
                onClick={() => handleServiceClick(svc.key)}
              >
                <div className="home-service-icon" style={{ background: svc.bg }}>
                  {svc.icon}
                </div>
                <p className="home-service-name" style={{ color: svc.textColor }}>{svc.name}</p>
                <p className={`home-service-status ${active ? 'active-status' : 'soon-status'}`}>
                  {active ? 'Faol' : 'Tez orada'}
                </p>
              </button>
            );
          })}
          {filteredServices.length === 0 && (
            <p className="home-no-results">Hech narsa topilmadi</p>
          )}
        </div>

        {/* Last emergency (history, only show if not currently active) */}
        {lastEmergency && !isActiveEmergency && (
          <div className="home-last-call" onClick={handleLastCallClick}>
            <div className="home-last-call-icon">🚑</div>
            <div className="home-last-call-info">
              <p className="home-last-call-title">Oxirgi chaqiruv #{lastEmergency.id}</p>
              <p className="home-last-call-sub" style={{ color: statusColor(lastEmergency.status) }}>
                {statusLabel(lastEmergency.status)}
              </p>
            </div>
            <span className="home-last-call-arrow">›</span>
          </div>
        )}
      </div>

      {/* Bottom nav */}
      <div className="home-bottom-nav">
        <button className="home-nav-btn active">
          <span className="home-nav-icon">🏠</span>
          <span className="home-nav-label active">Asosiy</span>
        </button>
        <button className="home-nav-btn" onClick={onProfile}>
          <span className="home-nav-icon">👤</span>
          <span className="home-nav-label">Profil</span>
        </button>
      </div>
    </div>
  );
}

export default HomeScreen;
