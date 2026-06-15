import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import '../styles/DashboardScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

const CANCELLED_BY_LABELS = {
  user: '👤 Foydalanuvchi bekor qildi',
  dispatcher: '🎧 Dispetcher bekor qildi',
  driver: '🚗 Xodim bekor qildi',
};

function DashboardScreen({ token, onLogout }) {
  const [allEmergencies, setAllEmergencies] = useState([]);
  const [filteredEmergencies, setFilteredEmergencies] = useState([]);
  const [units, setUnits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('new');
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [detailEmergency, setDetailEmergency] = useState(null);

  const mapRef = useRef(null);
  const gMapRef = useRef(null);
  const mapInitRef = useRef(false);
  const unitMarkersRef = useRef({});

  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || mapInitRef.current) return;
      mapInitRef.current = true;
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.2995, lng: 69.2401 },
        zoom: 12,
        disableDefaultUI: true,
      });
      gMapRef.current = map;
    };
    if (window.google) { initMap(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const wait = setInterval(() => { if (window.google) { clearInterval(wait); initMap(); } }, 100);
      return;
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz`;
    script.async = true; script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  useEffect(() => {
    fetchAll();
    const interval = setInterval(fetchAll, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchAll = async () => {
    await Promise.all([fetchEmergencies(), fetchUnits()]);
  };

  const fetchEmergencies = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/emergencies`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      // Filter only police emergencies
      setAllEmergencies(res.data.filter(e => e.service_type === 'police'));
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchUnits = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ambulances`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setUnits(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    setFilteredEmergencies(allEmergencies.filter(e => e.status === filter));
  }, [allEmergencies, filter]);

  useEffect(() => {
    if (!gMapRef.current || !window.google) return;
    const existingIds = new Set(Object.keys(unitMarkersRef.current));
    const oneMinAgo = new Date(Date.now() - 10 * 1000);
    units.forEach((unit) => {
      if (!unit.latitude || !unit.longitude) return;
      if (!unit.last_location_update || new Date(unit.last_location_update) <= oneMinAgo) return;
      const pos = { lat: parseFloat(unit.latitude), lng: parseFloat(unit.longitude) };
      const icon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="36" height="36" viewBox="0 0 36 36">
            <rect width="36" height="36" rx="6" fill="#1565c0"/>
            <text y="26" x="18" text-anchor="middle" font-size="22">🛡️</text>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(36, 36),
        anchor: new window.google.maps.Point(18, 18),
      };
      if (unitMarkersRef.current[unit.id]) {
        unitMarkersRef.current[unit.id].setPosition(pos);
        existingIds.delete(String(unit.id));
      } else {
        const marker = new window.google.maps.Marker({
          position: pos, map: gMapRef.current,
          title: unit.unit_number, icon, zIndex: 999,
        });
        unitMarkersRef.current[unit.id] = marker;
        existingIds.delete(String(unit.id));
      }
    });
    existingIds.forEach((id) => {
      unitMarkersRef.current[id].setMap(null);
      delete unitMarkersRef.current[id];
    });
  }, [units]);

  const handleAssignUnit = async (emergencyId, unitId) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${emergencyId}/assign-ambulance`,
        { ambulance_id: unitId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchEmergencies(); setSelectedEmergency(null);
    } catch { alert('Xatolik yuz berdi'); }
  };

  const handleConfirm = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${id}/confirm`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchEmergencies(); setFilter('confirmed');
    } catch (err) { console.error(err); }
  };

  const handleReject = async (id) => {
    if (window.confirm('Bu chaqiruvni bekor qilmoqchisiz?')) {
      try {
        await axios.patch(`${API_URL}/api/emergencies/${id}/reject`, {}, { headers: { Authorization: `Bearer ${token}` } });
        fetchEmergencies(); setFilter('cancelled');
      } catch { alert('Xatolik'); }
    }
  };

  const openCoords = (lat, lng) => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  const countByStatus = (status) => allEmergencies.filter(e => e.status === status).length;

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>🛡️ Politsiya Dispetcher Markazi</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={fetchAll} disabled={loading}>Yangilash</button>
          <button className="btn-logout" onClick={onLogout}>Chiqish</button>
        </div>
      </div>

      {/* Unit assign modal */}
      {selectedEmergency && (
        <div className="modal-overlay" onClick={() => setSelectedEmergency(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Ekipaj tayinlash #{selectedEmergency.id}</h2>
            <div className="ambulance-list">
              {(() => {
                const oneMinAgo = new Date(Date.now() - 10 * 1000);
                const active = units.filter(u => u.status === 'available' && u.last_location_update && new Date(u.last_location_update) > oneMinAgo);
                if (active.length === 0) return <p>Faol ekipaj mavjud emas</p>;
                return active.map((unit) => (
                  <button key={unit.id} className="ambulance-option"
                    onClick={() => handleAssignUnit(selectedEmergency.id, unit.id)}>
                    <strong>{unit.unit_number}</strong><br />{unit.driver_name}
                  </button>
                ));
              })()}
            </div>
            <button className="modal-close" onClick={() => setSelectedEmergency(null)}>Bekor</button>
          </div>
        </div>
      )}

      {/* Detail modal */}
      {detailEmergency && (
        <div className="modal-overlay" onClick={() => setDetailEmergency(null)}>
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <h2>Chaqiruv #{detailEmergency.id}</h2>
              <button className="modal-close-x" onClick={() => setDetailEmergency(null)}>✕</button>
            </div>
            <div className="detail-grid">
              <div className="detail-section">
                <h3>👤 Foydalanuvchi</h3>
                <p><b>Telefon:</b> <a href={`tel:${detailEmergency.user_phone}`}>{detailEmergency.user_phone || '—'}</a></p>
              </div>
              <div className="detail-section">
                <h3>🛡️ Ekipaj</h3>
                <p><b>Ism:</b> {detailEmergency.driver_name || '—'}</p>
                <p><b>Telefon:</b> {detailEmergency.driver_phone || '—'}</p>
                <p><b>Birlik:</b> {detailEmergency.unit_number || '—'}</p>
              </div>
              <div className="detail-section">
                <h3>📍 Joylashuv</h3>
                <p>
                  <span className="coords-link"
                    onClick={() => openCoords(detailEmergency.latitude, detailEmergency.longitude)}>
                    {parseFloat(detailEmergency.latitude).toFixed(5)}, {parseFloat(detailEmergency.longitude).toFixed(5)} 📗
                  </span>
                </p>
              </div>
              <div className="detail-section">
                <h3>📋 Holat</h3>
                <p><b>Status:</b> {detailEmergency.status}</p>
                <p><b>Vaqt:</b> {new Date(detailEmergency.created_at).toLocaleString()}</p>
                {detailEmergency.description && <p><b>Tavsif:</b> {detailEmergency.description}</p>}
                {detailEmergency.cancelled_by && (
                  <p><b>Bekor qildi:</b> {CANCELLED_BY_LABELS[detailEmergency.cancelled_by] || detailEmergency.cancelled_by}</p>
                )}
              </div>
            </div>
            <button className="modal-close" onClick={() => setDetailEmergency(null)}>Yopish</button>
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <div className="map-section" style={{position:'relative'}}>
          <div ref={mapRef} className="dashboard-map" />
          <button
            onClick={() => {
              if (!gMapRef.current) return;
              const tenSec = new Date(Date.now() - 10 * 1000);
              const active = units.filter(u => u.latitude && u.longitude && u.last_location_update && new Date(u.last_location_update) > tenSec);
              if (active.length === 0) return;
              if (active.length === 1) { gMapRef.current.panTo({ lat: parseFloat(active[0].latitude), lng: parseFloat(active[0].longitude) }); gMapRef.current.setZoom(15); }
              else { const b = new window.google.maps.LatLngBounds(); active.forEach(u => b.extend({ lat: parseFloat(u.latitude), lng: parseFloat(u.longitude) })); gMapRef.current.fitBounds(b, 60); }
            }}
            style={{ position:'absolute', bottom:120, right:10, zIndex:1500, background:'#fff', border:'none', borderRadius:8, width:40, height:40, fontSize:22, cursor:'pointer', boxShadow:'0 2px 6px rgba(0,0,0,0.3)', display:'flex', alignItems:'center', justifyContent:'center' }}
            title="Ekipajlarni ko'rsatish"
          >📍</button>
          <div className="map-legend">
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#1565c0', display: 'inline-block' }} />
              Ekipajlar joyi (jonli)
            </span>
          </div>
        </div>

        <div className="emergencies-section">
          <div className="filter-tabs">
            {[
              { key: 'new', label: 'Yangi' },
              { key: 'confirmed', label: 'Tasdiqlandi' },
              { key: 'assigned', label: 'Qabul qilindi' },
              { key: 'on_the_way', label: "Yo'lda" },
              { key: 'arrived', label: 'Keldi' },
              { key: 'completed', label: 'Tugatildi' },
              { key: 'cancelled', label: 'Bekor qilindi' },
            ].map(({ key, label }) => (
              <button key={key} className={`tab ${filter === key ? 'active' : ''}`}
                onClick={() => setFilter(key)}>
                {label} ({countByStatus(key)})
              </button>
            ))}
          </div>

          <div className="emergencies-list">
            {filteredEmergencies.length === 0 ? (
              <p className="no-emergencies">Chaqiruvlar yo'q</p>
            ) : filteredEmergencies.map((e) => (
              <div key={e.id} className="emergency-item" onClick={() => setDetailEmergency(e)}>
                <div className="emergency-info">
                  <p className="emergency-id">#{e.id}</p>
                  <p className="emergency-type">🛡️ POLITSIYA</p>
                  {e.user_phone && <p className="emergency-phone">📞 {e.user_phone}</p>}
                  {e.unit_number && <p className="ambulance-assigned">🛡️ {e.unit_number}</p>}
                  {e.driver_name && <p className="driver-name">👤 {e.driver_name}</p>}
                  <p className="emergency-location coords-click"
                    onClick={(ev) => { ev.stopPropagation(); openCoords(e.latitude, e.longitude); }}>
                    📍 {parseFloat(e.latitude).toFixed(4)}, {parseFloat(e.longitude).toFixed(4)} 📗
                  </p>
                  <p className="emergency-time">{new Date(e.created_at).toLocaleTimeString()}</p>
                  {e.cancelled_by && <p className="cancelled-by-label">{CANCELLED_BY_LABELS[e.cancelled_by]}</p>}
                </div>
                <div className="emergency-actions" onClick={(ev) => ev.stopPropagation()}>
                  {e.status === 'new' && (<>
                    <button className="btn-action btn-confirm" onClick={() => handleConfirm(e.id)}>Tasdiqlash</button>
                    <button className="btn-action btn-assign" onClick={() => setSelectedEmergency(e)}>Ekipaj</button>
                    <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                  </>)}
                  {e.status === 'confirmed' && (<>
                    <button className="btn-action btn-assign" onClick={() => setSelectedEmergency(e)}>Ekipaj tayinlash</button>
                    <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                  </>)}
                  {e.status === 'assigned' && (
                    <p style={{ fontSize: 11, color: '#27ae60', margin: 0 }}>✅ Ekipaj qabul qildi</p>
                  )}
                  {e.status === 'on_the_way' && (
                    <p style={{ fontSize: 11, color: '#1565c0', margin: 0 }}>🚗 Ekipaj yo'lda</p>
                  )}
                  {e.status === 'arrived' && (
                    <p style={{ fontSize: 11, color: '#27ae60', margin: 0 }}>✅ Ekipaj yetib keldi</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;
