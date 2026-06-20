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

const CITY_COORDS = {
  'Tashkent': [41.2995, 69.2401], 'Toshkent': [41.2995, 69.2401],
  'Samarqand': [39.6547, 66.9758], 'Samarkand': [39.6547, 66.9758],
  'Buxoro': [39.7747, 64.4286], 'Bukhara': [39.7747, 64.4286],
  'Namangan': [41.0011, 71.6722], 'Andijon': [40.7829, 72.3442],
  "Farg'ona": [40.3864, 71.7864], 'Fergana': [40.3864, 71.7864],
  'Xorazm': [41.5534, 60.6166], 'Urganch': [41.5534, 60.6166],
  'Nukus': [42.4603, 59.6166], 'Navoiy': [40.0963, 65.3791],
  'Qarshi': [38.8600, 65.7897], 'Termiz': [37.2241, 67.2786],
  'Jizzax': [40.1158, 67.8422], 'Guliston': [40.4897, 68.7842],
};

function haversine(lat1, lon1, lat2, lon2) {
  const R = 6371, dL = (lat2-lat1)*Math.PI/180, dLo = (lon2-lon1)*Math.PI/180;
  const a = Math.sin(dL/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLo/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function findNearestCenter(centers, serviceType, userLat, userLon) {
  const filtered = centers.filter(c => c.service_type === serviceType);
  if (!filtered.length) return null;
  if (userLat == null || userLon == null) return filtered[0];
  let nearest = null, minDist = Infinity;
  filtered.forEach(c => {
    const coords = CITY_COORDS[c.city];
    if (!coords) return;
    const dist = haversine(userLat, userLon, coords[0], coords[1]);
    if (dist < minDist) { minDist = dist; nearest = c; }
  });
  return nearest || filtered[0];
}

function HomeScreen({ user, token, onCallEmergency, onProfile, onNotifications, onOpenActiveEmergency, onEmergencyNumbers }) {
  const [lastEmergency, setLastEmergency] = useState(() => {
    try { return JSON.parse(localStorage.getItem('last_emergency') || 'null'); } catch { return null; }
  });
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonName, setComingSoonName] = useState('');
  const [showEmergencyNumbers, setShowEmergencyNumbers] = useState(false);
  const [dispatchCenters, setDispatchCenters] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [cityName, setCityName] = useState('');

  // Location picker modal state
  const [locationModal, setLocationModal] = useState(false);
  const [pickerLocation, setPickerLocation] = useState(null);
  const [pickerCity, setPickerCity] = useState('');

  const pollRef = useRef(null);
  const modalMapRef = useRef(null);
  const gMapRef = useRef(null);
  const gMarkerRef = useRef(null);
  const mapInitRef = useRef(false);

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
        setPickerLocation({ lat: latitude, lng: longitude });
        reverseGeocode(latitude, longitude, setCityName);
      },
      () => {}, // silently ignore — fall back to default location text
      { timeout: 4000 }
    );
  };

  const reverseGeocode = (lat, lng, setter) => {
    if (!GOOGLE_KEY) return;
    fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${GOOGLE_KEY}&language=uz`)
      .then(r => r.json())
      .then(data => {
        const components = data.results?.[0]?.address_components || [];
        const city = components.find(c => c.types.includes('locality'));
        const region = components.find(c => c.types.includes('administrative_area_level_1'));
        const name = city?.long_name || region?.long_name || '';
        if (name) setter(name);
      })
      .catch(() => {});
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
        const em = data && data.id ? data : null;
        setLastEmergency(em);
        if (em) localStorage.setItem('last_emergency', JSON.stringify(em));
        else localStorage.removeItem('last_emergency');
      }
    } catch {}
  };

  const handleComingSoon = (name) => {
    setComingSoonName(name);
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2500);
  };

  const isActiveEmergency = lastEmergency && ACTIVE_STATUSES.includes(lastEmergency.status);

  const isActive = (key) => key === 'ambulance';

  const handleServiceClick = (serviceType) => {
    if (isActiveEmergency) {
      if (onOpenActiveEmergency) onOpenActiveEmergency(lastEmergency);
      return;
    }
    if (!isActive(serviceType)) {
      const name = serviceType === 'police' ? 'Politsiya' : serviceType === 'fire' ? "Yong'in xizmati" : 'Dorixona';
      handleComingSoon(name);
      return;
    }
    const center = findNearestCenter(dispatchCenters, 'ambulance', pickerLocation?.lat, pickerLocation?.lng);
    onCallEmergency(center?.id || 1, 'ambulance');
  };

  const handleLastCallClick = () => {
    if (lastEmergency && onOpenActiveEmergency) onOpenActiveEmergency(lastEmergency);
  };

  // ── Location picker modal ─────────────────────────────────────────
  const ensureMapsScript = (cb) => {
    if (window.google && window.google.maps) { cb(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const check = setInterval(() => {
        if (window.google && window.google.maps) { clearInterval(check); cb(); }
      }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
    script.async = true;
    script.onload = cb;
    document.head.appendChild(script);
  };

  const initModalMap = (lat, lng) => {
    if (!modalMapRef.current) return;
    const map = new window.google.maps.Map(modalMapRef.current, {
      center: { lat, lng }, zoom: 16,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
    });
    gMapRef.current = map;

    const marker = new window.google.maps.Marker({
      position: { lat, lng }, map, draggable: true,
      icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' },
    });
    gMarkerRef.current = marker;

    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      const coords = { lat: pos.lat(), lng: pos.lng() };
      setPickerLocation(coords);
      reverseGeocode(coords.lat, coords.lng, setPickerCity);
    });

    map.addListener('click', (e) => {
      const coords = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(coords);
      setPickerLocation(coords);
      reverseGeocode(coords.lat, coords.lng, setPickerCity);
    });

    mapInitRef.current = true;
  };

  const handleOpenLocationPicker = () => {
    setLocationModal(true);
    const startLoc = pickerLocation || { lat: 41.2995, lng: 69.2401 };
    setPickerLocation(startLoc);
    mapInitRef.current = false;
    ensureMapsScript(() => {
      // Wait a tick for modal DOM to render
      setTimeout(() => initModalMap(startLoc.lat, startLoc.lng), 50);
    });
    if (pickerLocation) reverseGeocode(startLoc.lat, startLoc.lng, setPickerCity);
  };

  const handleLocateMe = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition((pos) => {
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPickerLocation(coords);
      reverseGeocode(coords.lat, coords.lng, setPickerCity);
      if (gMapRef.current && gMarkerRef.current) {
        gMapRef.current.setCenter(coords);
        gMapRef.current.setZoom(16);
        gMarkerRef.current.setPosition(coords);
      }
    });
  };

  const handleSaveLocation = () => {
    if (pickerCity) setCityName(pickerCity);
    setLocationModal(false);
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

      {/* Emergency numbers modal */}
      {showEmergencyNumbers && (
        <div className="coming-soon-overlay" onClick={() => setShowEmergencyNumbers(false)}>
          <div className="emergency-numbers-modal" onClick={(e) => e.stopPropagation()}>
            <div className="emergency-numbers-header">
              <span className="emergency-numbers-title">📞 Favqulodda raqamlar</span>
              <button className="emergency-numbers-close" onClick={() => setShowEmergencyNumbers(false)}>✕</button>
            </div>
            {[
              { num: '103', icon: '🚑', name: 'Tez tibbiy yordam', color: '#e74c3c', bg: '#ffebee' },
              { num: '102', icon: '🚔', name: 'Politsiya',          color: '#1565c0', bg: '#e3f2fd' },
              { num: '101', icon: '🚒', name: "Yong'in xizmati",   color: '#bf360c', bg: '#fff3e0' },
              { num: '1050', icon: '⚡', name: 'Gaz xizmati',      color: '#f39c12', bg: '#fffde7' },
              { num: '1058', icon: '💧', name: 'Suv xizmati',      color: '#0288d1', bg: '#e1f5fe' },
            ].map(({ num, icon, name, color, bg }) => (
              <a key={num} href={`tel:${num}`} className="emergency-number-row" style={{ background: bg }}>
                <span className="emergency-number-icon" style={{ color }}>{icon}</span>
                <div className="emergency-number-info">
                  <span className="emergency-number-name" style={{ color }}>{name}</span>
                  <span className="emergency-number-num">{num}</span>
                </div>
                <span className="emergency-number-call" style={{ background: color }}>📞</span>
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Location picker modal */}
      {locationModal && (
        <div className="location-modal-overlay" onClick={() => setLocationModal(false)}>
          <div className="location-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="location-modal-header">
              <p className="location-modal-title">📍 Joylashuvni tanlang</p>
              <button className="location-modal-close" onClick={() => setLocationModal(false)}>✕</button>
            </div>
            <p className="location-modal-sub">Xaritada o'z joyingizni belgilang</p>
            <div className="location-map-wrapper">
              <div ref={modalMapRef} className="location-map" />
              <button className="location-locate-btn" onClick={handleLocateMe}>📍</button>
            </div>
            {pickerCity && <p className="location-modal-city">📍 {pickerCity}, O'zbekiston</p>}
            <button className="location-save-btn" onClick={handleSaveLocation}>Shu joyni saqlash</button>
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
          <button className="home-quick-btn" onClick={onEmergencyNumbers}>
            <div className="home-quick-icon blue">📞</div>
            <span className="home-quick-label">Qo'ng'iroq</span>
          </button>
<button className="home-quick-btn" onClick={handleOpenLocationPicker}>
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

        {/* Ad banner */}
        <div className="home-ad-banner">AD</div>
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
