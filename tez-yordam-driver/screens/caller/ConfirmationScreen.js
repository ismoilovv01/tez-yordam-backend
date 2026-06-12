import React, { useState, useEffect, useRef } from 'react';
import '../styles/ConfirmationScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

const STATUSES = {
  new:       { icon: '📡', title: 'Chaqiruv yuborildi',         subtitle: 'Dispetcher ko\'rib chiqmoqda...', color: '#f39c12', step: 1 },
  confirmed: { icon: '✅', title: 'Tasdiqlandi',                 subtitle: 'Dispetcher chaqiruvingizni tasdiqladi', color: '#2980b9', step: 2 },
  assigned:  { icon: '🚑', title: 'Haydovchi qabul qildi',       subtitle: 'Tez yordam mashinasi yo\'lga chiqmoqda', color: '#8e44ad', step: 3 },
  on_the_way:{ icon: '🚗', title: 'Yo\'lda',                     subtitle: 'Tez yordam mashinasi sizga kelmoqda', color: '#e67e22', step: 4 },
  arrived:   { icon: '🏥', title: 'Yetib keldi',                 subtitle: 'Tez yordam mashinasi sizning joyingizda', color: '#27ae60', step: 5 },
  completed: { icon: '🏁', title: 'Tugatildi',                   subtitle: 'Chaqiruv muvaffaqiyatli yakunlandi', color: '#27ae60', step: 6 },
  rejected:  { icon: '❌', title: 'Bekor qilindi',               subtitle: 'Chaqiruv bekor qilindi', color: '#e74c3c', step: 0 },
};

const STEPS = [
  { key: 'new',        label: 'Yuborildi' },
  { key: 'confirmed',  label: 'Tasdiqlandi' },
  { key: 'assigned',   label: 'Qabul qilindi' },
  { key: 'on_the_way', label: "Yo'lda" },
  { key: 'arrived',    label: 'Keldi' },
  { key: 'completed',  label: 'Tugatildi' },
];

