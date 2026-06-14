import React, { useState, useEffect, useCallback, useRef } from 'react';
import axios from 'axios';
import { GoogleMap, useJsApiLoader, Marker, InfoWindow } from '@react-google-maps/api';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_MAPS_API_KEY = process.env.REACT_APP_GOOGLE_MAPS_API_KEY || '';

const UZ_CITIES = ['Toshkent',"Andijon","Farg'ona",'Namangan','Samarqand','Jizzax','Sirdaryo','Qashqadaryo','Surxondaryo','Buxoro','Navoiy','Xorazm','Nukus'];

const h = (token) => ({ Authorization: `Bearer ${token}` });

const STATUS_LABEL = { pending:'Kutilmoqda', confirmed:'Tasdiqlangan', on_the_way:"Yo'lda", arrived:'Yetib keldi', completed:'Yakunlangan', cancelled:'Bekor' };
const STATUS_COLOR = { pending:'#f59e0b', confirmed:'#3b82f6', on_the_way:'#8b5cf6', arrived:'#10b981', completed:'#6b7280', cancelled:'#ef4444' };
const DRIVER_STATUS_COLOR = { available:'#10b981', on_the_way:'#f59e0b', arrived:'#8b5cf6', busy:'#ef4444' };
const DRIVER_STATUS_LABEL = { available:'Tayyor', on_the_way:"Yo'lda", arrived:'Yetib keldi', busy:'Band' };

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

