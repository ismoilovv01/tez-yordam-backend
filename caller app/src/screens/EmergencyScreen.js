import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../styles/EmergencyScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

let lastEmergencySendTime = 0;

const PIN_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
  <circle cx="14" cy="14" r="12" fill="#e74c3c" stroke="#fff" stroke-width="2.5"/>
  <circle cx="14" cy="14" r="5" fill="#fff"/>
  <polygon points="14,38 7,24 21,24" fill="#e74c3c"/>
</svg>`;

const PIN_ICON = () => ({
  url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(PIN_SVG),
  scaledSize: new window.google.maps.Size(28, 38),
  anchor: new window.google.maps.Point(14, 38),
});

function EmergencyScreen({ onSendEmergency, onBack, onNotifications, token, dispatchCenterId, serviceType = 'ambulance' }) {
  const [markerLocation, setMarkerLocation] = useState(null);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [gpsReady, setGpsReady] = useState(false);
  const [resolvedCenterId, setResolvedCenterId] = useState(dispatchCenterId || null);

  const mapRef = useRef(null);
  const gMapRef = useRef(null);
  const markerRef = useRef(null);
  const mapInitRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Resolve dispatch center ID immediately
  useEffect(() => {
    if (resolvedCenterId) return;
    fetch(`${API_URL}/api/dispatch-centers`)
      .then(r => r.json())
      .then(centers => {
        if (!mountedRef.current) return;
        const center = centers.find(c => c.service_type === serviceType) || centers[0];
        if (center) setResolvedCenterId(center.id);
        else setResolvedCenterId(1);
      })
      .catch(() => { if (mountedRef.current) setResolvedCenterId(1); });
  }, [serviceType]);

  // Load Maps script immediately, then get GPS
  useEffect(() => {
    const ensureMaps = (cb) => {
      if (window.google?.maps) { cb(); return; }
      if (document.querySelector('script[src*="maps.googleapis.com"]')) {
        const t = setInterval(() => { if (window.google?.maps) { clearInterval(t); cb(); } }, 50);
        return;
      }
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
      s.async = true;
      s.onload = cb;
      document.head.appendChild(s);
    };

    ensureMaps(() => {
      if (!mountedRef.current) return;
      // Init map at Xorazm center immediately so map shows fast
      const XORAZM = { lat: 41.5534, lng: 60.6166 };
      initMap(XORAZM.lat, XORAZM.lng, false); // false = don't place marker yet

      // Fast GPS (cached/network location, < 1s)
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mountedRef.current) return;
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            placeOrMoveMarker(loc);
          },
          () => {
            // If GPS denied/failed, place marker at map center so user can drag
            if (!mountedRef.current || markerRef.current) return;
            placeOrMoveMarker(XORAZM);
          },
          { enableHighAccuracy: false, timeout: 3000, maximumAge: 15000 }
        );
        // Then refine with high accuracy
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (!mountedRef.current) return;
            const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            placeOrMoveMarker(loc);
          },
          () => {},
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        placeOrMoveMarker(XORAZM);
      }
    });
  }, []);

  const initMap = (lat, lng, placeMarker = true) => {
    if (!mapRef.current || mapInitRef.current) return;
    mapInitRef.current = true;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng }, zoom: 16,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
    });
    gMapRef.current = map;
    map.addListener('click', (e) => {
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      placeOrMoveMarker(pos);
    });
    if (placeMarker) placeOrMoveMarker({ lat, lng });
  };

  const placeOrMoveMarker = (loc) => {
    if (!mountedRef.current) return;
    setMarkerLocation(loc);
    setGpsReady(true);
    if (!gMapRef.current) return;
    if (markerRef.current) {
      markerRef.current.setPosition(loc);
      gMapRef.current.panTo(loc);
    } else {
      const marker = new window.google.maps.Marker({
        position: loc, map: gMapRef.current, draggable: true,
        icon: PIN_ICON(),
      });
      markerRef.current = marker;
      marker.addListener('dragend', () => {
        const p = marker.getPosition();
        setMarkerLocation({ lat: p.lat(), lng: p.lng() });
      });
      gMapRef.current.panTo(loc);
    }
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => placeOrMoveMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: false, timeout: 2000, maximumAge: 5000 }
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => placeOrMoveMarker({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  };

  const handleSendEmergency = async () => {
    const now = Date.now();
    if (now - lastEmergencySendTime < 2000) return;
    if (!markerLocation) { setError("Joylashuvni aniqlash kutilmoqda..."); return; }
    if (!resolvedCenterId) { setError("Dispatch markaz aniqlanmoqda..."); return; }
    lastEmergencySendTime = now;
    setSending(true);
    setError('');
    try {
      const authToken = token || localStorage.getItem('userToken');
      const response = await axios.post(`${API_URL}/api/emergencies`, {
        latitude: markerLocation.lat,
        longitude: markerLocation.lng,
        service_type: serviceType,
        dispatch_center_id: resolvedCenterId,
        description,
      }, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      if (!response.data?.id) throw new Error("Server xatosi");
      onSendEmergency(response.data.id, markerLocation.lat, markerLocation.lng);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Xato yuz berdi. Qayta urining.');
      setSending(false);
    }
  };

  const serviceTitle = serviceType === 'police' ? '🛡️ Politsiya' : serviceType === 'fire' ? "🔥 Yong'in" : '🚑 Tez Yordam';
  const btnLabel = serviceType === 'police' ? 'POLITSIYA CHAQIRISH' : serviceType === 'fire' ? "YONG'IN CHAQIRISH" : 'TEZ YORDAM CHAQIRISH';
  const canSend = gpsReady && resolvedCenterId && !sending;

  return (
    <div className="em-container">
      <div className="em-map-wrapper">
        <div ref={mapRef} className="em-map" />
        <button className="em-back-btn" onClick={onBack}>←</button>
        <div className="em-map-title">{serviceTitle}</div>
        <button className="em-notif-btn" onClick={onNotifications}>
          🔔<div className="em-notif-dot" />
        </button>
        <button className="em-locate-btn" onClick={handleGetLocation} aria-label="Joylashuvni aniqlash">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="3" fill="#4285F4"/>
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#4285F4" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
        {!gpsReady && (
          <div style={{position:'absolute',bottom:8,left:'50%',transform:'translateX(-50%)',
            background:'rgba(0,0,0,0.6)',color:'#fff',padding:'6px 14px',borderRadius:20,fontSize:12}}>
            📍 Joylashuv aniqlanmoqda...
          </div>
        )}
      </div>
      <div className="em-bottom">
        {error && <div className="em-error">⚠️ {error}</div>}
        <textarea
          className="em-textarea"
          placeholder="Qo'shimcha ma'lumot (ixtiyoriy)..."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={sending}
          rows={2}
        />
        <button className="em-send-btn" onClick={handleSendEmergency} disabled={!canSend}>
          {sending ? 'Yuborilmoqda...' : !gpsReady ? '📍 Joylashuv kutilmoqda...' : `🚑 ${btnLabel}`}
        </button>
      </div>
    </div>
  );
}

export default EmergencyScreen;