function ConfirmationScreen({ emergencyId, userToken, callerLocation, onNewEmergency, onLogout }) {
  const [status, setStatus] = useState('new');
  const [ambulanceInfo, setAmbulanceInfo] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const pollRef = useRef(null);

  // Map refs
  const mapRef = useRef(null);
  const gMapRef = useRef(null);
  const mapInitRef = useRef(false);
  const callerMarkRef = useRef(null);
  const ambulanceMarkRef = useRef(null);

  // Fetch emergency status + ambulance location
  const fetchStatus = async () => {
    if (!emergencyId || !userToken) return;
    try {
      const res = await fetch(`${API_URL}/api/emergencies/${emergencyId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const data = await res.json();
      if (res.ok) {
        setStatus(data.status);
        if (data.unit_number) setAmbulanceInfo(data.unit_number);
        if (data.assigned_ambulance_id) {
          // Fetch ambulance location
          const ambRes = await fetch(`${API_URL}/api/ambulances/${data.assigned_ambulance_id}`, {
            headers: { Authorization: `Bearer ${userToken}` },
          });
          const ambData = await ambRes.json();
          if (ambRes.ok && ambData.latitude && ambData.longitude) {
            setAmbulanceLocation({ lat: parseFloat(ambData.latitude), lng: parseFloat(ambData.longitude) });
          }
        }
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 5000);
    return () => clearInterval(pollRef.current);
  }, [emergencyId, userToken]);

  // Init map when status becomes on_the_way or assigned
  useEffect(() => {
    const shouldShowMap = ['assigned', 'on_the_way', 'arrived'].includes(status);
    if (!shouldShowMap || mapInitRef.current || !mapRef.current) return;
    if (!window.google) {
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
      script.async = true;
      script.onload = initMap;
      document.head.appendChild(script);
    } else {
      initMap();
    }
  }, [status]);

  const initMap = () => {
    if (mapInitRef.current || !mapRef.current) return;
    mapInitRef.current = true;
    const center = callerLocation || { lat: 41.5534, lng: 60.6166 };
    const map = new window.google.maps.Map(mapRef.current, {
      center,
      zoom: 14,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      zoomControl: true,
    });
    gMapRef.current = map;

    // Caller marker (red)
    if (callerLocation) {
      callerMarkRef.current = new window.google.maps.Marker({
        position: callerLocation,
        map,
        title: 'Sizning joyingiz',
        icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' },
      });
    }
  };

  // Update ambulance marker on map
  useEffect(() => {
    if (!gMapRef.current || !window.google || !ambulanceLocation) return;
    if (ambulanceMarkRef.current) {
      ambulanceMarkRef.current.setPosition(ambulanceLocation);
    } else {
      ambulanceMarkRef.current = new window.google.maps.Marker({
        position: ambulanceLocation,
        map: gMapRef.current,
        title: '🚑 Tez yordam',
        icon: {
          path: window.google.maps.SymbolPath.CIRCLE,
          scale: 10,
          fillColor: '#2980b9',
          fillOpacity: 1,
          strokeColor: '#fff',
          strokeWeight: 2,
        },
        zIndex: 999,
      });
    }
  }, [ambulanceLocation]);

  const currentStatus = STATUSES[status] || STATUSES.new;
  const currentStep = currentStatus.step;
  const isCompleted = status === 'completed';
  const isRejected = status === 'rejected';
  const showMap = ['assigned', 'on_the_way', 'arrived'].includes(status);

  return (
    <div className="confirmation-container">
      {/* Header */}
      <div className="conf-header" style={{ borderBottom: `3px solid ${currentStatus.color}` }}>
        <div className="conf-icon">{currentStatus.icon}</div>
        <h1 className="conf-title">{currentStatus.title}</h1>
        <p className="conf-subtitle">{currentStatus.subtitle}</p>
        {emergencyId && <div className="conf-id">Chaqiruv #{emergencyId}</div>}
      </div>

      {/* Live map — shows when ambulance is on the way */}
      {showMap && (
        <div className="conf-map-container">
          <div ref={mapRef} className="conf-map" />
          {ambulanceLocation && (
            <div className="conf-map-legend">
              <span>🔴 Sizning joyingiz</span>
              <span>🔵 Tez yordam{ambulanceInfo ? ` (${ambulanceInfo})` : ''}</span>
            </div>
          )}
        </div>
      )}

      {/* Progress steps */}
      {!isRejected && (
        <div className="progress-steps">
          {STEPS.map((step, idx) => {
            const stepNum = idx + 1;
            const done = currentStep >= stepNum;
            const active = currentStep === stepNum;
            return (
              <div key={step.key} className="step-row">
                <div className={`step-circle ${done ? 'done' : ''} ${active ? 'active' : ''}`}>
                  {done ? '✓' : stepNum}
                </div>
                <span className={`step-label ${done ? 'done' : ''}`}>{step.label}</span>
                {idx < STEPS.length - 1 && (
                  <div className={`step-line ${currentStep > stepNum ? 'done' : ''}`} />
                )}
              </div>
            );
          })}
        </div>
      )}

      {ambulanceInfo && !isRejected && (
        <div className="ambulance-info">
          <span>🚑 Mashina: <strong>{ambulanceInfo}</strong></span>
        </div>
      )}

      {!isCompleted && !isRejected && (
        <div className="conf-waiting">
          <div className="waiting-dots"><span /><span /><span /></div>
          <p>Yangilanmoqda...</p>
        </div>
      )}

      {isCompleted && (
        <div className="conf-actions">
          <p className="conf-thanks">Xizmatimizdan foydalanganingiz uchun rahmat! 🙏</p>
          <button className="btn-new" onClick={onNewEmergency}>Yangi chaqiruv</button>
          <button className="btn-logout-conf" onClick={onLogout}>Chiqish</button>
        </div>
      )}

      {isRejected && (
        <div className="conf-actions">
          <p className="conf-rejected">Uzr, chaqiruvingiz bekor qilindi. Qayta urinib ko'ring.</p>
          <button className="btn-new" onClick={onNewEmergency}>Qayta yuborish</button>
          <button className="btn-logout-conf" onClick={onLogout}>Chiqish</button>
        </div>
      )}
    </div>
  );
}

export default ConfirmationScreen;
