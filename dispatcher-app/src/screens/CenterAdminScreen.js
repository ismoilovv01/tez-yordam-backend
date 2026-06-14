import React, { useState, useEffect, useCallback } from 'react';
import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const UZ_REGIONS = {
  '01': 'Toshkent shahri', '10': 'Toshkent viloyati', '20': 'Sirdaryo viloyati',
  '25': 'Jizzax viloyati', '30': 'Samarqand viloyati', '40': "Farg'ona viloyati",
  '50': 'Namangan viloyati', '60': 'Andijon viloyati', '70': 'Qashqadaryo viloyati',
  '75': 'Surxondaryo viloyati', '80': 'Buxoro viloyati', '85': 'Navoiy viloyati',
  '90': 'Xorazm viloyati', '95': "Qoraqalpog'iston Respublikasi",
};

const h = (token) => ({ Authorization: `Bearer ${token}` });

function CenterAdminScreen({ token, user, onLogout }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [dispatchers, setDispatchers] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [newCode, setNewCode] = useState(null); // { name, code } after create
  const [showAddDispatcher, setShowAddDispatcher] = useState(false);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [addForm, setAddForm] = useState({ first_name: '', last_name: '', phone: '' });
  const [driverForm, setDriverForm] = useState({ driver_name: '', driver_phone: '', unit_number: '', plate_region: '' });
  const [generatedDriverCode, setGeneratedDriverCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [selectedDispatcher, setSelectedDispatcher] = useState(null);

  const loadOverview = useCallback(async () => {
    try {
      const r = await axios.get(`${API_URL}/api/center-admin/overview`, { headers: h(token) });
      setOverview(r.data);
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

  useEffect(() => { loadOverview(); }, [loadOverview]);
  useEffect(() => { if (tab === 'dispatchers') loadDispatchers(); }, [tab, loadDispatchers]);
  useEffect(() => { if (tab === 'drivers') loadDrivers(); }, [tab, loadDrivers]);

  const handleAddDispatcher = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/api/center-admin/dispatchers`, addForm, { headers: h(token) });
      setNewCode({ name: `${addForm.first_name} ${addForm.last_name}`, code: r.data.login_code });
      setAddForm({ first_name: '', last_name: '', phone: '' });
      setShowAddDispatcher(false);
      loadDispatchers();
      loadOverview();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
    setLoading(false);
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
      setSelectedDispatcher(null);
      loadDispatchers();
      loadOverview();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
  };

  const handleAddDriver = async () => {
    if (!driverForm.driver_name || !driverForm.unit_number) return alert('Ism va mashina raqami kerak');
    if (!driverForm.driver_phone) return alert('Telefon kerak');
    if (!driverForm.plate_region) return alert('Viloyat kodi kerak');
    setLoading(true);
    try {
      const r = await axios.post(`${API_URL}/api/dispatcher/create-driver-code`, driverForm, { headers: h(token) });
      setGeneratedDriverCode(r.data.login_code);
      setDriverForm({ driver_name: '', driver_phone: '', unit_number: '', plate_region: '' });
      loadDrivers();
      loadOverview();
    } catch (err) { alert(err.response?.data?.error || 'Xato'); }
    setLoading(false);
  };

  const handleDeleteDriver = async (id) => {
    if (!window.confirm("Haydovchini o'chirasizmi?")) return;
    try {
      await axios.delete(`${API_URL}/api/dispatcher/drivers/${id}`, { headers: h(token) });
      loadDrivers();
    } catch {}
  };

  const centerInfo = overview?.dispatch_center;
  const byStatus = Object.fromEntries((overview?.emergencies_by_status || []).map(r => [r.status, parseInt(r.count)]));
  const totalEmergencies = Object.values(byStatus).reduce((s, n) => s + n, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: '#f5f7fa', fontFamily: 'system-ui,sans-serif' }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(135deg,#1e3a5f,#0f766e)', color: '#fff', padding: '14px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>🏢 {centerInfo?.name || 'Markaz Admin'}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{user.first_name} {user.last_name} · Markaz Administratori</div>
        </div>
        <button onClick={onLogout} style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: 8, color: '#fff', cursor: 'pointer', fontSize: 13 }}>Chiqish</button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', background: '#fff', borderBottom: '2px solid #e5e7eb', padding: '0 24px' }}>
        {[['overview', '📊 Umumiy'], ['dispatchers', '🖥️ Dispetcherlar'], ['drivers', '🚑 Haydovchilar']].map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            style={{ padding: '14px 20px', border: 'none', background: 'none', cursor: 'pointer', fontWeight: tab === key ? 700 : 400, color: tab === key ? '#1e3a5f' : '#6b7280', borderBottom: tab === key ? '3px solid #1e3a5f' : '3px solid transparent', fontSize: 14, transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      <div style={{ flex: 1, padding: 24, maxWidth: 1000, margin: '0 auto', width: '100%' }}>

        {/* Overview */}
        {tab === 'overview' && overview && (
          <div>
            <h2 style={{ fontSize: 20, fontWeight: 700, marginBottom: 20 }}>Markazingiz haqida</h2>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 24 }}>
              {[
                { icon: '🖥️', label: 'Dispetcherlar', value: overview.dispatcher_count, color: '#3b82f6' },
                { icon: '🚑', label: 'Haydovchilar', value: overview.driver_count, color: '#10b981' },
                { icon: '🚨', label: 'Jami chaqiriqlar', value: totalEmergencies, color: '#ef4444' },
                { icon: '✅', label: 'Yakunlangan', value: byStatus['completed'] || 0, color: '#8b5cf6' },
              ].map(({ icon, label, value, color }) => (
                <div key={label} style={{ background: '#fff', borderRadius: 14, padding: '18px 20px', display: 'flex', gap: 14, alignItems: 'center', boxShadow: '0 1px 4px rgba(0,0,0,0.06)', borderLeft: `4px solid ${color}` }}>
                  <span style={{ fontSize: 28 }}>{icon}</span>
                  <div>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{value}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
                  </div>
                </div>
              ))}
            </div>

            {centerInfo && (
              <div style={{ background: '#fff', borderRadius: 14, padding: 20, boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
                <h3 style={{ fontWeight: 700, marginBottom: 14 }}>📍 Markaz ma'lumotlari</h3>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 14 }}>
                  <tbody>
                    {[
                      ['Nomi', centerInfo.name],
                      ['Shahar', centerInfo.city],
                      ['Xizmat turi', centerInfo.service_type],
                      ['Telefon', centerInfo.phone || '—'],
                      ['Email', centerInfo.email || '—'],
                    ].map(([k, v]) => (
                      <tr key={k} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 0', color: '#6b7280', width: 140 }}>{k}</td>
                        <td style={{ padding: '10px 0', fontWeight: 600 }}>{v}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Dispatchers */}
        {tab === 'dispatchers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Dispetcherlar ({dispatchers.length})</h2>
              <button onClick={() => setShowAddDispatcher(true)}
                style={{ padding: '10px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                + Dispetcher qo'shish
              </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {dispatchers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🖥️</div>
                  <p>Hali dispetcher yo'q. Birinchi dispetcherni qo'shing.</p>
                </div>
              ) : dispatchers.map(d => (
                <div key={d.id}
                  style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}
                  onClick={() => setSelectedDispatcher(d)}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 15 }}>{d.first_name} {d.last_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{d.phone || '—'}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <code style={{ background: '#e0f2fe', padding: '5px 12px', borderRadius: 7, fontWeight: 700, fontSize: 15, letterSpacing: 3, color: '#0369a1' }}>
                      {d.login_code}
                    </code>
                    <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 600, background: d.blocked ? '#fee2e2' : '#d1fae5', color: d.blocked ? '#dc2626' : '#065f46' }}>
                      {d.blocked ? 'Bloklangan' : 'Faol'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add dispatcher modal */}
            {showAddDispatcher && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                onClick={() => setShowAddDispatcher(false)}>
                <div style={{ background: '#fff', borderRadius: 18, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                  <h3 style={{ fontWeight: 700, marginBottom: 20 }}>Yangi dispetcher</h3>
                  <form onSubmit={handleAddDispatcher}>
                    <Field label="Ism *"><input required value={addForm.first_name} onChange={e => setAddForm({...addForm, first_name: e.target.value})} /></Field>
                    <Field label="Familiya *"><input required value={addForm.last_name} onChange={e => setAddForm({...addForm, last_name: e.target.value})} /></Field>
                    <Field label="Telefon"><input value={addForm.phone} onChange={e => setAddForm({...addForm, phone: e.target.value})} placeholder="+998901234567" /></Field>
                    <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                      <button type="button" onClick={() => setShowAddDispatcher(false)} style={{ flex: 1, padding: 11, background: '#f1f5f9', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 600 }}>Bekor</button>
                      <button type="submit" disabled={loading} style={{ flex: 1, padding: 11, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 600 }}>
                        {loading ? 'Yaratilmoqda...' : 'Kod yaratish'}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Generated dispatcher code popup */}
            {newCode && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
                <div style={{ background: '#fff', borderRadius: 18, padding: 32, width: 360, textAlign: 'center' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                  <h3 style={{ marginBottom: 8 }}>{newCode.name} uchun kirish kodi</h3>
                  <div style={{ fontSize: 36, fontWeight: 800, letterSpacing: 8, background: '#e0f2fe', padding: '16px 24px', borderRadius: 12, margin: '16px 0', color: '#0369a1' }}>
                    {newCode.code}
                  </div>
                  <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>Bu kodni dispetcherga bering. U shu kod bilan tizimga kiradi.</p>
                  <button onClick={() => setNewCode(null)} style={{ width: '100%', padding: 12, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, cursor: 'pointer', fontSize: 15 }}>
                    Tushunarli
                  </button>
                </div>
              </div>
            )}

            {/* Dispatcher detail modal */}
            {selectedDispatcher && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                onClick={() => setSelectedDispatcher(null)}>
                <div style={{ background: '#fff', borderRadius: 18, padding: 24, width: 380, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                    <h3 style={{ margin: 0 }}>🖥️ Dispetcher</h3>
                    <button onClick={() => setSelectedDispatcher(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
                  </div>
                  <div style={{ background: '#f8fafc', borderRadius: 10, padding: 16, marginBottom: 14 }}>
                    <div style={{ marginBottom: 8 }}><b>👤 Ism:</b> {selectedDispatcher.first_name} {selectedDispatcher.last_name}</div>
                    <div style={{ marginBottom: 8 }}><b>📱 Telefon:</b> {selectedDispatcher.phone || '—'}</div>
                    <div style={{ marginBottom: 4 }}><b>🔑 Kirish kodi:</b></div>
                    <code style={{ background: '#e0f2fe', padding: '8px 14px', borderRadius: 8, fontWeight: 700, fontSize: 22, letterSpacing: 5, color: '#0369a1', display: 'block', textAlign: 'center', marginTop: 6 }}>
                      {selectedDispatcher.login_code}
                    </code>
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => { handleBlockDispatcher(selectedDispatcher); setSelectedDispatcher(null); }}
                      style={{ flex: 1, padding: 10, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, background: selectedDispatcher.blocked ? '#d1fae5' : '#fef3c7', color: selectedDispatcher.blocked ? '#065f46' : '#92400e' }}>
                      {selectedDispatcher.blocked ? 'Blokdan chiqar' : 'Blokla'}
                    </button>
                    <button onClick={() => handleDeleteDispatcher(selectedDispatcher)}
                      style={{ flex: 1, padding: 10, border: 'none', borderRadius: 8, cursor: 'pointer', fontWeight: 600, background: '#fee2e2', color: '#991b1b' }}>
                      O'chirish
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Drivers */}
        {tab === 'drivers' && (
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <h2 style={{ fontSize: 20, fontWeight: 700 }}>Haydovchilar ({drivers.length})</h2>
              <button onClick={() => setShowAddDriver(true)}
                style={{ padding: '10px 18px', background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, cursor: 'pointer', fontSize: 14 }}>
                + Haydovchi qo'shish
              </button>
            </div>

            <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.06)' }}>
              {drivers.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 60, color: '#94a3b8' }}>
                  <div style={{ fontSize: 40, marginBottom: 12 }}>🚑</div>
                  <p>Hali haydovchi yo'q.</p>
                </div>
              ) : drivers.map(d => (
                <div key={d.id} style={{ padding: '14px 20px', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: 600 }}>{d.driver_name}</div>
                    <div style={{ fontSize: 12, color: '#6b7280' }}>🚑 {d.unit_number} · {d.plate_region ? `${d.plate_region} — ${UZ_REGIONS[d.plate_region] || ''}` : '—'}</div>
                    <div style={{ fontSize: 11, marginTop: 4 }}>
                      <code style={{ background: '#e0f2fe', padding: '2px 8px', borderRadius: 5, fontWeight: 700, letterSpacing: 2, color: '#0369a1' }}>{d.login_code}</code>
                      <span style={{ marginLeft: 8, color: d.driver_user_id ? '#10b981' : '#f59e0b', fontWeight: 600, fontSize: 11 }}>
                        {d.driver_user_id ? '✅ Ulangan' : '⏳ Kutilmoqda'}
                      </span>
                    </div>
                  </div>
                  <button onClick={() => handleDeleteDriver(d.id)}
                    style={{ padding: '6px 12px', background: '#fee2e2', color: '#991b1b', border: 'none', borderRadius: 7, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}>
                    O'chir
                  </button>
                </div>
              ))}
            </div>

            {/* Add driver modal */}
            {showAddDriver && (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
                onClick={() => { setShowAddDriver(false); setGeneratedDriverCode(''); }}>
                <div style={{ background: '#fff', borderRadius: 18, padding: 28, width: 400, maxWidth: '90vw' }} onClick={e => e.stopPropagation()}>
                  {generatedDriverCode ? (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: 36, marginBottom: 8 }}>✅</div>
                      <h3 style={{ marginBottom: 8 }}>Haydovchi kodi yaratildi!</h3>
                      <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: 6, background: '#e0f2fe', padding: '14px 20px', borderRadius: 12, margin: '14px 0', color: '#0369a1' }}>{generatedDriverCode}</div>
                      <p style={{ color: '#6b7280', fontSize: 13, marginBottom: 20 }}>Bu kodni haydovchiga bering.</p>
                      <button onClick={() => { setGeneratedDriverCode(''); setShowAddDriver(false); }}
                        style={{ width: '100%', padding: 12, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, fontWeight: 600, cursor: 'pointer' }}>Yopish</button>
                    </div>
                  ) : (
                    <>
                      <h3 style={{ fontWeight: 700, marginBottom: 20 }}>Yangi haydovchi</h3>
                      <Field label="Ism *"><input required value={driverForm.driver_name} onChange={e => setDriverForm({...driverForm, driver_name: e.target.value})} /></Field>
                      <Field label="Telefon *"><input value={driverForm.driver_phone} onChange={e => setDriverForm({...driverForm, driver_phone: e.target.value.replace(/[^0-9]/g,'')})} placeholder="901234567" /></Field>
                      <Field label="Mashina raqami *"><input required value={driverForm.unit_number} onChange={e => setDriverForm({...driverForm, unit_number: e.target.value})} placeholder="A123BC" /></Field>
                      <Field label="Viloyat *">
                        <select value={driverForm.plate_region} onChange={e => setDriverForm({...driverForm, plate_region: e.target.value})}>
                          <option value="">— Tanlang —</option>
                          {Object.entries(UZ_REGIONS).map(([code, name]) => <option key={code} value={code}>{code} — {name}</option>)}
                        </select>
                      </Field>
                      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                        <button type="button" onClick={() => setShowAddDriver(false)} style={{ flex: 1, padding: 11, background: '#f1f5f9', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 600 }}>Bekor</button>
                        <button onClick={handleAddDriver} disabled={loading} style={{ flex: 1, padding: 11, background: '#1e3a5f', color: '#fff', border: 'none', borderRadius: 9, cursor: 'pointer', fontWeight: 600 }}>
                          {loading ? 'Yaratilmoqda...' : 'Kod yaratish'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>{label}</label>
      {React.cloneElement(children, {
        style: { width: '100%', padding: '10px 13px', border: '1.5px solid #e2e8f0', borderRadius: 9, fontSize: 14, outline: 'none', boxSizing: 'border-box', ...children.props.style }
      })}
    </div>
  );
}

export default CenterAdminScreen;
