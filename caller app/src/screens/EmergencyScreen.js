import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../styles/EmergencyScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

let lastEmergencySendTime = 0;

function EmergencyScreen({ onSendEmergency, onBack, onNotifications, token, loading, dispatchCenterId, serviceType = 'ambulance' }) {
  const [markerLocation, setMarkerLocation] = useState(null);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [resolvedCenterId, setResolvedCenterId] = useState(dispatchCenterId || null);

  const mapRef = useRef(null);
  const gMapRef = useRef(null);
  const markerRef = useRef(null);
  const mapInitRef = useRef(false);

  // Fetch dispatch center id if not provided
  useEffect(() => {
    if (!resolvedCenterId) {
      fetch(`${API_URL}/api/dispatch-centers`)
        .then(r => r.json())
        .then(centers => {
          const center = centers.find(c => c.service_type === serviceType) || centers[0];
          if (center) setResolvedCenterId(center.id);
        })
        .catch(() => setResolvedCenterId(1));
    }
  }, [serviceType]);

  // Load Google Maps script immediately — don't wait for GPS
  useEffect(() => {
    const FALLBACK = { lat: 41.5534, lng: 60.6166 };

    const tryInit = (loc) => {
      if (window.google) { initMap(loc.lat, loc.lng); return; }
      if (document.querySelector('script[src*="maps.googleapis.com"]')) {
        const wait = setInterval(() => { if (window.google) { clearInterval(wait); initMap(loc.lat, loc.lng); } }, 50);
        return;
      }
      const script = document.createElement('script');
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
      script.async = true;
      script.onload = () => initMap(loc.lat, loc.lng);
      document.head.appendChild(script);
    };

    // Start map immediately with fallback, then snap to real GPS
    tryInit(FALLBACK);
    setMarkerLocation(FALLBACK);

    if (!navigator.geolocation) return;
    // Fast low-accuracy fix first (< 1s), then refine with high accuracy
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMarkerLocation(loc);
        if (gMapRef.current) { gMapRef.current.panTo(loc); }
        if (markerRef.current) markerRef.current.setPosition(loc);
      },
      () => {},
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 10000 }
    );
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setMarkerLocation(loc);
        if (gMapRef.current) { gMapRef.current.panTo(loc); }
        if (markerRef.current) markerRef.current.setPosition(loc);
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }, []);


  const initMap = (lat, lng) => {
    if (!mapRef.current || mapInitRef.current) return;
    mapInitRef.current = true;
    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng }, zoom: 16,
      disableDefaultUI: true,
      gestureHandling: 'greedy',
    });
    gMapRef.current = map;

    const pinSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="38" viewBox="0 0 28 38">
      <circle cx="14" cy="14" r="12" fill="#e74c3c" stroke="#fff" stroke-width="2.5"/>
      <circle cx="14" cy="14" r="5" fill="#fff"/>
      <polygon points="14,38 7,24 21,24" fill="#e74c3c"/>
    </svg>`;

    // Draggable destination pin
    const marker = new window.google.maps.Marker({
      position: { lat, lng }, map, draggable: true,
      icon: {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(pinSvg),
        scaledSize: new window.google.maps.Size(28, 38),
        anchor: new window.google.maps.Point(14, 38),
      },
    });
    markerRef.current = marker;
    marker.addListener('dragend', () => {
      const pos = marker.getPosition();
      setMarkerLocation({ lat: pos.lat(), lng: pos.lng() });
    });
    map.addListener('click', (e) => {
      const pos = { lat: e.latLng.lat(), lng: e.latLng.lng() };
      marker.setPosition(pos);
      setMarkerLocation(pos);
    });
  };

  const handleGetLocation = () => {
    if (!navigator.geolocation) return;
    const snap = (pos) => {
      const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setMarkerLocation(loc);
      if (gMapRef.current) { gMapRef.current.panTo(loc); gMapRef.current.setZoom(16); }
      if (markerRef.current) markerRef.current.setPosition(loc);
    };
    // Fast result first (cached/network), then high-accuracy refinement
    navigator.geolocation.getCurrentPosition(snap, () => {}, { enableHighAccuracy: false, timeout: 2000, maximumAge: 5000 });
    navigator.geolocation.getCurrentPosition(snap, () => {}, { enableHighAccuracy: true, timeout: 8000 });
  };

  const handleSendEmergency = async () => {
    const now = Date.now();
    if (now - lastEmergencySendTime < 2000) return;
    if (!markerLocation) { setError('Joylashuvni belgilang'); return; }
    const centerId = resolvedCenterId || 1;
    lastEmergencySendTime = now;
    setSending(true);
    setError('');
    try {
      const authToken = token || localStorage.getItem('userToken');
      const response = await axios.post(`${API_URL}/api/emergencies`, {
        latitude: markerLocation.lat,
        longitude: markerLocation.lng,
        service_type: serviceType,
        dispatch_center_id: centerId,
        description,
      }, {
        headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
        timeout: 10000,
      });
      onSendEmergency(response.data.id, markerLocation.lat, markerLocation.lng);
    } catch (err) {
      setError(err.response?.data?.error || 'Xato yuz berdi');
    } finally {
      setSending(false);
    }
  };

  const serviceTitle = serviceType === 'police' ? '🛡️ Politsiya' : serviceType === 'fire' ? "🔥 Yong'in" : '🚑 Tez Yordam';
  const btnLabel = serviceType === 'police' ? 'POLITSIYA CHAQIRISH' : serviceType === 'fire' ? "YONG'IN CHAQIRISH" : 'TEZ YORDAM CHAQIRISH';

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
        <button className="em-send-btn" onClick={handleSendEmergency} disabled={sending || loading}>
          {sending ? 'Yuborilmoqda...' : `🚑 ${btnLabel}`}
        </button>
      </div>
    </div>
  );
}

export default EmergencyScreen;
