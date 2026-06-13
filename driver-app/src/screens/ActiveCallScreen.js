import React, { useState, useEffect, useRef, useCallback } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

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

function ActiveCallScreen({ token, user, onViewHistory, onLogout }) {
  const [activeCall, setActiveCall] = useState(null);
  const [availableCalls, setAvailableCalls] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [routeInfo, setRouteInfo] = useState(null); // { duration, distance }

  const mapRef = useRef(null);
  const gMapRef = useRef(null);
  const mapInitRef = useRef(false);
  const driverMarkRef = useRef(null);
  const patientMarkRef = useRef(null);
  const availableMarksRef = useRef([]);
  const directionsRendererRef = useRef(null);
  const directionsServiceRef = useRef(null);
  const pollRef = useRef(null);
  const driverLocationRef = useRef(null);

  // ---- Load Google Maps script ----
  useEffect(() => {
    if (window.google) return;
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
    script.async = true;
    script.onload = () => {
      if (driverLocationRef.current) {
        initMap(driverLocationRef.current.lat, driverLocationRef.current.lng);
      }
    };
    document.head.appendChild(script);
  }, []);

  // ---- GPS ----
  const updateDriverLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setDriverLocation(loc);
        driverLocationRef.current = loc;
        // Init map once we have location
        if (!mapInitRef.current && window.google) {
          initMap(loc.lat, loc.lng);
        }
        // Update driver marker
        if (driverMarkRef.current) {
          driverMarkRef.current.setPosition({ lat: loc.lat, lng: loc.lng });
        }
      },
      () => {}
    );
  }, []);

  // ---- Init Google Map ----
  const initMap = useCallback((lat, lng) => {
    if (!window.google || !mapRef.current || mapInitRef.current) return;
    mapInitRef.current = true;

    const map = new window.google.maps.Map(mapRef.current, {
      center: { lat, lng },
      zoom: 14,
      disableDefaultUI: false,
      zoomControl: true,
      streetViewControl: false,
      mapTypeControl: false,
      fullscreenControl: false,
      styles: [
        { featureType: 'poi', stylers: [{ visibility: 'off' }] },
      ],
    });
    gMapRef.current = map;

    // Driver marker (blue)
    const driverMark = new window.google.maps.Marker({
      position: { lat, lng },
      map,
      title: 'Mening joyi',
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        scale: 10,
        fillColor: '#2980b9',
        fillOpacity: 1,
        strokeColor: '#fff',
        strokeWeight: 2,
      },
    });
    driverMarkRef.current = driverMark;

    // Directions service & renderer
    directionsServiceRef.current = new window.google.maps.DirectionsService();
    directionsRendererRef.current = new window.google.maps.DirectionsRenderer({
      map,
      suppressMarkers: false,
      polylineOptions: { strokeColor: '#e74c3c', strokeWeight: 5 },
    });
  }, []);

  // ---- Draw route ----
  const drawRoute = useCallback((fromLat, fromLng, toLat, toLng) => {
    if (!directionsServiceRef.current || !directionsRendererRef.current) return;

    directionsServiceRef.current.route({
      origin: { lat: fromLat, lng: fromLng },
      destination: { lat: toLat, lng: toLng },
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (status === 'OK') {
        directionsRendererRef.current.setDirections(result);
        const leg = result.routes[0].legs[0];
        setRouteInfo({
          duration: leg.duration.text,
          distance: leg.distance.text,
        });
      }
    });
  }, []);

  // ---- Clear route ----
  const clearRoute = useCallback(() => {
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setDirections({ routes: [] });
    }
    setRouteInfo(null);
  }, []);

  // ---- Update map markers when data changes ----
  useEffect(() => {
    if (!gMapRef.current || !window.google) return;

    // Clear available markers
    availableMarksRef.current.forEach(m => m.setMap(null));
    availableMarksRef.current = [];

    if (activeCall) {
      // Patient marker (red)
      if (patientMarkRef.current) {
        patientMarkRef.current.setPosition({ lat: parseFloat(activeCall.latitude), lng: parseFloat(activeCall.longitude) });
      } else {
        const m = new window.google.maps.Marker({
          position: { lat: parseFloat(activeCall.latitude), lng: parseFloat(activeCall.longitude) },
          map: gMapRef.current,
          title: `Bemor #${activeCall.id}`,
          icon: {
            url: 'https://maps.google.com/mapfiles/ms/icons/red-dot.png',
          },
        });
        patientMarkRef.current = m;
      }

      // Draw route when on_the_way
      if (activeCall.status === 'on_the_way' && driverLocation) {
        drawRoute(driverLocation.lat, driverLocation.lng, parseFloat(activeCall.latitude), parseFloat(activeCall.longitude));
      }
    } else {
      // Remove patient marker
      if (patientMarkRef.current) {
        patientMarkRef.current.setMap(null);
        patientMarkRef.current = null;
      }
      clearRoute();

      // Show available calls as markers
      availableCalls.forEach((call) => {
        const m = new window.google.maps.Marker({
          position: { lat: parseFloat(call.latitude), lng: parseFloat(call.longitude) },
          map: gMapRef.current,
          title: `Chaqiruv #${call.id}`,
          icon: {
            url: 'https://maps.google.com/mapfiles/ms/icons/orange-dot.png',
          },
        });
        m.addListener('click', () => setSelectedCall(call));
        availableMarksRef.current.push(m);
      });
    }
  }, [driverLocation, activeCall, availableCalls, drawRoute, clearRoute]);

  // ---- Fetch data ----
  const fetchData = useCallback(async () => {
    try {
      const [assignedRes, availableRes] = await Promise.all([
        fetch(`${API_URL}/api/driver/assigned-call`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/driver/available-calls`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const assignedData = await assignedRes.json();
      const availableData = await availableRes.json();
      setActiveCall(assignedData.call || null);
      setAvailableCalls(availableData.calls || []);
    } catch {}
  }, [token]);

  // ---- Polling ----
  useEffect(() => {
    updateDriverLocation();
    fetchData();
    pollRef.current = setInterval(() => {
      updateDriverLocation();
      fetchData();
    }, 10000);
    return () => clearInterval(pollRef.current);
  }, [updateDriverLocation, fetchData]);

  // ---- API actions ----
  const apiAction = async (url, method = 'PATCH') => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      await fetchData();
      return true;
    } catch (err) {
      setError(err.message);
      return false;
    } finally {
      setLoading(false);
    }
  };

  const handleAccept = async (callId) => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/driver/accept-call/${callId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      setSelectedCall(null);
      setStatusMsg('✅ Chaqiruv qabul qilindi!');
      await fetchData();
      setTimeout(() => setStatusMsg(''), 3000);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCancelCall = async () => {
    if (!window.confirm('Chaqiruvni bekor qilmoqchimisiz?')) return;
    const ok = await apiAction(`${API_URL}/api/driver/cancel/${activeCall.id}`, 'PATCH');
    if (ok) {
      setActiveCall(null);
      setStatusMsg('Chaqiruv bekor qilindi');
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleStart = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/start/${activeCall.id}`);
    if (ok && driverLocationRef.current) {
      setStatusMsg('🚗 Yo\'lga chiqdingiz!');
      drawRoute(
        driverLocationRef.current.lat, driverLocationRef.current.lng,
        parseFloat(activeCall.latitude), parseFloat(activeCall.longitude)
      );
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const handleArrived = async () => {
    clearRoute();
    const ok = await apiAction(`${API_URL}/api/driver/arrived/${activeCall.id}`);
    if (ok) { setStatusMsg('✅ Yetib bordingiz!'); setTimeout(() => setStatusMsg(''), 3000); }
  };

  const handleComplete = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/complete/${activeCall.id}`);
    if (ok) {
      setActiveCall(null);
      clearRoute();
      setStatusMsg('🏁 Chaqiruv tugatildi!');
      setTimeout(() => setStatusMsg(''), 3000);
    }
  };

  const distance = activeCall && driverLocation
    ? getDistanceKm(driverLocation.lat, driverLocation.lng, parseFloat(activeCall.latitude), parseFloat(activeCall.longitude)).toFixed(2)
    : null;

  const statusLabels = {
    assigned: { label: 'Qabul qilindi', color: '#2980b9' },
    on_the_way: { label: 'Yo\'lda', color: '#f39c12' },
    arrived: { label: 'Keldi', color: '#27ae60' },
    completed: { label: 'Tugatildi', color: '#9b59b6' },
  };
  const statusInfo = activeCall ? (statusLabels[activeCall.status] || { label: activeCall.status, color: '#7f8c8d' }) : null;

  return (
    <div className="screen">
      <div className="topbar">
        <div className="topbar-left">
          <span className="topbar-icon">🚑</span>
          <span className="topbar-title">Haydovchi</span>
        </div>
        <div className="topbar-right">
          <button className="btn-history" onClick={onViewHistory}>Ko'rish</button>
          <button className="btn-logout" onClick={onLogout}>Chiqish</button>
        </div>
      </div>

      {/* Map */}
      <div className="map-container">
        <div ref={mapRef} className="map" />
        {!driverLocation && (
          <div className="map-placeholder">
            <div className="pulse-ring" />
            <p>GPS aniqlanmoqda...</p>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="bottom-panel">
        {statusMsg && <div className="success-msg">{statusMsg}</div>}
        {error && <div className="error-msg">⚠️ {error}</div>}

        {activeCall && (
          <div className="call-card">
            <div className="call-card-header">
              <span className="call-badge">🚨 FAOL CHAQIRUV #{activeCall.id}</span>
              <span className="status-chip" style={{ backgroundColor: statusInfo?.color }}>
                {statusInfo?.label}
              </span>
            </div>

            <div className="info-grid">
              <div className="info-item">
                <span className="info-label">📍 Masofa</span>
                <span className="info-value">
                  {routeInfo ? routeInfo.distance : distance ? `${distance} km` : '—'}
                </span>
              </div>
              <div className="info-item">
                <span className="info-label">⏱️ Vaqt</span>
                <span className="info-value">{routeInfo ? routeInfo.duration : '—'}</span>
              </div>
              <div className="info-item" style={{ gridColumn: '1 / -1' }}>
                <span className="info-label">📞 Bemor tel.</span>
                <a className="info-value phone-link" href={`tel:${activeCall.caller_phone}`}>
                  {activeCall.caller_phone || '—'}
                </a>
              </div>
            </div>

            <div className="step-buttons">
              {['assigned', 'on_the_way'].includes(activeCall.status) && (
                <button className="btn-step" style={{background:'transparent',border:'1px solid #e74c3c',color:'#e74c3c',marginTop:4}} onClick={handleCancelCall} disabled={loading}>
                  ❌ Bekor qilish
                </button>
              )}
              {activeCall.status === 'assigned' && (
                <button className="btn-step btn-start" onClick={handleStart} disabled={loading}>
                  {loading ? <span className="spinner" /> : '🚗 Boshlash'}
                </button>
              )}
              {activeCall.status === 'on_the_way' && (
                <button className="btn-step btn-arrived" onClick={handleArrived} disabled={loading}>
                  {loading ? <span className="spinner" /> : '✅ Keldi'}
                </button>
              )}
              {activeCall.status === 'arrived' && (
                <button className="btn-step btn-complete" onClick={handleComplete} disabled={loading}>
                  {loading ? <span className="spinner" /> : '🏁 Tugatildi'}
                </button>
              )}
            </div>
          </div>
        )}

        {!activeCall && (
          <div className="available-section">
            <div className="available-header">
              <span className="available-title">📡 Mavjud chaqiruvlar</span>
              <span className="available-count">{availableCalls.length}</span>
            </div>
            {availableCalls.length === 0 ? (
              <div className="no-calls-row">
                <div className="waiting-dots"><span /><span /><span /></div>
                <span>Chaqiruv kutilmoqda...</span>
              </div>
            ) : (
              <div className="available-list">
                {availableCalls.map((call) => (
                  <div key={call.id} className="available-card" onClick={() => setSelectedCall(call)}>
                    <div className="available-card-left">
                      <span className="available-id">#{call.id}</span>
                      <span className="available-phone">{call.caller_phone}</span>
                    </div>
                    <div className="available-card-right">
                      {driverLocation && (
                        <span className="available-dist">
                          {getDistanceKm(driverLocation.lat, driverLocation.lng, parseFloat(call.latitude), parseFloat(call.longitude)).toFixed(1)} km
                        </span>
                      )}
                      <button className="btn-accept-small" onClick={(e) => { e.stopPropagation(); handleAccept(call.id); }}>
                        Qabul
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Modal */}
      {selectedCall && (
        <div className="modal-overlay" onClick={() => setSelectedCall(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <span className="modal-title">🚨 Chaqiruv #{selectedCall.id}</span>
              <button className="modal-close" onClick={() => setSelectedCall(null)}>✕</button>
            </div>
            <div className="modal-body">
              <div className="modal-row">
                <span className="modal-label">📞 Bemor telefoni</span>
                <a className="modal-value phone-link" href={`tel:${selectedCall.caller_phone}`}>
                  {selectedCall.caller_phone}
                </a>
              </div>
              <div className="modal-row">
                <span className="modal-label">📍 Koordinata</span>
                <span className="modal-value small">
                  {parseFloat(selectedCall.latitude).toFixed(5)}, {parseFloat(selectedCall.longitude).toFixed(5)}
                </span>
              </div>
              {driverLocation && (
                <div className="modal-row">
                  <span className="modal-label">📏 Masofa</span>
                  <span className="modal-value">
                    {getDistanceKm(driverLocation.lat, driverLocation.lng, parseFloat(selectedCall.latitude), parseFloat(selectedCall.longitude)).toFixed(2)} km
                  </span>
                </div>
              )}
              {selectedCall.description && (
                <div className="modal-row">
                  <span className="modal-label">📝 Izoh</span>
                  <span className="modal-value">{selectedCall.description}</span>
                </div>
              )}
            </div>
            <button className="btn-accept-full" onClick={() => handleAccept(selectedCall.id)} disabled={loading}>
              {loading ? <span className="spinner" /> : '✅ Qabul qilish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ActiveCallScreen;
