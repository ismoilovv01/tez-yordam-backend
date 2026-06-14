import React, { useState, useEffect, useRef } from 'react';
import '../styles/ConfirmationScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

const STATUSES = {
  new:       { icon: '📋', title: 'Chaqiruv yuborildi',         subtitle: "Dispetcher ko'rib chiqmoqda...", color: '#f39c12', step: 1 },
  confirmed: { icon: '✅', title: 'Tasdiqlandi',                 subtitle: 'Dispetcher chaqiruvingizni tasdiqladi', color: '#2980b9', step: 2 },
  assigned:  { icon: '🚑', title: 'Haydovchi qabul qildi',       subtitle: "Tez yordam mashinasi yo'lga chiqmoqda", color: '#8e44ad', step: 3 },
  on_the_way:{ icon: '🚑', title: "Yo'lda",                      subtitle: 'Tez yordam mashinasi sizga kelmoqda', color: '#e67e22', step: 4 },
  arrived:   { icon: '🏥', title: 'Yetib keldi',                 subtitle: 'Tez yordam mashinasi sizning joyingizda', color: '#27ae60', step: 5 },
  completed: { icon: '🏁', title: 'Tugatildi',                   subtitle: 'Chaqiruv muvaffaqiyatli yakunlandi', color: '#27ae60', step: 6 },
  cancelled: { icon: '❌', title: 'Bekor qilindi',               subtitle: 'Chaqiruv bekor qilindi', color: '#e74c3c', step: 0 },
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

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function ConfirmationScreen({ emergencyId, userToken, callerLocation, onNewEmergency, onBack, onLogout, onFeedback }) {
  const [status, setStatus]                       = useState('new');
  const [cancelledBy, setCancelledBy]             = useState(null);
  const [ambulanceInfo, setAmbulanceInfo]         = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [eta, setEta]                             = useState(null);
  const [showCancelScreen, setShowCancelScreen]   = useState(false);
  const [countdown, setCountdown]                 = useState(5);
  const [sheetExpanded, setSheetExpanded]         = useState(false); // bottom sheet state

  const pollRef               = useRef(null);
  const countdownRef          = useRef(null);
  const mapRef                = useRef(null);
  const gMapRef               = useRef(null);
  const mapInitRef            = useRef(false);
  const callerMarkRef         = useRef(null);
  const ambulanceMarkRef      = useRef(null);
  const directionsServiceRef  = useRef(null);
  const directionsRendererRef = useRef(null);
  const cancelShownRef        = useRef(false);
  const mapFittedRef          = useRef(false); // only fit bounds once

  // drag state
  const dragStartY   = useRef(null);
  const dragging     = useRef(false);

  // ── Cancel ─────────────────────────────────────────────────────
  const handleCancel = async () => {
    if (!window.confirm('Chaqiruvni bekor qilmoqchimisiz?')) return;
    try {
      await fetch(`${API_URL}/api/emergencies/${emergencyId}/cancel`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${userToken}` },
      });
      triggerCancelScreen('user');
    } catch {}
  };

  const triggerCancelScreen = (by) => {
    if (cancelShownRef.current) return;
    cancelShownRef.current = true;
    clearInterval(pollRef.current);
    setCancelledBy(by);
    setShowCancelScreen(true);
    let count = 5;
    setCountdown(count);
    countdownRef.current = setInterval(() => {
      count--;
      setCountdown(count);
      if (count <= 0) { clearInterval(countdownRef.current); onBack(); }
    }, 1000);
  };

  // ── ETA ────────────────────────────────────────────────────────
  const fetchEta = (ambLat, ambLng) => {
    if (!callerLocation || !window.google) return;
    if (!directionsServiceRef.current)
      directionsServiceRef.current = new window.google.maps.DirectionsService();
    if (!directionsRendererRef.current && gMapRef.current) {
      directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
        map: gMapRef.current,
        suppressMarkers: true,
        polylineOptions: { strokeColor: '#e74c3c', strokeWeight: 5 },
      });
    }
    directionsServiceRef.current.route({
      origin: { lat: ambLat, lng: ambLng },
      destination: callerLocation,
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (result, s) => {
      if (s === 'OK') {
        const leg = result.routes[0].legs[0];
        setEta({ distance: leg.distance.text, duration: leg.duration.text });
        if (directionsRendererRef.current)
          directionsRendererRef.current.setDirections(result);
      }
    });
  };

  // ── Fetch status every 1s ──────────────────────────────────────
  const fetchStatus = async () => {
    if (!emergencyId || !userToken) return;
    try {
      const res  = await fetch(`${API_URL}/api/emergencies/${emergencyId}`, {
        headers: { Authorization: `Bearer ${userToken}` },
      });
      const data = await res.json();
      if (!res.ok) return;

      setStatus(data.status);

      if ((data.status === 'cancelled' || data.status === 'rejected') && !cancelShownRef.current) {
        triggerCancelScreen(data.cancelled_by || 'dispatcher');
        return;
      }

      if (data.unit_number) {
        const plateLabel = data.plate_region
          ? `${data.plate_region} ${data.unit_number}`
          : data.unit_number;
        setAmbulanceInfo(plateLabel);
      }

      if (data.amb_lat && data.amb_lng) {
        const ambLat = parseFloat(data.amb_lat);
        const ambLng = parseFloat(data.amb_lng);
        setAmbulanceLocation({ lat: ambLat, lng: ambLng });
        if (data.status === 'on_the_way') fetchEta(ambLat, ambLng);
      }
    } catch {}
  };

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 1000);
    return () => { clearInterval(pollRef.current); clearInterval(countdownRef.current); };
  }, [emergencyId, userToken]);

  // ── Init map ───────────────────────────────────────────────────
  useEffect(() => {
    if (mapInitRef.current || !mapRef.current) return;
    if (window.google) { initMap(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const wait = setInterval(() => { if (window.google) { clearInterval(wait); initMap(); } }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
    script.async = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (mapInitRef.current || !mapRef.current) return;
    mapInitRef.current = true;
    const center = callerLocation || { lat: 41.2995, lng: 69.2401 };
    const map = new window.google.maps.Map(mapRef.current, {
      center, zoom: 14,
      mapTypeControl: false, streetViewControl: false,
      fullscreenControl: false, zoomControl: true,
    });
    gMapRef.current = map;
    if (callerLocation) {
      callerMarkRef.current = new window.google.maps.Marker({
        position: callerLocation, map,
        title: 'Sizning joyingiz',
        icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' },
      });
    }
  };

  // ── Update ambulance marker — NO map snapping after first fit ───
  useEffect(() => {
    if (!gMapRef.current || !window.google || !ambulanceLocation) return;
    if (ambulanceMarkRef.current) {
      ambulanceMarkRef.current.setPosition(ambulanceLocation);
      // DO NOT call fitBounds again — user can freely pan
    } else {
      const icon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
            <rect width="44" height="44" rx="10" fill="#e74c3c"/>
            <text y="32" x="22" text-anchor="middle" font-size="26">🚑</text>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(44, 44),
        anchor: new window.google.maps.Point(22, 22),
      };
      ambulanceMarkRef.current = new window.google.maps.Marker({
        position: ambulanceLocation, map: gMapRef.current,
        title: 'Tez yordam', icon, zIndex: 999,
      });
      // Only fit bounds ONCE when ambulance first appears
      if (!mapFittedRef.current && callerLocation) {
        mapFittedRef.current = true;
        const bounds = new window.google.maps.LatLngBounds();
        bounds.extend(callerLocation);
        bounds.extend(ambulanceLocation);
        gMapRef.current.fitBounds(bounds, { padding: 80 });
      }
    }
  }, [ambulanceLocation]);

  // ── Bottom sheet drag handlers ──────────────────────────────────
  const handleDragStart = (e) => {
    dragging.current = true;
    dragStartY.current = e.type === 'touchstart' ? e.touches[0].clientY : e.clientY;
  };

  const handleDragEnd = (e) => {
    if (!dragging.current) return;
    dragging.current = false;
    const endY = e.type === 'touchend' ? e.changedTouches[0].clientY : e.clientY;
    const diff = dragStartY.current - endY;
    if (diff > 40) setSheetExpanded(true);   // swipe up
    if (diff < -40) setSheetExpanded(false);  // swipe down
  };

  const currentStatus = STATUSES[status] || STATUSES.new;
  const currentStep   = currentStatus.step;
  const isCompleted   = status === 'completed';
  const isTerminated  = status === 'cancelled' || status === 'rejected';
  const canCancel     = !['completed', 'cancelled', 'rejected', 'arrived'].includes(status);
  const distanceKm    = ambulanceLocation && callerLocation
    ? getDistanceKm(ambulanceLocation.lat, ambulanceLocation.lng, callerLocation.lat, callerLocation.lng).toFixed(1)
    : null;

  // ── Cancellation screen ──────────────────────────────────────────
  if (showCancelScreen) {
    const msgs = {
      user:       'Siz chaqiruvni bekor qildingiz.',
      driver:     "Haydovchi chaqiruvni bekor qildi. Iltimos qayta urinib ko'ring.",
      dispatcher: "Dispetcher chaqiruvni bekor qildi. Iltimos qayta urinib ko'ring.",
    };
    return (
      <div className="cancel-screen">
        <div className="cancel-icon">❌</div>
        <h2 className="cancel-title">Chaqiruv bekor qilindi</h2>
        <p className="cancel-msg">{msgs[cancelledBy] || msgs.dispatcher}</p>
        <div className="cancel-countdown">
          <div className="cancel-countdown-circle">{countdown}</div>
          <p>soniyada bosh sahifaga qaytasiz</p>
        </div>
        <button className="btn-new" onClick={() => { clearInterval(countdownRef.current); onBack(); }}>
          Hozir qaytish
        </button>
      </div>
    );
  }

  return (
    <div className="confirmation-container">
      {/* Status bar */}
      <div className="conf-status-bar" style={{ background: currentStatus.color }}>
        <div className="conf-pulse-container">
          {['', 'delay1', 'delay2'].map((d, i) => (
            <div key={i} className={`conf-pulse-ring ${d}`} />
          ))}
          <div className="conf-center-icon">{currentStatus.icon}</div>
        </div>
        <div className="conf-status-text">
          <h1 className="conf-title">{currentStatus.title}</h1>
          <p className="conf-subtitle">{currentStatus.subtitle}</p>
        </div>
        {emergencyId && <div className="conf-id">#{emergencyId}</div>}
      </div>

      {/* Map — full screen */}
      <div className="conf-map-container">
        <div ref={mapRef} className="conf-map" />
        {ambulanceLocation && (
          <div className="conf-map-legend">
            <span>🔴 Sizning joyingiz</span>
            <span>🚑 Tez yordam{ambulanceInfo ? ` (${ambulanceInfo})` : ''}</span>
          </div>
        )}
      </div>

      {/* Draggable bottom sheet */}
      <div
        className={`conf-bottom ${sheetExpanded ? 'expanded' : 'collapsed'}`}
        onTouchStart={handleDragStart}
        onTouchEnd={handleDragEnd}
        onMouseDown={handleDragStart}
        onMouseUp={handleDragEnd}
      >
        {/* Drag handle */}
        <div className="sheet-handle" onClick={() => setSheetExpanded(!sheetExpanded)}>
          <div className="sheet-handle-bar" />
          <span className="sheet-handle-hint">
            {sheetExpanded ? '▼ Yopish' : '▲ Ko\'proq ko\'rish'}
          </span>
        </div>

        {/* ETA card — always visible even when collapsed */}
        {ambulanceLocation && ['assigned', 'on_the_way'].includes(status) && (
          <div className="eta-card">
            <div className="eta-item">
              <span className="eta-label">📍 Masofa</span>
              <span className="eta-value">{eta ? eta.distance : distanceKm ? `${distanceKm} km` : '...'}</span>
            </div>
            <div className="eta-divider" />
            <div className="eta-item">
              <span className="eta-label">⏱ ETA</span>
              <span className="eta-value">{eta ? eta.duration : '...'}</span>
            </div>
            <div className="eta-divider" />
            <div className="eta-item">
              <span className="eta-label">🚑 Mashina</span>
              <span className="eta-value">{ambulanceInfo || '...'}</span>
            </div>
          </div>
        )}

        {/* Content shown only when expanded */}
        {sheetExpanded && (
          <>
            {!isTerminated && (
              <div className="progress-steps">
                {STEPS.map((step, idx) => {
                  const stepNum = idx + 1;
                  const done   = currentStep >= stepNum;
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
          </>
        )}

        {/* Cancel button — always visible */}
        {canCancel && (
          <button className="btn-cancel-request" onClick={handleCancel}>
            ❌ Chaqiruvni bekor qilish
          </button>
        )}

        {!isCompleted && !isTerminated && (
          <div className="conf-waiting">
            <div className="waiting-dots"><span /><span /><span /></div>
            <p>Yangilanmoqda...</p>
          </div>
        )}

        {isCompleted && (
          <div className="conf-actions">
            <p className="conf-thanks">Xizmatimizdan foydalanganingiz uchun rahmat! 🙏</p>
            <button className="btn-feedback" onClick={onFeedback}>⭐ Chaqiruvni baholash</button>
            <button className="btn-new" onClick={onNewEmergency}>Yangi chaqiruv</button>
            <button className="btn-logout-conf" onClick={onLogout}>Chiqish</button>
          </div>
        )}
      </div>
    </div>
  );
}

export default ConfirmationScreen;


