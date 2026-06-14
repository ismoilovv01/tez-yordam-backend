import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';
import '../styles/DashboardScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [0, 0.3, 0.6].forEach(t => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = 880; g.gain.setValueAtTime(0.3, ctx.currentTime + t);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.25);
      o.start(ctx.currentTime + t); o.stop(ctx.currentTime + t + 0.3);
    });
  } catch {}
}

const CANCELLED_BY_LABELS = {
  user: '👤 Foydalanuvchi bekor qildi',
  dispatcher: '🎧 Dispetcher bekor qildi',
  driver: '🚗 Haydovchi bekor qildi',
};

const STATUS_UZ = {
  new: 'Yangi',
  confirmed: 'Tasdiqlandi',
  assigned: 'Haydovchi qabul qildi',
  on_the_way: "Yo'lda",
  arrived: 'Yetib keldi',
  completed: 'Tugatildi',
  cancelled: 'Bekor qilindi',
};

const SERVICE_UZ = {
  ambulance: 'Tez Yordam',
  police: 'Politsiya',
  fire: "Yong'in xavfsizligi",
};

const AMB_STATUS_COLOR = {
  available: '#27ae60',
  on_the_way: '#f39c12',
  busy: '#e74c3c',
  arrived: '#8e44ad',
};

const UZ_REGIONS = {
  '01': "Toshkent shahri",
  '10': "Toshkent viloyati",
  '20': "Sirdaryo viloyati",
  '25': "Jizzax viloyati",
  '30': "Samarqand viloyati",
  '40': "Farg'ona viloyati",
  '50': "Namangan viloyati",
  '60': "Andijon viloyati",
  '70': "Qashqadaryo viloyati",
  '75': "Surxondaryo viloyati",
  '80': "Buxoro viloyati",
  '85': "Navoiy viloyati",
  '90': "Xorazm viloyati",
  '95': "Qoraqalpog'iston Respublikasi",
};