export default function CenterAdminScreen({ token, user, onLogout }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [stats, setStats] = useState(null);
  const [emergencies, setEmergencies] = useState([]);
  const [eFilter, setEFilter] = useState('');
  const [ambulances, setAmbulances] = useState([]);
  const [dispatchers, setDispatchers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [newCode, setNewCode] = useState(null);
  const [newDriverCode, setNewDriverCode] = useState('');
  const [showAddDispatcher, setShowAddDispatcher] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [driverForm, setDriverForm] = useState({ driver_name: '', driver_phone: '', unit_number: '', plate_region: '' });
  const [selectedDispatcher, setSelectedDispatcher] = useState(null);
  const [selectedMarker, setSelectedMarker] = useState(null);
  const [assignModal, setAssignModal] = useState(null);
  const [centerForm, setCenterForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [newEmergencyAlert, setNewEmergencyAlert] = useState(false);
  const prevEmergencyIds = useRef(new Set());

  const { isLoaded: mapLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });

  const loadOverview = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/center-admin/overview`, { headers: h(token) });
      setOverview(r.data);
      if (r.data.dispatch_center && !centerForm) {
        const dc = r.data.dispatch_center;
        setCenterForm({ name: dc.name || '', phone: dc.phone || '', city: dc.city || '' });
      }
    } catch {}
  // eslint-disable-next-line
  }, [token]);

  const loadStats = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/center-admin/stats`, { headers: h(token) });
      setStats(r.data);
    } catch {}
  }, [token]);

  const loadEmergencies = useCallback(async () => {
    try {
      const url = eFilter ? `${API_URL}/api/emergencies?status=${eFilter}` : `${API_URL}/api/emergencies`;
      const r = await axios.get(url, { headers: h(token) });
      const rows = r.data || [];
      const newIds = rows.filter(e => e.status === 'pending').map(e => e.id);
      const truly_new = newIds.filter(id => !prevEmergencyIds.current.has(id));
      if (truly_new.length && prevEmergencyIds.current.size > 0) {
        setNewEmergencyAlert(true);
        playAlert();
        setTimeout(() => setNewEmergencyAlert(false), 5000);
      }
      prevEmergencyIds.current = new Set(newIds);
      setEmergencies(rows);
    } catch {}
  }, [token, eFilter]);

  const loadAmbulances = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/ambulances`, { headers: h(token) });
      setAmbulances(r.data || []);
    } catch {}
  }, [token]);

  const loadDispatchers = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/center-admin/dispatchers`, { headers: h(token) });
      setDispatchers(r.data.dispatchers || []);
    } catch {}
  }, [token]);

  const loadDrivers = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/dispatcher/drivers`, { headers: h(token) });
      setDrivers(r.data || []);
    } catch {}
  }, [token]);

  useEffect(() => { loadOverview(); loadStats(); loadAmbulances(); loadEmergencies(); }, [loadOverview, loadStats, loadAmbulances, loadEmergencies]);
  useEffect(() => { if (tab === 'dispatchers') loadDispatchers(); }, [tab, loadDispatchers]);
  useEffect(() => { if (tab === 'drivers') loadDrivers(); }, [tab, loadDrivers]);
  useEffect(() => { if (tab === 'emergencies') loadEmergencies(); }, [tab, loadEmergencies]);

  // poll every 15s
  useEffect(() => {
    const id = setInterval(() => { loadEmergencies(); loadAmbulances(); }, 15000);
    return () => clearInterval(id);
  }, [loadEmergencies, loadAmbulances]);

  const updateEmergencyStatus = async (eId, status) => {
    try {
      if (status === 'confirmed') await axios.patch(`${API_URL}/api/emergencies/${eId}/confirm`, {}, { headers: h(token) });
      else if (status === 'cancelled') await axios.patch(`${API_URL}/api/emergencies/${eId}/cancel`, {}, { headers: h(token) });
      loadEmergencies();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
  };

  const assignAmbulance = async (eId, ambId) => {
    try {
      await axios.patch(`${API_URL}/api/emergencies/${eId}/assign-ambulance`, { ambulance_id: ambId }, { headers: h(token) });
      setAssignModal(null);
      loadEmergencies();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
  };

  const handleAddDispatcher = async (e) => {
    e.preventDefault(); setSaving(true);
    try {
      const r = await axios.post(`${API_URL}/api/center-admin/dispatchers`, addForm, { headers: h(token) });
      setNewCode({ name: `${addForm.first_name} ${addForm.last_name}`, code: r.data.login_code });
      setAddForm({ first_name: '', last_name: '', phone: '' });
      setShowAddDispatcher(false);
      loadDispatchers(); loadOverview();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
    setSaving(false);
  };

  const handleAddDriver = async () => {
    if (!driverForm.driver_name || !driverForm.unit_number || !driverForm.driver_phone) return alert('Barcha maydonlar kerak');
    setSaving(true);
    try {
      const r = await axios.post(`${API_URL}/api/dispatcher/create-driver-code`, driverForm, { headers: h(token) });
      setNewDriverCode(r.data.login_code);
      setDriverForm({ driver_name: '', driver_phone: '', unit_number: '', plate_region: '' });
      loadDrivers(); loadOverview();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
    setSaving(false);
  };

  const handleBlockDispatcher = async (d) => {
    try {
      await axios.patch(`${API_URL}/api/center-admin/dispatchers/${d.id}/block`, { blocked: !d.blocked }, { headers: h(token) });
      loadDispatchers();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
  };

  const handleDeleteDispatcher = async (d) => {
    if (!window.confirm(`${d.first_name} ${d.last_name} ni o'chirasizmi?`)) return;
    try {
      await axios.delete(`${API_URL}/api/center-admin/dispatchers/${d.id}`, { headers: h(token) });
      setSelectedDispatcher(null); loadDispatchers(); loadOverview();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
  };

  const handleDeleteDriver = async (id) => {
    if (!window.confirm("Haydovchini o'chirasizmi?")) return;
    try { await axios.delete(`${API_URL}/api/dispatcher/drivers/${id}`, { headers: h(token) }); loadDrivers(); } catch {}
  };

  const handleSaveCenter = async () => {
    setSaving(true);
    try {
      await axios.patch(`${API_URL}/api/center-admin/info`, centerForm, { headers: h(token) });
      loadOverview(); alert('✅ Saqlandi');
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
    setSaving(false);
  };

  const dc = overview?.dispatch_center;
  const byStatus = Object.fromEntries((overview?.emergencies_by_status || []).map(r => [r.status, parseInt(r.count)]));
  const totalE = Object.values(byStatus).reduce((s, n) => s + n, 0);
  const driversByStatus = Object.fromEntries((stats?.drivers_by_status || []).map(r => [r.status, parseInt(r.count)]));
  const weekMax = Math.max(...(stats?.weekly || []).map(r => parseInt(r.count)), 1);

  const TABS = [
    ['overview','📊 Umumiy'], ['emergencies','🚨 Chaqiriqlar'], ['map','🗺️ Xarita'],
    ['dispatchers','🖥️ Dispetcherlar'], ['drivers','🚑 Haydovchilar'], ['settings','⚙️ Sozlamalar'],
  ];

  return (
    <div style={{ display:'flex', flexDirection:'column', minHeight:'100vh', background:'#f5f7fa', fontFamily:'system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ background:'linear-gradient(135deg,#1e3a5f,#0f766e)', color:'#fff', padding:'12px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div>
          <div style={{ fontSize:17, fontWeight:700 }}>🏢 {dc?.name || 'Markaz Admin'}</div>
          <div style={{ fontSize:12, opacity:0.8 }}>{user.first_name} {user.last_name} · {dc?.city || ''} · {dc?.service_type || ''}</div>
        </div>
        <div style={{ display:'flex', gap:10, alignItems:'center' }}>
          {newEmergencyAlert && (
            <div style={{ background:'#ef4444', padding:'6px 14px', borderRadius:20, fontSize:13, fontWeight:700 }}>
              🚨 Yangi chaqiriq!
            </div>
          )}
          <button onClick={onLogout} style={{ padding:'7px 14px', background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', cursor:'pointer', fontSize:13 }}>Chiqish</button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', background:'#fff', borderBottom:'2px solid #e5e7eb', padding:'0 8px', overflowX:'auto' }}>
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding:'12px 14px', border:'none', background:'none', cursor:'pointer', fontWeight:tab===key?700:400, color:tab===key?'#1e3a5f':'#6b7280', borderBottom:tab===key?'3px solid #1e3a5f':'3px solid transparent', fontSize:13, whiteSpace:'nowrap' }}>
            {label}
            {key==='emergencies' && emergencies.filter(e=>e.status==='pending').length > 0 && (
              <span style={{ marginLeft:6, background:'#ef4444', color:'#fff', borderRadius:20, padding:'1px 7px', fontSize:11, fontWeight:700 }}>
                {emergencies.filter(e=>e.status==='pending').length}
              </span>
            )}
          </button>
        ))}
      </div>

      <div style={{ flex:1, padding:'20px 20px', maxWidth:1100, margin:'0 auto', width:'100%', boxSizing:'border-box' }}>

        {/* ── OVERVIEW ── */}
        {tab === 'overview' && (
          <div>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:16 }}>Umumiy ko'rinish</h2>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(145px,1fr))', gap:10, marginBottom:18 }}>
              {[
                { icon:'🖥️', label:'Dispetcherlar', value:overview?.dispatcher_count||0, color:'#3b82f6' },
                { icon:'🚑', label:'Haydovchilar', value:overview?.driver_count||0, color:'#10b981' },
                { icon:'🚨', label:'Jami chaqiriqlar', value:totalE, color:'#ef4444' },
                { icon:'⏳', label:'Kutilmoqda', value:byStatus['pending']||0, color:'#f59e0b' },
                { icon:'✅', label:'Yakunlangan', value:byStatus['completed']||0, color:'#8b5cf6' },
                { icon:'❌', label:'Bekor', value:byStatus['cancelled']||0, color:'#6b7280' },
              ].map(({ icon, label, value, color }) => (
                <div key={label} style={{ background:'#fff', borderRadius:12, padding:'14px 16px', display:'flex', gap:10, alignItems:'center', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', borderLeft:`4px solid ${color}` }}>
                  <span style={{ fontSize:22 }}>{icon}</span>
                  <div><div style={{ fontSize:20, fontWeight:700 }}>{value}</div><div style={{ fontSize:11, color:'#6b7280' }}>{label}</div></div>
                </div>
              ))}
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
              {/* Driver status */}
              <div style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>🚑 Haydovchilar holati</h3>
                {Object.entries(DRIVER_STATUS_LABEL).map(([s, l]) => (
                  <div key={s} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:DRIVER_STATUS_COLOR[s] }} />
                      <span style={{ fontSize:13 }}>{l}</span>
                    </div>
                    <span style={{ fontWeight:700, fontSize:15 }}>{driversByStatus[s]||0}</span>
                  </div>
                ))}
              </div>

              {/* Weekly bar chart */}
              <div style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontWeight:700, marginBottom:12, fontSize:14 }}>📈 Oxirgi 7 kun</h3>
                {stats?.weekly?.length ? (
                  <div style={{ display:'flex', alignItems:'flex-end', gap:5, height:80 }}>
                    {stats.weekly.map(row => (
                      <div key={row.day} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                        <div style={{ fontSize:10, fontWeight:700, color:'#374151' }}>{row.count}</div>
                        <div style={{ width:'100%', background:'#3b82f6', borderRadius:3, height:`${Math.max((parseInt(row.count)/weekMax)*100, 5)}%` }} />
                        <div style={{ fontSize:9, color:'#94a3b8' }}>{row.day?.slice(5)}</div>
                      </div>
                    ))}
                  </div>
                ) : <p style={{ color:'#94a3b8', fontSize:13 }}>Ma'lumot yo'q</p>}
              </div>
            </div>

            {/* Recent emergencies */}
            <div style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <h3 style={{ fontWeight:700, fontSize:14 }}>🚨 So'nggi chaqiriqlar</h3>
                <button onClick={() => setTab('emergencies')} style={{ fontSize:12, color:'#3b82f6', background:'none', border:'none', cursor:'pointer' }}>Barchasini ko'rish →</button>
              </div>
              {emergencies.slice(0,5).map(e => (
                <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderBottom:'1px solid #f1f5f9' }}>
                  <div>
                    <span style={{ fontWeight:600, fontSize:13 }}>{e.first_name||'?'} {e.last_name||''}</span>
                    <span style={{ fontSize:12, color:'#6b7280', marginLeft:8 }}>{e.user_phone}</span>
                  </div>
                  <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:(STATUS_COLOR[e.status]||'#6b7280')+'22', color:STATUS_COLOR[e.status]||'#6b7280' }}>
                    {STATUS_LABEL[e.status]||e.status}
                  </span>
                </div>
              ))}
              {!emergencies.length && <p style={{ color:'#94a3b8', fontSize:13 }}>Chaqiriqlar yo'q</p>}
            </div>
          </div>
        )}

        {/* ── EMERGENCIES ── */}
        {tab === 'emergencies' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:700 }}>Chaqiriqlar</h2>
              <button onClick={loadEmergencies} style={BS('#e2e8f0', '#374151')}>🔄 Yangilash</button>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14 }}>
              {[['','Barchasi'],['pending','Kutilmoqda'],['confirmed','Tasdiqlangan'],['on_the_way',"Yo'lda"],['arrived','Yetib keldi'],['completed','Yakunlangan'],['cancelled','Bekor']].map(([v,l]) => (
                <button key={v} onClick={() => setEFilter(v)}
                  style={{ padding:'6px 14px', borderRadius:20, border:`2px solid ${eFilter===v?(STATUS_COLOR[v]||'#1e3a5f'):'#e2e8f0'}`, background:eFilter===v?(STATUS_COLOR[v]||'#1e3a5f'):'#fff', color:eFilter===v?'#fff':'#374151', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  {l}
                </button>
              ))}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {emergencies.map(e => (
                <div key={e.id} style={{ background:'#fff', borderRadius:12, padding:16, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', borderLeft:`4px solid ${STATUS_COLOR[e.status]||'#e2e8f0'}` }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:8 }}>
                    <div>
                      <div style={{ fontWeight:700, fontSize:15 }}>{e.first_name||'Noma\'lum'} {e.last_name||''}</div>
                      <a href={`tel:${e.user_phone}`} style={{ fontSize:13, color:'#3b82f6', textDecoration:'none' }}>📞 {e.user_phone}</a>
                      {e.address && <div style={{ fontSize:12, color:'#6b7280', marginTop:2 }}>📍 {e.address}</div>}
                      <div style={{ fontSize:11, color:'#94a3b8', marginTop:2 }}>#{e.id} · {new Date(e.created_at).toLocaleString('uz-UZ')}</div>
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6 }}>
                      <span style={{ padding:'4px 12px', borderRadius:20, fontSize:12, fontWeight:700, background:(STATUS_COLOR[e.status]||'#6b7280')+'22', color:STATUS_COLOR[e.status]||'#6b7280' }}>
                        {STATUS_LABEL[e.status]||e.status}
                      </span>
                      {e.unit_number && <span style={{ fontSize:12, color:'#6b7280' }}>🚑 {e.unit_number} — {e.driver_name}</span>}
                    </div>
                  </div>
                  <div style={{ display:'flex', gap:8, marginTop:12, flexWrap:'wrap' }}>
                    {e.status === 'pending' && <button onClick={() => updateEmergencyStatus(e.id,'confirmed')} style={BS('#3b82f6')}>✅ Tasdiqlash</button>}
                    {['pending','confirmed'].includes(e.status) && <button onClick={() => setAssignModal(e)} style={BS('#10b981')}>🚑 Ambulans biriktirish</button>}
                    {!['completed','cancelled'].includes(e.status) && <button onClick={() => updateEmergencyStatus(e.id,'cancelled')} style={BS('#ef4444')}>❌ Bekor qilish</button>}
                  </div>
                </div>
              ))}
              {!emergencies.length && <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}>Chaqiriqlar topilmadi</div>}
            </div>
          </div>
        )}

        {/* ── MAP ── */}
        {tab === 'map' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <h2 style={{ fontSize:18, fontWeight:700 }}>Haydovchilar xaritasi</h2>
              <button onClick={loadAmbulances} style={BS('#e2e8f0', '#374151')}>🔄 Yangilash</button>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
              {Object.entries(DRIVER_STATUS_LABEL).map(([s,l]) => (
                <div key={s} style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 12px', background:'#fff', borderRadius:20, border:'1px solid #e2e8f0', fontSize:12 }}>
                  <div style={{ width:10, height:10, borderRadius:'50%', background:DRIVER_STATUS_COLOR[s] }} />
                  <span>{l}: {ambulances.filter(a=>a.status===s).length}</span>
                </div>
              ))}
            </div>
            {mapLoaded ? (
              <div style={{ borderRadius:14, overflow:'hidden', height:520, boxShadow:'0 2px 8px rgba(0,0,0,0.1)' }}>
                <GoogleMap
                  mapContainerStyle={{ width:'100%', height:'100%' }}
                  center={{ lat:41.2995, lng:69.2401 }}
                  zoom={11}
                  options={{ streetViewControl:false, mapTypeControl:false, fullscreenControl:false }}
                >
                  {ambulances.filter(a => a.latitude && a.longitude).map(a => (
                    <Marker key={a.id}
                      position={{ lat:parseFloat(a.latitude), lng:parseFloat(a.longitude) }}
                      onClick={() => setSelectedMarker(a)}
                      icon={{
                        url:`data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`<svg width="36" height="36" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg"><circle cx="18" cy="18" r="15" fill="${DRIVER_STATUS_COLOR[a.status]||'#6b7280'}" stroke="white" stroke-width="3"/><text x="18" y="23" text-anchor="middle" font-size="14">🚑</text></svg>`)}`,
                        scaledSize:{ width:36, height:36 }
                      }}
                    />
                  ))}
                  {selectedMarker && (
                    <InfoWindow position={{ lat:parseFloat(selectedMarker.latitude), lng:parseFloat(selectedMarker.longitude) }} onCloseClick={() => setSelectedMarker(null)}>
                      <div style={{ padding:8, minWidth:160 }}>
                        <div style={{ fontWeight:700, fontSize:14, marginBottom:4 }}>🚑 {selectedMarker.unit_number}</div>
                        <div style={{ fontSize:13, marginBottom:2 }}>👤 {selectedMarker.driver_name}</div>
                        <div style={{ fontSize:13, marginBottom:6 }}>📞 {selectedMarker.driver_phone}</div>
                        <div style={{ padding:'3px 10px', borderRadius:20, display:'inline-block', background:(DRIVER_STATUS_COLOR[selectedMarker.status]||'#6b7280')+'22', color:DRIVER_STATUS_COLOR[selectedMarker.status]||'#6b7280', fontSize:12, fontWeight:700 }}>
                          {DRIVER_STATUS_LABEL[selectedMarker.status]||selectedMarker.status}
                        </div>
                      </div>
                    </InfoWindow>
                  )}
                </GoogleMap>
              </div>
            ) : (
              <div style={{ height:520, background:'#f1f5f9', borderRadius:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#94a3b8' }}>Xarita yuklanmoqda...</div>
            )}
          </div>
        )}

        {/* ── DISPATCHERS ── */}
        {tab === 'dispatchers' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:700 }}>Dispetcherlar ({dispatchers.length})</h2>
              <button onClick={() => setShowAddDispatcher(true)} style={BS('#1e3a5f')}>+ Dispetcher qo'shish</button>
            </div>
            <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              {!dispatchers.length ? (
                <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}><div style={{ fontSize:36, marginBottom:10 }}>🖥️</div><p>Hali dispetcher yo'q</p></div>
              ) : dispatchers.map(d => (
                <div key={d.id} onClick={() => setSelectedDispatcher(d)}
                  style={{ padding:'14px 18px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', cursor:'pointer' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{d.first_name} {d.last_name}</div>
                    <div style={{ fontSize:12, color:'#6b7280' }}>{d.phone||'—'}</div>
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <code style={{ background:'#e0f2fe', padding:'4px 12px', borderRadius:7, fontWeight:700, fontSize:16, letterSpacing:4, color:'#0369a1' }}>{d.login_code}</code>
                    <span style={{ padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:600, background:d.blocked?'#fee2e2':'#d1fae5', color:d.blocked?'#dc2626':'#065f46' }}>
                      {d.blocked?'Bloklangan':'Faol'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {showAddDispatcher && (
              <Modal title="Yangi dispetcher" onClose={() => setShowAddDispatcher(false)}>
                <form onSubmit={handleAddDispatcher}>
                  <Field label="Ism *"><input required value={addForm.first_name} onChange={e => setAddForm({...addForm,first_name:e.target.value})} /></Field>
                  <Field label="Familiya *"><input required value={addForm.last_name} onChange={e => setAddForm({...addForm,last_name:e.target.value})} /></Field>
                  <Field label="Telefon"><input value={addForm.phone} onChange={e => setAddForm({...addForm,phone:e.target.value})} placeholder="+998901234567" /></Field>
                  <MFoot><button type="button" onClick={() => setShowAddDispatcher(false)} style={BS('#f1f5f9','#374151')}>Bekor</button><button type="submit" disabled={saving} style={BS('#1e3a5f')}>{saving?'...':'Kod yaratish'}</button></MFoot>
                </form>
              </Modal>
            )}

            {newCode && (
              <Modal title="✅ Dispetcher kodi" onClose={() => setNewCode(null)}>
                <p style={{ textAlign:'center', marginBottom:8 }}><b>{newCode.name}</b> uchun kirish kodi:</p>
                <div style={{ fontSize:32, fontWeight:800, letterSpacing:8, background:'#e0f2fe', padding:'16px', borderRadius:10, textAlign:'center', color:'#0369a1', marginBottom:12 }}>{newCode.code}</div>
                <p style={{ color:'#6b7280', fontSize:12, textAlign:'center', marginBottom:16 }}>Telefon raqami + shu kod bilan kiradi</p>
                <button onClick={() => setNewCode(null)} style={{ ...BS('#1e3a5f'), width:'100%' }}>Tushunarli</button>
              </Modal>
            )}

            {selectedDispatcher && (
              <Modal title="🖥️ Dispetcher" onClose={() => setSelectedDispatcher(null)}>
                <div style={{ background:'#f8fafc', borderRadius:10, padding:14, marginBottom:14 }}>
                  <div style={{ marginBottom:6 }}><b>👤</b> {selectedDispatcher.first_name} {selectedDispatcher.last_name}</div>
                  <div style={{ marginBottom:8 }}><b>📱</b> {selectedDispatcher.phone||'—'}</div>
                  <div style={{ marginBottom:6, fontSize:13, color:'#374151' }}><b>🔑 Kirish kodi:</b></div>
                  <code style={{ background:'#e0f2fe', display:'block', padding:'10px', textAlign:'center', borderRadius:8, fontSize:24, fontWeight:800, letterSpacing:6, color:'#0369a1' }}>{selectedDispatcher.login_code}</code>
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { handleBlockDispatcher(selectedDispatcher); setSelectedDispatcher(null); }}
                    style={{ ...BS(selectedDispatcher.blocked?'#d1fae5':'#fef3c7', selectedDispatcher.blocked?'#065f46':'#92400e'), flex:1 }}>
                    {selectedDispatcher.blocked?'Blokdan chiqar':'Blokla'}
                  </button>
                  <button onClick={() => handleDeleteDispatcher(selectedDispatcher)} style={{ ...BS('#fee2e2','#991b1b'), flex:1 }}>O'chirish</button>
                </div>
              </Modal>
            )}
          </div>
        )}

        {/* ── DRIVERS ── */}
        {tab === 'drivers' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
              <h2 style={{ fontSize:18, fontWeight:700 }}>Haydovchilar ({drivers.length})</h2>
              <button onClick={() => setShowAddDriver(true)} style={BS('#1e3a5f')}>+ Haydovchi qo'shish</button>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:12 }}>
              {Object.entries(DRIVER_STATUS_LABEL).map(([s,l]) => (
                <div key={s} style={{ padding:'5px 14px', borderRadius:20, background:'#fff', border:`2px solid ${DRIVER_STATUS_COLOR[s]}`, fontSize:12, fontWeight:600, color:DRIVER_STATUS_COLOR[s] }}>
                  {l}: {drivers.filter(d=>d.status===s).length}
                </div>
              ))}
            </div>
            <div style={{ background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              {!drivers.length ? (
                <div style={{ textAlign:'center', padding:60, color:'#94a3b8' }}><div style={{ fontSize:36, marginBottom:10 }}>🚑</div><p>Hali haydovchi yo'q</p></div>
              ) : drivers.map(d => (
                <div key={d.id} style={{ padding:'14px 18px', borderBottom:'1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{d.driver_name}</div>
                    <div style={{ fontSize:12, color:'#6b7280', marginBottom:4 }}>🚑 {d.unit_number}</div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <code style={{ background:'#e0f2fe', padding:'2px 8px', borderRadius:5, fontSize:12, fontWeight:700, letterSpacing:2, color:'#0369a1' }}>{d.login_code}</code>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:(DRIVER_STATUS_COLOR[d.status]||'#6b7280')+'22', color:DRIVER_STATUS_COLOR[d.status]||'#6b7280', fontWeight:600 }}>
                        {DRIVER_STATUS_LABEL[d.status]||d.status||'?'}
                      </span>
                      <span style={{ fontSize:11, color:d.driver_user_id?'#10b981':'#f59e0b', fontWeight:600 }}>
                        {d.driver_user_id?'✅ Ulangan':'⏳ Kutilmoqda'}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDriver(d.id)} style={BS('#fee2e2','#991b1b')}>O'chir</button>
                </div>
              ))}
            </div>

            {showAddDriver && (
              <Modal title="Yangi haydovchi" onClose={() => { setShowAddDriver(false); setNewDriverCode(''); }}>
                {newDriverCode ? (
                  <div style={{ textAlign:'center' }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
                    <h3 style={{ marginBottom:8 }}>Haydovchi kodi</h3>
                    <div style={{ fontSize:28, fontWeight:800, letterSpacing:6, background:'#e0f2fe', padding:'14px', borderRadius:10, margin:'12px 0', color:'#0369a1' }}>{newDriverCode}</div>
                    <p style={{ color:'#6b7280', fontSize:12, marginBottom:16 }}>Bu kodni haydovchiga bering</p>
                    <button onClick={() => { setNewDriverCode(''); setShowAddDriver(false); }} style={{ ...BS('#1e3a5f'), width:'100%' }}>Yopish</button>
                  </div>
                ) : (
                  <>
                    <Field label="Ism *"><input required value={driverForm.driver_name} onChange={e => setDriverForm({...driverForm,driver_name:e.target.value})} /></Field>
                    <Field label="Telefon *"><input value={driverForm.driver_phone} onChange={e => setDriverForm({...driverForm,driver_phone:e.target.value})} placeholder="901234567" /></Field>
                    <Field label="Mashina raqami *"><input required value={driverForm.unit_number} onChange={e => setDriverForm({...driverForm,unit_number:e.target.value})} placeholder="A123BC" /></Field>
                    <Field label="Viloyat">
                      <select value={driverForm.plate_region} onChange={e => setDriverForm({...driverForm,plate_region:e.target.value})}>
                        <option value="">— Tanlang —</option>
                        {UZ_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
                      </select>
                    </Field>
                    <MFoot>
                      <button type="button" onClick={() => setShowAddDriver(false)} style={BS('#f1f5f9','#374151')}>Bekor</button>
                      <button onClick={handleAddDriver} disabled={saving} style={BS('#1e3a5f')}>{saving?'...':'Kod yaratish'}</button>
                    </MFoot>
                  </>
                )}
              </Modal>
            )}
          </div>
        )}

        {/* ── SETTINGS ── */}
        {tab === 'settings' && dc && centerForm && (
          <div style={{ maxWidth:500 }}>
            <h2 style={{ fontSize:18, fontWeight:700, marginBottom:16 }}>⚙️ Markaz sozlamalari</h2>
            <div style={{ background:'#fff', borderRadius:12, padding:20, boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
              <Field label="Markaz nomi">
                <input value={centerForm.name} onChange={e => setCenterForm({...centerForm,name:e.target.value})} />
              </Field>
              <Field label="Telefon">
                <input value={centerForm.phone} onChange={e => setCenterForm({...centerForm,phone:e.target.value})} placeholder="+998901234567" />
              </Field>
              <Field label="Shahar">
                <select value={centerForm.city} onChange={e => setCenterForm({...centerForm,city:e.target.value})}>
                  <option value="">— Tanlang —</option>
                  {UZ_CITIES.map(c=><option key={c} value={c}>{c}</option>)}
                </select>
              </Field>
              <div style={{ background:'#f8fafc', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13 }}>
                <div style={{ color:'#6b7280', marginBottom:2, fontSize:12 }}>Xizmat turi (o'zgartirib bo'lmaydi)</div>
                <div style={{ fontWeight:700 }}>{dc.service_type}</div>
              </div>
              <button onClick={handleSaveCenter} disabled={saving} style={{ ...BS('#0f766e'), width:'100%', padding:'12px' }}>
                {saving ? 'Saqlanmoqda...' : '💾 Saqlash'}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Assign ambulance modal */}
      {assignModal && (
        <Modal title={`🚑 Ambulans biriktirish — #${assignModal.id}`} onClose={() => setAssignModal(null)}>
          <p style={{ fontSize:13, color:'#6b7280', marginBottom:12 }}>Faqat tayyor haydovchilar ko'rsatilmoqda</p>
          {ambulances.filter(a=>a.status==='available').map(a => (
            <div key={a.id} onClick={() => assignAmbulance(assignModal.id, a.id)}
              style={{ padding:'12px 14px', border:'2px solid #e2e8f0', borderRadius:10, marginBottom:8, cursor:'pointer', display:'flex', justifyContent:'space-between', transition:'border-color 0.15s' }}
              onMouseOver={e=>e.currentTarget.style.borderColor='#10b981'}
              onMouseOut={e=>e.currentTarget.style.borderColor='#e2e8f0'}>
              <div>
                <div style={{ fontWeight:700 }}>🚑 {a.unit_number}</div>
                <div style={{ fontSize:12, color:'#6b7280' }}>{a.driver_name}</div>
              </div>
              <span style={{ color:'#10b981', fontWeight:700, fontSize:13 }}>Tayyor ✓</span>
            </div>
          ))}
          {!ambulances.filter(a=>a.status==='available').length && (
            <div style={{ textAlign:'center', padding:30, color:'#94a3b8' }}>Tayyor ambulans yo'q</div>
          )}
          <button onClick={() => setAssignModal(null)} style={{ ...BS('#f1f5f9','#374151'), width:'100%', marginTop:8 }}>Yopish</button>
        </Modal>
      )}
    </div>
  );
}

// helpers
function BS(bg, color='#fff') {
  return { padding:'8px 14px', background:bg, border:'none', borderRadius:8, cursor:'pointer', fontWeight:600, fontSize:13, color };
}
function Modal({ title, onClose, children }) {
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }} onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:18, padding:24, width:440, maxWidth:'93vw', maxHeight:'90vh', overflowY:'auto' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
          <h3 style={{ margin:0, fontSize:16, fontWeight:700 }}>{title}</h3>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#94a3b8' }}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function MFoot({ children }) {
  return <div style={{ display:'flex', gap:10, marginTop:14, justifyContent:'flex-end' }}>{children}</div>;
}
function Field({ label, children }) {
  return (
    <div style={{ marginBottom:14 }}>
      <label style={{ display:'block', fontSize:13, fontWeight:600, color:'#374151', marginBottom:6 }}>{label}</label>
      {React.cloneElement(children, { style:{ width:'100%', padding:'10px 12px', border:'1.5px solid #e2e8f0', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box', ...children.props.style } })}
    </div>
  );
}
