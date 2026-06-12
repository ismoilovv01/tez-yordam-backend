import React, { useState, useEffect } from 'react';
import '../styles/HomeScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function HomeScreen({ user, token, onCallEmergency, onProfile, onNotifications }) {
  const [lastEmergency, setLastEmergency] = useState(null);
  const [showComingSoon, setShowComingSoon] = useState(false);
  const [comingSoonName, setComingSoonName] = useState('');
  const [dispatchCenters, setDispatchCenters] = useState([]);

  useEffect(() => {
    fetchLastEmergency();
    fetchDispatchCenters();
  }, []);

  const fetchDispatchCenters = async () => {
    try {
      const res = await fetch(`${API_URL}/api/dispatch-centers`);
      if (res.ok) {
        const data = await res.json();
        setDispatchCenters(data);
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
        setLastEmergency(data);
      }
    } catch {}
  };

  const handleComingSoon = (name) => {
    setComingSoonName(name);
    setShowComingSoon(true);
    setTimeout(() => setShowComingSoon(false), 2500);
  };

  const handleServiceClick = (serviceType) => {
    const center = dispatchCenters.find(c => c.service_type === serviceType);
    if (center) {
      onCallEmergency(center.id, serviceType);
    } else {
      handleComingSoon(serviceType === 'police' ? 'Politsiya' : serviceType === 'fire' ? "Yong'in xizmati" : serviceType);
    }
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
              <span className="home-location-text">Toshkent, O'zbekiston</span>
            </div>
          </div>
          <button className="home-notif-btn" onClick={onNotifications}>
            🔔
            <div className="home-notif-dot" />
          </button>
        </div>
        <div className="home-search">
          <span className="home-search-icon">🔍</span>
          <span className="home-search-placeholder">Xizmat qidirish...</span>
        </div>
      </div>

      {/* White content */}
      <div className="home-content">
        {/* Quick icons */}
        <div className="home-quick-icons">
          <button className="home-quick-btn" onClick={onCallEmergency}>
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
          <button className="home-service-card active" onClick={() => handleServiceClick('ambulance')}>
            <div className="home-service-icon red">🚑</div>
            <p className="home-service-name red-text">Tez Yordam</p>
            <p className="home-service-status active-status">Faol</p>
          </button>
          <button className="home-service-card inactive" onClick={() => handleComingSoon('Dorixona')}>
            <div className="home-service-icon blue-dark">🏥</div>
            <p className="home-service-name blue-text">Dorixona</p>
            <p className="home-service-status soon-status">Tez orada</p>
          </button>
          <button 
            className={`home-service-card ${dispatchCenters.find(c => c.service_type === 'police') ? 'active' : 'inactive'}`} 
            onClick={() => handleServiceClick('police')}
          >
            <div className="home-service-icon navy">🛡️</div>
            <p className="home-service-name navy-text">Politsiya</p>
            <p className={`home-service-status ${dispatchCenters.find(c => c.service_type === 'police') ? 'active-status' : 'soon-status'}`}>
              {dispatchCenters.find(c => c.service_type === 'police') ? 'Faol' : 'Tez orada'}
            </p>
          </button>
          <button 
            className={`home-service-card ${dispatchCenters.find(c => c.service_type === 'fire') ? 'active' : 'inactive'}`} 
            onClick={() => handleServiceClick('fire')}
          >
            <div className="home-service-icon fire">🔥</div>
            <p className="home-service-name fire-text">Yong'in</p>
            <p className={`home-service-status ${dispatchCenters.find(c => c.service_type === 'fire') ? 'active-status' : 'soon-status'}`}>
              {dispatchCenters.find(c => c.service_type === 'fire') ? 'Faol' : 'Tez orada'}
            </p>
          </button>
        </div>

        {/* Last emergency */}
        {lastEmergency && (
          <div className="home-last-call">
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