function DashboardScreen({ token, user, onLogout }) {
  const [allEmergencies, setAllEmergencies] = useState([]);
  const [filteredEmergencies, setFilteredEmergencies] = useState([]);
  const [ambulances, setAmbulances] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('new');
  const [selectedEmergency, setSelectedEmergency] = useState(null);
  const [detailEmergency, setDetailEmergency] = useState(null);
  const [connected, setConnected] = useState(false);
  const [drivers, setDrivers] = useState([]);
  const [showDrivers, setShowDrivers] = useState(false);
  const [newDriverModal, setNewDriverModal] = useState(false);
  const [newDriverName, setNewDriverName] = useState('');
  const [newDriverPhone, setNewDriverPhone] = useState('');
  const [newDriverUnit, setNewDriverUnit] = useState('');
  const [newDriverPlate, setNewDriverPlate] = useState('');
  const [generatedCode, setGeneratedCode] = useState('');
  const [driverLoading, setDriverLoading] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [mapFilter, setMapFilter] = useState('all');
  const [selectedMapDriver, setSelectedMapDriver] = useState(null);
  const [alertCount, setAlertCount] = useState(0);
  const prevNewIdsRef = useRef(new Set());

  const mapRef = useRef(null);
  const gMapRef = useRef(null);
  const mapInitRef = useRef(false);
  const ambulanceMarkersRef = useRef({});
  const tokenRef = useRef(token);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Load Google Maps
  useEffect(() => {
    const initMap = () => {
      if (!mapRef.current || mapInitRef.current) return;
      mapInitRef.current = true;
      const map = new window.google.maps.Map(mapRef.current, {
        center: { lat: 41.5534, lng: 60.6166 },
        zoom: 12,
        mapTypeControl: false,
        streetViewControl: false,
        fullscreenControl: false,
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
    script.async = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  // Request browser notification permission
  useEffect(() => {
    if (Notification.permission === 'default') Notification.requestPermission();
  }, []);

  // Socket.io + polling
  useEffect(() => {
    fetchAll();
    fetchDrivers();

    const interval = setInterval(fetchAll, 5000);

    const socket = io(API_URL, {
      transports: ['websocket', 'polling'],
      auth: { token },
    });

    socket.on('connect', () => { setConnected(true); });
    socket.on('disconnect', () => { setConnected(false); });
    socket.on('emergency_created', () => { fetchEmergencies(); });
    socket.on('emergency_updated', () => { fetchEmergencies(); });
    socket.on('ambulance_updated', () => { fetchAmbulances(); });

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const fetchDrivers = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/dispatcher/drivers`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setDrivers(res.data);
    } catch {}
  };

  const handleCreateDriver = async () => {
    if (!newDriverName || !newDriverUnit) return alert("Ism va mashina raqami kerak");
    if (!newDriverPhone) return alert("Telefon raqami majburiy");
    if (!newDriverPlate) return alert("Viloyat kodi majburiy (masalan: 01, 90)");
    setDriverLoading(true);
    try {
      const res = await axios.post(`${API_URL}/api/dispatcher/create-driver-code`,
        { unit_number: newDriverUnit, driver_name: newDriverName, driver_phone: newDriverPhone, plate_region: newDriverPlate },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setGeneratedCode(res.data.login_code);
      setNewDriverName(''); setNewDriverPhone(''); setNewDriverUnit(''); setNewDriverPlate('');
      fetchDrivers();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
    setDriverLoading(false);
  };

  const handleEditDriver = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/dispatcher/drivers/${id}`,
        { driver_name: editName, driver_phone: editPhone, unit_number: editUnit, plate_region: editPlate },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setSelectedDriver(null); setEditMode(false);
      fetchDrivers();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
  };

  const handleDeleteDriver = async (id) => {
    if (!window.confirm("Hodimni o'chirasizmi?")) return;
    try {
      await axios.delete(`${API_URL}/api/dispatcher/drivers/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      setSelectedDriver(null);
      fetchDrivers();
    } catch {}
  };

  const fetchAll = async () => {
    await Promise.all([fetchEmergencies(), fetchAmbulances()]);
  };

  const playAlert = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.35, 0.7].forEach(t => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = 880;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + 0.28);
        osc.start(ctx.currentTime + t);
        osc.stop(ctx.currentTime + t + 0.28);
      });
    } catch {}
  };

  const fetchEmergencies = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_URL}/api/emergencies`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      const list = res.data;
      setAllEmergencies(list);
      // Detect brand-new 'new' emergencies
      const currentNewIds = new Set(list.filter(e => e.status === 'new').map(e => e.id));
      const genuinelyNew = [...currentNewIds].filter(id => !prevNewIdsRef.current.has(id));
      if (genuinelyNew.length > 0 && prevNewIdsRef.current.size > 0) {
        setAlertCount(n => n + genuinelyNew.length);
        playAlert();
        if (Notification.permission === 'granted') {
          new Notification('🚨 Yangi chaqiruv!', { body: `${genuinelyNew.length} ta yangi favqulotiy vaziyat`, icon: '/favicon.ico' });
        }
      }
      prevNewIdsRef.current = currentNewIds;
    } catch (err) { console.error(err); }
    setLoading(false);
  };

  const fetchAmbulances = async () => {
    try {
      const res = await axios.get(`${API_URL}/api/ambulances`, {
        headers: { Authorization: `Bearer ${tokenRef.current}` },
      });
      setAmbulances(res.data);
    } catch (err) { console.error(err); }
  };

  useEffect(() => {
    setFilteredEmergencies(allEmergencies.filter(e => e.status === filter));
  }, [allEmergencies, filter]);

  // Update ambulance markers — re-runs when ambulances OR mapFilter changes
  useEffect(() => {
    if (!gMapRef.current || !window.google) return;
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);

    const visible = ambulances.filter(amb => {
      if (!amb.latitude || !amb.longitude) return false;
      if (!amb.last_location_update) return false;
      if (new Date(amb.last_location_update) <= tenMinutesAgo) return false;
      if (mapFilter === 'all') return true;
      if (mapFilter === 'available') return amb.status === 'available';
      if (mapFilter === 'on_the_way') return amb.status === 'on_the_way' || amb.status === 'busy';
      if (mapFilter === 'arrived') return amb.status === 'arrived';
      return true;
    });

    const visibleIds = new Set(visible.map(a => String(a.id)));

    Object.keys(ambulanceMarkersRef.current).forEach((id) => {
      ambulanceMarkersRef.current[id].setMap(null);
      delete ambulanceMarkersRef.current[id];
    });

    visible.forEach((amb) => {
      const color = AMB_STATUS_COLOR[amb.status] || '#2980b9';
      const pos = { lat: parseFloat(amb.latitude), lng: parseFloat(amb.longitude) };
      const icon = {
        url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(`
          <svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52">
            <ellipse cx="22" cy="48" rx="10" ry="4" fill="rgba(0,0,0,0.18)"/>
            <rect x="2" y="2" width="40" height="40" rx="10" fill="${color}" stroke="white" stroke-width="2.5"/>
            <text y="30" x="22" text-anchor="middle" font-size="24">🚑</text>
          </svg>
        `),
        scaledSize: new window.google.maps.Size(44, 52),
        anchor: new window.google.maps.Point(22, 48),
      };

      const marker = new window.google.maps.Marker({
        position: pos,
        map: gMapRef.current,
        title: `${amb.unit_number} — ${amb.driver_name || ''}`,
        icon,
        zIndex: 999,
      });

      marker.addListener('click', () => {
        const activeEmergency = allEmergencies.find(e =>
          e.assigned_ambulance_id === amb.id &&
          ['assigned', 'on_the_way', 'arrived'].includes(e.status)
        );
        setSelectedMapDriver({ amb, emergency: activeEmergency || null });
        gMapRef.current.panTo(pos);
      });

      ambulanceMarkersRef.current[String(amb.id)] = marker;
    });
  }, [ambulances, mapFilter, allEmergencies]);

  const handleAssignAmbulance = async (emergencyId, ambulanceId) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${emergencyId}/assign-ambulance`,
        { ambulance_id: ambulanceId },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      fetchEmergencies(); setSelectedEmergency(null);
    } catch { alert('Ambulans belgilashda xatolik'); }
  };

  const handleConfirm = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${id}/confirm`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchEmergencies(); setFilter('confirmed');
    } catch (err) { console.error(err); }
  };

  const handleReject = async (id) => {
    if (window.confirm('Siz bu favqulotiy vaziyatni bekor qilmoqchisiz?')) {
      try {
        await axios.patch(`${API_URL}/api/emergencies/${id}/reject`, {}, { headers: { Authorization: `Bearer ${token}` } });
        fetchEmergencies(); setFilter('cancelled');
      } catch { alert('Xatolik'); }
    }
  };

  const handleComplete = async (id) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${id}/complete`, {}, { headers: { Authorization: `Bearer ${token}` } });
      fetchEmergencies(); setFilter('completed');
    } catch (err) { console.error(err); }
  };

  const openCoords = (lat, lng) => window.open(`https://www.google.com/maps?q=${lat},${lng}`, '_blank');
  const countByStatus = (status) => allEmergencies.filter(e => e.status === status).length;
  const getAssignedAmbulance = (ambulanceId) => ambulances.find(a => a.id === ambulanceId);

  return (
    <div className="dashboard-container">
      <div className="dashboard-header">
        <h1>
          {user?.center_name || 'Dispetcher Markazi'}
          <span style={{ marginLeft: 10, fontSize: 12, padding: '2px 8px', borderRadius: 10,
            backgroundColor: connected ? 'rgba(39,174,96,0.3)' : 'rgba(231,76,60,0.3)',
            color: connected ? '#27ae60' : '#e74c3c' }}>
            {connected ? '🟢 Jonli' : '🔴 Uzilgan'}
          </span>
        </h1>
        <div className="header-actions">
          {user && (
            <span style={{ fontSize: 14, color: '#ecf0f1', fontWeight: 600, marginRight: 8 }}>
              👤 {user.first_name} {user.last_name}
            </span>
          )}
          <button className="btn-refresh" onClick={() => { setShowDrivers(!showDrivers); fetchDrivers(); }}>👮 Hodimlar</button>
          <button className="btn-refresh" onClick={fetchAll} disabled={loading}>Yangilash</button>
          <button className="btn-logout" onClick={onLogout}>Chiqish</button>
        </div>
      </div>

      {/* ── New emergency alert banner ── */}
      {alertCount > 0 && (
        <div onClick={() => { setAlertCount(0); setFilter('new'); }}
          style={{
            background:'linear-gradient(90deg,#e74c3c,#c0392b)', color:'#fff',
            padding:'10px 20px', cursor:'pointer', display:'flex', alignItems:'center',
            justifyContent:'space-between', animation:'pulse 1s infinite',
          }}>
          <span style={{fontWeight:700,fontSize:15}}>🚨 {alertCount} ta yangi chaqiruv keldi! Ko'rish uchun bosing</span>
          <span style={{fontSize:20}} onClick={e=>{e.stopPropagation();setAlertCount(0);}}>✕</span>
        </div>
      )}

      {/* ── Assign ambulance modal ── */}
      {selectedEmergency && (
        <div className="modal-overlay" onClick={() => setSelectedEmergency(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Ambulans belgilash #{selectedEmergency.id}</h2>
            <div className="ambulance-list">
              {ambulances.filter(a => a.status === 'available').length === 0
                ? <p style={{textAlign:'center',color:'#888',padding:20}}>Bo'sh ambulans yo'q</p>
                : ambulances.filter(a => a.status === 'available').map((amb) => (
                <button key={amb.id} className="ambulance-option"
                  onClick={() => handleAssignAmbulance(selectedEmergency.id, amb.id)}>
                  <strong>{amb.unit_number}</strong><br />{amb.driver_name}
                  <span style={{fontSize:11,color:'#27ae60',display:'block',marginTop:2}}>🟢 Tayyor</span>
                </button>
              ))}
            </div>
            <button className="modal-close" onClick={() => setSelectedEmergency(null)}>Bekor</button>
          </div>
        </div>
      )}

      {/* ── Emergency detail modal ── */}
      {detailEmergency && (
        <div className="modal-overlay" onClick={() => setDetailEmergency(null)}>
          <div className="modal detail-modal" onClick={(e) => e.stopPropagation()}>
            <div className="detail-header">
              <h2>Chaqiruv #{detailEmergency.id}</h2>
              <button className="modal-close-x" onClick={() => setDetailEmergency(null)}>✕</button>
            </div>
            <div className="detail-grid">
              <div className="detail-section">
                <h3>👤 Chaqiruvchi</h3>
                {(detailEmergency.first_name || detailEmergency.last_name) && (
                  <p><b>Ism:</b> {[detailEmergency.first_name, detailEmergency.last_name].filter(Boolean).join(' ')}</p>
                )}
                <p><b>Telefon:</b> <a href={`tel:${detailEmergency.user_phone}`}>{detailEmergency.user_phone || '—'}</a></p>
              </div>
              <div className="detail-section">
                <h3>🚑 Haydovchi</h3>
                <p><b>Ism:</b> {detailEmergency.driver_name || '—'}</p>
                <p><b>Telefon:</b> {detailEmergency.driver_phone ? <a href={`tel:${detailEmergency.driver_phone}`}>{detailEmergency.driver_phone}</a> : '—'}</p>
                <p><b>Mashina:</b> {detailEmergency.unit_number || '—'}</p>
              </div>
              <div className="detail-section">
                <h3>📍 Joylashuv</h3>
                <p>
                  <span className="coords-link" onClick={() => openCoords(detailEmergency.latitude, detailEmergency.longitude)}>
                    {parseFloat(detailEmergency.latitude).toFixed(5)}, {parseFloat(detailEmergency.longitude).toFixed(5)} 🔗
                  </span>
                </p>
              </div>
              <div className="detail-section">
                <h3>📋 Holat</h3>
                <p><b>Holat:</b> {STATUS_UZ[detailEmergency.status] || detailEmergency.status}</p>
                <p><b>Xizmat:</b> {SERVICE_UZ[detailEmergency.service_type] || detailEmergency.service_type}</p>
                <p><b>Vaqt:</b> {new Date(detailEmergency.created_at).toLocaleString('uz-UZ')}</p>
                {detailEmergency.description && <p><b>Izoh:</b> {detailEmergency.description}</p>}
                {detailEmergency.cancelled_by && (
                  <p><b>Bekor qildi:</b> {CANCELLED_BY_LABELS[detailEmergency.cancelled_by] || detailEmergency.cancelled_by}</p>
                )}
              </div>
            </div>
            <button className="modal-close" onClick={() => setDetailEmergency(null)}>Yopish</button>
          </div>
        </div>
      )}

      {/* ── New driver modal ── */}
      {newDriverModal && (
        <div className="modal-overlay" onClick={() => { setNewDriverModal(false); setGeneratedCode(''); }}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>Yangi hodim qo'shish</h2>
            {generatedCode ? (
              <div style={{textAlign:'center',padding:20}}>
                <p style={{fontSize:16,marginBottom:8}}>✅ Login kod yaratildi!</p>
                <div style={{fontSize:32,fontWeight:'bold',letterSpacing:4,background:'#e3f2fd',padding:'16px 24px',borderRadius:12,marginBottom:16}}>{generatedCode}</div>
                <p style={{color:'#666',fontSize:14}}>Bu kodni hodimga bering. U shu kod bilan tizimga kiradi.</p>
                <button className="btn-confirm" onClick={() => { setGeneratedCode(''); setNewDriverModal(false); }}>Yopish</button>
              </div>
            ) : (
              <>
                <input placeholder="Hodim ismi *" value={newDriverName} onChange={e => setNewDriverName(e.target.value)}
                  style={{width:'100%',padding:10,marginBottom:10,borderRadius:8,border:'1px solid #ddd',boxSizing:'border-box'}} />
                <div style={{display:'flex',marginBottom:10}}>
                  <div style={{background:'#f5f5f5',border:'1px solid #e74c3c',borderRight:'none',borderRadius:'8px 0 0 8px',padding:'10px 12px',color:'#555',fontWeight:'600',fontSize:14,whiteSpace:'nowrap'}}>+998</div>
                  <input placeholder="90 123 45 67 *" value={newDriverPhone}
                    onChange={e => setNewDriverPhone(e.target.value.replace(/[^0-9]/g,''))} maxLength={9}
                    style={{flex:1,padding:10,borderRadius:'0 8px 8px 0',border:'1px solid #e74c3c',boxSizing:'border-box',fontSize:14}} />
                </div>
                <input placeholder="Mashina raqami (masalan: A123BC) *" value={newDriverUnit}
                  onChange={e => setNewDriverUnit(e.target.value)}
                  style={{width:'100%',padding:10,marginBottom:10,borderRadius:8,border:'1px solid #ddd',boxSizing:'border-box'}} />
                <div style={{marginBottom:16}}>
                  <select value={newDriverPlate} onChange={e => setNewDriverPlate(e.target.value)}
                    style={{width:'100%',padding:10,borderRadius:8,border:'1px solid #ddd',boxSizing:'border-box',fontSize:14}}>
                    <option value="">-- Viloyat kodini tanlang * --</option>
                    {Object.entries(UZ_REGIONS).map(([code, name]) => (
                      <option key={code} value={code}>{code} — {name}</option>
                    ))}
                  </select>
                  {newDriverPlate && <div style={{fontSize:12,color:'#27ae60',marginTop:4}}>📍 {UZ_REGIONS[newDriverPlate]}</div>}
                </div>
                <button className="btn-confirm" onClick={handleCreateDriver} disabled={driverLoading}>
                  {driverLoading ? 'Yaratilmoqda...' : 'Kod yaratish'}
                </button>
                <button className="modal-close" onClick={() => setNewDriverModal(false)}>Bekor</button>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Selected driver detail modal (ONE place only) ── */}
      {selectedDriver && (
        <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,background:'rgba(0,0,0,0.5)',zIndex:2000,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={() => { setSelectedDriver(null); setEditMode(false); }}>
          <div style={{background:'#fff',borderRadius:16,padding:24,width:380,maxWidth:'90vw'}}
            onClick={e => e.stopPropagation()}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
              <h3 style={{margin:0}}>👮 Hodim ma'lumotlari</h3>
              <button onClick={() => { setSelectedDriver(null); setEditMode(false); }}
                style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#888'}}>✕</button>
            </div>
            {editMode ? (
              <div>
                <input value={editName} onChange={e => setEditName(e.target.value)} placeholder="Ism"
                  style={{width:'100%',padding:10,marginBottom:8,borderRadius:8,border:'1px solid #ddd',boxSizing:'border-box'}} />
                <div style={{display:'flex',marginBottom:8}}>
                  <div style={{background:'#f5f5f5',border:'1px solid #ddd',borderRight:'none',borderRadius:'8px 0 0 8px',padding:'10px 12px',color:'#555',fontWeight:'600'}}>+998</div>
                  <input value={editPhone.replace('+998','')}
                    onChange={e => setEditPhone(e.target.value.replace(/[^0-9]/g,''))}
                    placeholder="90 123 45 67"
                    style={{flex:1,padding:10,borderRadius:'0 8px 8px 0',border:'1px solid #ddd',boxSizing:'border-box'}} />
                </div>
                <input value={editUnit} onChange={e => setEditUnit(e.target.value)} placeholder="Mashina raqami"
                  style={{width:'100%',padding:10,marginBottom:8,borderRadius:8,border:'1px solid #ddd',boxSizing:'border-box'}} />
                <select value={editPlate} onChange={e => setEditPlate(e.target.value)}
                  style={{width:'100%',padding:10,marginBottom:8,borderRadius:8,border:'1px solid #ddd',boxSizing:'border-box'}}>
                  <option value="">-- Viloyat --</option>
                  {Object.entries(UZ_REGIONS).map(([code, name]) => (
                    <option key={code} value={code}>{code} — {name}</option>
                  ))}
                </select>
                {editPlate && <div style={{fontSize:12,color:'#27ae60',marginBottom:12}}>📍 {UZ_REGIONS[editPlate]}</div>}
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => handleEditDriver(selectedDriver.id)}
                    style={{flex:1,background:'#4fc3f7',color:'#fff',border:'none',borderRadius:8,padding:'10px',cursor:'pointer',fontWeight:'bold'}}>Saqlash</button>
                  <button onClick={() => setEditMode(false)}
                    style={{flex:1,background:'#f5f5f5',border:'none',borderRadius:8,padding:'10px',cursor:'pointer'}}>Bekor</button>
                </div>
              </div>
            ) : (
              <div>
                <div style={{background:'#f8f9fa',borderRadius:10,padding:16,marginBottom:12}}>
                  <div style={{marginBottom:8}}><b>👤 Ism:</b> {selectedDriver.driver_name}</div>
                  <div style={{marginBottom:8}}><b>📱 Telefon:</b> {selectedDriver.driver_phone || '—'}</div>
                  <div style={{marginBottom:8}}><b>🚑 Mashina:</b> {selectedDriver.unit_number}</div>
                  <div style={{marginBottom:8}}>
                    <b>📍 Viloyat:</b> {selectedDriver.plate_region
                      ? `${selectedDriver.plate_region} — ${UZ_REGIONS[selectedDriver.plate_region] || '—'}`
                      : '—'}
                  </div>
                  <div style={{marginBottom:4}}><b>🔑 Login kod:</b></div>
                  <code style={{background:'#e3f2fd',padding:'8px 14px',borderRadius:8,fontWeight:'bold',fontSize:18,letterSpacing:3,color:'#1565c0',display:'block',textAlign:'center'}}>
                    {selectedDriver.login_code}
                  </code>
                  <div style={{marginTop:8,textAlign:'center',color:selectedDriver.driver_user_id?'#27ae60':'#f39c12',fontWeight:'600'}}>
                    {selectedDriver.driver_user_id ? '✅ Tizimga ulangan' : '⏳ Hali kirmagan'}
                  </div>
                </div>
                <div style={{display:'flex',gap:8}}>
                  <button onClick={() => {
                    setEditMode(true);
                    setEditName(selectedDriver.driver_name);
                    setEditPhone(selectedDriver.driver_phone || '');
                    setEditUnit(selectedDriver.unit_number);
                    setEditPlate(selectedDriver.plate_region || '');
                  }} style={{flex:1,background:'#4fc3f7',color:'#fff',border:'none',borderRadius:8,padding:'10px',cursor:'pointer',fontWeight:'bold'}}>
                    ✏️ Tahrirlash
                  </button>
                  <button onClick={() => { handleDeleteDriver(selectedDriver.id); }}
                    style={{flex:1,background:'#ffebee',color:'#e74c3c',border:'none',borderRadius:8,padding:'10px',cursor:'pointer',fontWeight:'bold'}}>
                    🗑️ O'chirish
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="dashboard-content">
        <div className="map-section" style={{display:'flex',flexDirection:'column'}}>
          {/* Map driver filter */}
          <div style={{display:'flex',gap:6,padding:'8px 10px',background:'#fff',borderBottom:'1px solid #e3f2fd',flexWrap:'wrap'}}>
            {[
              { key: 'all', label: 'Barchasi', color: '#2980b9' },
              { key: 'available', label: '🟢 Tayyor', color: '#27ae60' },
              { key: 'on_the_way', label: '🟡 Yo\'lda', color: '#f39c12' },
              { key: 'arrived', label: '🟣 Yetib keldi', color: '#8e44ad' },
            ].map(({ key, label, color }) => (
              <button key={key} onClick={() => setMapFilter(key)}
                style={{
                  padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                  fontSize: 12, fontWeight: 600,
                  background: mapFilter === key ? color : '#f0f0f0',
                  color: mapFilter === key ? '#fff' : '#555',
                  transition: 'all 0.15s',
                }}>
                {label} ({
                  key === 'all' ? ambulances.filter(a => a.latitude && a.longitude).length :
                  key === 'available' ? ambulances.filter(a => a.status === 'available').length :
                  key === 'on_the_way' ? ambulances.filter(a => a.status === 'on_the_way' || a.status === 'busy').length :
                  ambulances.filter(a => a.status === 'arrived').length
                })
              </button>
            ))}
            <span style={{marginLeft:'auto',fontSize:11,color:'#aaa',alignSelf:'center'}}>
              Haydovchiga bosing → batafsil
            </span>
          </div>

          <div ref={mapRef} id="dashboard-map" className="dashboard-map" />

        </div>

        {/* Driver map click panel */}
        {selectedMapDriver && (
          <div style={{
            position:'fixed', bottom:20, left:'50%', transform:'translateX(-50%)',
            background:'#fff', borderRadius:16, boxShadow:'0 8px 32px rgba(0,0,0,0.22)',
            padding:20, width:340, zIndex:1500, border:'2px solid #e3f2fd',
          }}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
              <b style={{fontSize:15}}>🚑 {selectedMapDriver.amb.unit_number}</b>
              <button onClick={() => setSelectedMapDriver(null)}
                style={{background:'none',border:'none',fontSize:20,cursor:'pointer',color:'#aaa',lineHeight:1}}>✕</button>
            </div>

            <div style={{background:'#f8f9fa',borderRadius:10,padding:12,marginBottom:12,fontSize:13}}>
              <div style={{marginBottom:6}}><b>👤 Haydovchi:</b> {selectedMapDriver.amb.driver_name || '—'}</div>
              <div style={{marginBottom:6}}><b>📱 Telefon:</b>
                {selectedMapDriver.amb.driver_phone
                  ? <a href={`tel:${selectedMapDriver.amb.driver_phone}`} style={{marginLeft:6,color:'#2980b9'}}>{selectedMapDriver.amb.driver_phone}</a>
                  : ' —'}
              </div>
              <div style={{marginBottom:6}}><b>📍 Viloyat:</b> {selectedMapDriver.amb.plate_region
                ? `${selectedMapDriver.amb.plate_region} — ${UZ_REGIONS[selectedMapDriver.amb.plate_region] || ''}`
                : '—'}
              </div>
              <div style={{display:'flex',alignItems:'center',gap:8}}>
                <b>Holat:</b>
                <span style={{
                  padding:'2px 10px', borderRadius:20, fontSize:12, fontWeight:600,
                  background: AMB_STATUS_COLOR[selectedMapDriver.amb.status] || '#2980b9',
                  color:'#fff',
                }}>
                  {selectedMapDriver.amb.status === 'available' ? '🟢 Tayyor' :
                   selectedMapDriver.amb.status === 'on_the_way' ? "🟡 Yo'lda" :
                   selectedMapDriver.amb.status === 'arrived' ? '🟣 Yetib keldi' :
                   selectedMapDriver.amb.status === 'busy' ? '🔴 Band' :
                   selectedMapDriver.amb.status || '—'}
                </span>
              </div>
            </div>

            {selectedMapDriver.emergency ? (
              <div style={{background:'#fff3e0',borderRadius:10,padding:12,fontSize:13,borderLeft:'4px solid #f39c12'}}>
                <div style={{fontWeight:700,marginBottom:6}}>🚨 Joriy chaqiruv #{selectedMapDriver.emergency.id}</div>
                <div style={{marginBottom:4}}><b>Xizmat:</b> {SERVICE_UZ[selectedMapDriver.emergency.service_type] || selectedMapDriver.emergency.service_type}</div>
                <div style={{marginBottom:4}}><b>Holat:</b> {STATUS_UZ[selectedMapDriver.emergency.status] || selectedMapDriver.emergency.status}</div>
                <div style={{marginBottom:4}}><b>Chaqiruvchi:</b> {selectedMapDriver.emergency.user_phone || '—'}</div>
                <span className="coords-link" style={{fontSize:12,color:'#2980b9',cursor:'pointer'}}
                  onClick={() => openCoords(selectedMapDriver.emergency.latitude, selectedMapDriver.emergency.longitude)}>
                  📍 Manzilni xaritada ko'rish 🔗
                </span>
              </div>
            ) : (
              <div style={{textAlign:'center',color:'#27ae60',fontSize:13,fontWeight:600,padding:8}}>
                ✅ Hozirda bo'sh — yangi chaqiruvga tayyor
              </div>
            )}
          </div>
        )}

        {showDrivers && (
          <div style={{width:'350px',background:'white',display:'flex',flexDirection:'column',borderLeft:'2px solid #e3f2fd',flexShrink:0}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid #eee',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <b style={{fontSize:15}}>👮 Hodimlar ({drivers.length})</b>
              <button className="btn-confirm" style={{fontSize:12,padding:'4px 12px'}} onClick={() => setNewDriverModal(true)}>+ Yangi</button>
            </div>
            <div style={{overflowY:'auto',flex:1}}>
              {drivers.length === 0 ? (
                <div style={{textAlign:'center',padding:40,color:'#888'}}>
                  <div style={{fontSize:36}}>👮</div>
                  <p style={{marginTop:8}}>Hali hodim yo'q</p>
                </div>
              ) : drivers.map(d => (
                <div key={d.id}
                  onClick={() => { setSelectedDriver(d); setEditMode(false); }}
                  style={{padding:'12px 16px',borderBottom:'1px solid #f0f0f0',cursor:'pointer'}}
                  onMouseEnter={e => e.currentTarget.style.background='#f5f5f5'}
                  onMouseLeave={e => e.currentTarget.style.background=''}>
                  <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start'}}>
                    <div>
                      <div style={{fontWeight:'bold'}}>{d.driver_name}</div>
                      <div style={{fontSize:12,color:'#666'}}>🚑 {d.unit_number}</div>
                      {d.plate_region && (
                        <div style={{fontSize:11,color:'#888',marginTop:2}}>
                          📍 {d.plate_region} — {UZ_REGIONS[d.plate_region] || ''}
                        </div>
                      )}
                    </div>
                  </div>
                  <div style={{marginTop:8,display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
                    <code style={{background:'#e3f2fd',padding:'4px 10px',borderRadius:6,fontWeight:'bold',fontSize:14,letterSpacing:2,color:'#1565c0'}}>
                      {d.login_code}
                    </code>
                    <span style={{fontSize:11,color:d.driver_user_id?'#27ae60':'#f39c12',fontWeight:'600'}}>
                      {d.driver_user_id ? '✅ Ulangan' : '⏳ Kutilmoqda'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

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
              <button key={key} className={`tab ${filter === key ? 'active' : ''} ${key === 'cancelled' ? 'tab-cancelled' : ''}`}
                onClick={() => setFilter(key)}>
                {label} ({countByStatus(key)})
              </button>
            ))}
          </div>

          <div className="emergencies-list">
            {filteredEmergencies.length === 0 ? (
              <p className="no-emergencies">Favqulotiy vaziyatlar yo'q</p>
            ) : filteredEmergencies.map((e) => {
              const assignedAmb = getAssignedAmbulance(e.assigned_ambulance_id);
              return (
                <div key={e.id} className="emergency-item" onClick={() => setDetailEmergency(e)}>
                  <div className="emergency-info">
                    <p className="emergency-id">#{e.id}</p>
                    <p className="emergency-type">{e.service_type?.toUpperCase()}</p>
                    {e.user_phone && <p className="emergency-phone"><a href={`tel:${e.user_phone}`} style={{color:'#2980b9',textDecoration:'none',fontWeight:600}} onClick={ev=>ev.stopPropagation()}>📞 {e.user_phone}</a></p>}
                    {(assignedAmb || e.unit_number) && (
                      <p className="ambulance-assigned">🚑 {e.unit_number || assignedAmb?.unit_number}</p>
                    )}
                    {e.driver_name && <p className="driver-name">👤 {e.driver_name}</p>}
                    <p className="emergency-location coords-click"
                      onClick={(ev) => { ev.stopPropagation(); openCoords(e.latitude, e.longitude); }}>
                      📍 {parseFloat(e.latitude).toFixed(4)}, {parseFloat(e.longitude).toFixed(4)} 🔗
                    </p>
                    <p className="emergency-time">{new Date(e.created_at).toLocaleTimeString()}</p>
                    {e.cancelled_by && <p className="cancelled-by-label">{CANCELLED_BY_LABELS[e.cancelled_by]}</p>}
                  </div>
                  <div className="emergency-actions" onClick={(ev) => ev.stopPropagation()}>
                    {e.status === 'new' && (<>
                      <button className="btn-action btn-confirm" onClick={() => handleConfirm(e.id)}>Tasdiqlash</button>
                      <button className="btn-action btn-assign" onClick={() => setSelectedEmergency(e)}>Ambulans</button>
                      <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                    </>)}
                    {e.status === 'confirmed' && (<>
                      <button className="btn-action btn-assign" onClick={() => setSelectedEmergency(e)}>Ambulans</button>
                      <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                    </>)}
                    {e.status === 'assigned' && (<>
                      <p style={{fontSize:11,color:'#27ae60',margin:0}}>✅ Haydovchi qabul qildi</p>
                      <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                    </>)}
                    {e.status === 'on_the_way' && (<>
                      <p style={{fontSize:11,color:'#f39c12',margin:0}}>🚗 Haydovchi yo'lda</p>
                      <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                    </>)}
                    {e.status === 'arrived' && (<>
                      <button className="btn-action btn-complete" onClick={() => handleComplete(e.id)}>Tugatish</button>
                      <button className="btn-action btn-reject" onClick={() => handleReject(e.id)}>Bekor</button>
                    </>)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;
