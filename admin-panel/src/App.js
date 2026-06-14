import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API = 'https://tez-yordam-backend-production.up.railway.app';

async function apiFetch(path, token, opts = {}) {
  const res = await fetch(`${API}${path}`, {
    method: opts.method || 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Server xatosi');
  return data;
}

// ─── Login ───────────────────────────────────────────────────────────────────
function LoginPage({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API}/api/auth/email-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login muvaffaqiyatsiz');
      if (data.user.user_type !== 'admin') throw new Error('Bu hisob administrator emas');
      onLogin(data.token, data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-bg">
      <div className="login-card">
        <div className="login-logo">
          <span className="login-icon">🛡️</span>
          <h1>Help Mee Admin</h1>
          <p>Boshqaruv paneli</p>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="field">
            <label>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@helpmee.uz"
              required
              autoFocus
              autoComplete="email"
            />
          </div>
          <div className="field">
            <label>Parol</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
            />
          </div>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? 'Kirish...' : 'Kirish'}
          </button>
        </form>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/admin-panel/overview', token)
      .then((d) => { setData(d); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token]);

  if (loading) return <div className="loading">Yuklanmoqda...</div>;
  if (error) return <div className="error-box">{error}</div>;
  if (!data) return null;

  const usersByType = Object.fromEntries((data.users_by_type || []).map((r) => [r.user_type, parseInt(r.count)]));
  const byStatus = Object.fromEntries((data.emergencies_by_status || []).map((r) => [r.status, parseInt(r.count)]));
  const byService = Object.fromEntries((data.emergencies_by_service || []).map((r) => [r.service_type, parseInt(r.count)]));
  const unitsByStatus = Object.fromEntries((data.units_by_status || []).map((r) => [r.status, parseInt(r.count)]));
  const totalUsers = Object.values(usersByType).reduce((s, n) => s + n, 0);
  const totalEmergencies = Object.values(byStatus).reduce((s, n) => s + n, 0);

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>

      <div className="stat-grid">
        <StatCard icon="👥" label="Foydalanuvchilar" value={totalUsers} color="blue" />
        <StatCard icon="🚨" label="Jami chaqiriqlar" value={totalEmergencies} color="red" />
        <StatCard icon="🏢" label="Dispatch markazlari" value={parseInt(data.dispatch_centers_count) || 0} color="purple" />
        <StatCard icon="🚑" label="Faol birliklar" value={unitsByStatus['available'] || 0} color="green" />
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3>Foydalanuvchilar</h3>
          <table className="mini-table">
            <tbody>
              {[['caller', 'Chaqiruvchilar', '📞'], ['dispatcher', 'Dispetcherlar', '🖥️'], ['driver', 'Haydovchilar', '🚗'], ['admin', 'Adminlar', '🛡️']].map(([type, label, icon]) => (
                <tr key={type}>
                  <td>{icon} {label}</td>
                  <td><strong>{usersByType[type] || 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Chaqiriqlar holati</h3>
          <table className="mini-table">
            <tbody>
              {[['new', 'Yangi', '#f59e0b'], ['confirmed', 'Tasdiqlangan', '#3b82f6'], ['dispatched', "Jo'natilgan", '#8b5cf6'], ['completed', 'Yakunlangan', '#10b981'], ['cancelled', 'Bekor', '#ef4444']].map(([s, label, color]) => (
                <tr key={s}>
                  <td><span className="dot" style={{ background: color }} />{label}</td>
                  <td><strong>{byStatus[s] || 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Xizmat turi</h3>
          <table className="mini-table">
            <tbody>
              {[['ambulance', 'Tez yordam', '🚑'], ['police', 'Politsiya', '🚔'], ['firefighter', "O't o'chiruvchi", '🚒']].map(([s, label, icon]) => (
                <tr key={s}>
                  <td>{icon} {label}</td>
                  <td><strong>{byService[s] || 0}</strong></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {(data.recent_emergencies || []).length > 0 && (
        <div className="card" style={{ marginTop: 20 }}>
          <h3>So'nggi chaqiriqlar</h3>
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>ID</th><th>Xizmat</th><th>Holat</th><th>Vaqt</th></tr>
              </thead>
              <tbody>
                {data.recent_emergencies.map((e) => (
                  <tr key={e.id}>
                    <td>#{e.id}</td>
                    <td><ServiceBadge type={e.service_type} /></td>
                    <td><StatusBadge status={e.status} /></td>
                    <td>{new Date(e.created_at).toLocaleString('uz-UZ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Users ────────────────────────────────────────────────────────────────────
function UsersPage({ token }) {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const q = filter ? `?user_type=${filter}` : '';
    apiFetch(`/api/admin-panel/users${q}`, token)
      .then((d) => { setUsers(d.users || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const toggleBlock = async (user) => {
    try {
      await apiFetch(`/api/admin-panel/users/${user.id}`, token, { method: 'PATCH', body: { blocked: !user.blocked } });
      load();
    } catch (e) { alert(e.message); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`${user.first_name || ''} ${user.last_name || ''} ni o'chirasizmi?`)) return;
    try {
      await apiFetch(`/api/admin-panel/users/${user.id}`, token, { method: 'DELETE' });
      load();
    } catch (e) { alert(e.message); }
  };

  const changeRole = async (user, newRole) => {
    try {
      await apiFetch(`/api/admin-panel/users/${user.id}`, token, { method: 'PATCH', body: { user_type: newRole } });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <h2 className="page-title">Foydalanuvchilar</h2>
      <div className="toolbar">
        <div className="filter-tabs">
          {[['', 'Barchasi'], ['caller', 'Chaqiruvchilar'], ['dispatcher', 'Dispetcherlar'], ['driver', 'Haydovchilar'], ['admin', 'Adminlar']].map(([v, l]) => (
            <button key={v} className={`tab ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
        <button className="btn-outline" onClick={load}>Yangilash</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ism</th>
                  <th>Email / Telefon</th>
                  <th>Rol</th>
                  <th>Markaz</th>
                  <th>Holat</th>
                  <th>Amallar</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={u.blocked ? 'row-blocked' : ''}>
                    <td>
                      <strong>{u.first_name || ''} {u.last_name || ''}</strong>
                      <br /><small className="muted">#{u.id}</small>
                    </td>
                    <td>
                      {u.email || <span className="muted">—</span>}
                      <br /><small className="muted">{u.phone || '—'}</small>
                    </td>
                    <td>
                      <select
                        className="role-select"
                        value={u.user_type}
                        onChange={(e) => changeRole(u, e.target.value)}
                      >
                        <option value="caller">Chaqiruvchi</option>
                        <option value="dispatcher">Dispetcher</option>
                        <option value="driver">Haydovchi</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td>{u.dispatch_center_name || <span className="muted">—</span>}</td>
                    <td>
                      {u.blocked
                        ? <span className="badge badge-red">Bloklangan</span>
                        : <span className="badge badge-green">Faol</span>}
                    </td>
                    <td>
                      <div className="action-row">
                        <button
                          className={`btn-sm ${u.blocked ? 'btn-success' : 'btn-warn'}`}
                          onClick={() => toggleBlock(u)}
                        >
                          {u.blocked ? 'Blokdan chiqar' : 'Blokla'}
                        </button>
                        <button className="btn-sm btn-danger" onClick={() => deleteUser(u)}>
                          O'chir
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!users.length && (
                  <tr><td colSpan={6} className="empty-cell">Foydalanuvchilar topilmadi</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Centers ─────────────────────────────────────────────────────────
const EMPTY_CENTER = { name: '', city: '', service_type: 'ambulance', phone: '', email: '', latitude: '', longitude: '' };

function DispatchCentersPage({ token }) {
  const [centers, setCenters] = useState([]);
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState(EMPTY_CENTER);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    apiFetch('/api/admin-panel/dispatch-centers', token)
      .then((d) => { setCenters(d.dispatch_centers || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm(EMPTY_CENTER); setModal('add'); };
  const openEdit = (c) => {
    setForm({
      name: c.name || '', city: c.city || '', service_type: c.service_type || 'ambulance',
      phone: c.phone || '', email: c.email || '',
      latitude: c.latitude || '', longitude: c.longitude || '',
    });
    setModal(c);
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'add') {
        await apiFetch('/api/admin-panel/dispatch-centers', token, { method: 'POST', body: form });
      } else {
        await apiFetch(`/api/admin-panel/dispatch-centers/${modal.id}`, token, { method: 'PATCH', body: form });
      }
      setModal(null);
      load();
    } catch (err) {
      alert(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`"${c.name}" ni o'chirasizmi?`)) return;
    try {
      await apiFetch(`/api/admin-panel/dispatch-centers/${c.id}`, token, { method: 'DELETE' });
      load();
    } catch (err) { alert(err.message); }
  };

  return (
    <div>
      <h2 className="page-title">Dispatch Markazlari</h2>
      <div className="toolbar">
        <button className="btn-primary" style={{ width: 'auto' }} onClick={openAdd}>+ Markaz qo'shish</button>
        <button className="btn-outline" onClick={load}>Yangilash</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Nomi</th><th>Shahar</th><th>Xizmat</th><th>Dispetcherlar</th><th>Birliklar</th><th>Amallar</th></tr>
              </thead>
              <tbody>
                {centers.map((c) => (
                  <tr key={c.id}>
                    <td><strong>{c.name}</strong><br /><small className="muted">#{c.id}</small></td>
                    <td>{c.city}</td>
                    <td><ServiceBadge type={c.service_type} /></td>
                    <td>{c.dispatcher_count || 0}</td>
                    <td>{c.unit_count || 0}</td>
                    <td>
                      <div className="action-row">
                        <button className="btn-sm btn-info" onClick={() => openEdit(c)}>Tahrirlash</button>
                        <button className="btn-sm btn-danger" onClick={() => handleDelete(c)}>O'chir</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!centers.length && <tr><td colSpan={6} className="empty-cell">Markazlar topilmadi</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <Modal title={modal === 'add' ? "Markaz qo'shish" : 'Tahrirlash'} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <div className="field">
              <label>Nomi *</label>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
            </div>
            <div className="field">
              <label>Shahar *</label>
              <input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required />
            </div>
            <div className="field">
              <label>Xizmat turi *</label>
              <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
                <option value="ambulance">🚑 Tez yordam</option>
                <option value="police">🚔 Politsiya</option>
                <option value="firefighter">🚒 O't o'chiruvchi</option>
              </select>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Telefon</label>
                <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </div>
              <div className="field">
                <label>Email</label>
                <input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label>Kenglik (lat)</label>
                <input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} />
              </div>
              <div className="field">
                <label>Uzunlik (lng)</label>
                <input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} />
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Bekor</button>
              <button type="submit" className="btn-primary" style={{ width: 'auto' }} disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

// ─── Emergencies ──────────────────────────────────────────────────────────────
function EmergenciesPage({ token }) {
  const [emergencies, setEmergencies] = useState([]);
  const [status, setStatus] = useState('');
  const [serviceType, setServiceType] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (serviceType) params.set('service_type', serviceType);
    apiFetch(`/api/admin-panel/emergencies?${params}`, token)
      .then((d) => { setEmergencies(d.emergencies || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token, status, serviceType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2 className="page-title">Chaqiriqlar</h2>
      <div className="toolbar">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div className="filter-tabs">
            {[['', 'Barchasi'], ['new', 'Yangi'], ['confirmed', 'Tasdiqlangan'], ['dispatched', "Jo'natilgan"], ['completed', 'Yakunlangan'], ['cancelled', 'Bekor']].map(([v, l]) => (
              <button key={v} className={`tab ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
            ))}
          </div>
          <div className="filter-tabs">
            {[['', 'Barcha xizmat'], ['ambulance', '🚑 Tez yordam'], ['police', '🚔 Politsiya'], ['firefighter', "🚒 O't o'chiruvchi"]].map(([v, l]) => (
              <button key={v} className={`tab tab-sm ${serviceType === v ? 'active' : ''}`} onClick={() => setServiceType(v)}>{l}</button>
            ))}
          </div>
        </div>
        <button className="btn-outline" onClick={load}>Yangilash</button>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>ID</th><th>Chaqiruvchi</th><th>Xizmat</th><th>Holat</th><th>Markaz</th><th>Vaqt</th></tr>
              </thead>
              <tbody>
                {emergencies.map((e) => (
                  <tr key={e.id}>
                    <td>#{e.id}</td>
                    <td>
                      {e.first_name ? `${e.first_name} ${e.last_name}` : <span className="muted">—</span>}
                      <br /><small className="muted">{e.caller_phone || '—'}</small>
                    </td>
                    <td><ServiceBadge type={e.service_type} /></td>
                    <td><StatusBadge status={e.status} /></td>
                    <td>{e.dispatch_center_name || <span className="muted">—</span>}</td>
                    <td>{new Date(e.created_at).toLocaleString('uz-UZ')}</td>
                  </tr>
                ))}
                {!emergencies.length && <tr><td colSpan={6} className="empty-cell">Chaqiriqlar topilmadi</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
function FeedbackPage({ token }) {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setLoading(true);
    apiFetch('/api/admin-panel/feedback', token)
      .then((d) => { setFeedback(d.feedback || []); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token]);

  const avg = feedback.filter((f) => f.rating).reduce((s, f, _, a) => s + f.rating / a.length, 0);

  return (
    <div>
      <h2 className="page-title">Fikr-mulohazalar</h2>
      {feedback.length > 0 && (
        <div className="stat-grid" style={{ marginBottom: 20 }}>
          <StatCard icon="💬" label="Jami fikrlar" value={feedback.length} color="blue" />
          <StatCard icon="⭐" label="O'rtacha reyting" value={avg ? avg.toFixed(1) : '—'} color="green" />
        </div>
      )}
      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr><th>Foydalanuvchi</th><th>Reyting</th><th>Xabar</th><th>Tur</th><th>Xizmat</th><th>Vaqt</th></tr>
              </thead>
              <tbody>
                {feedback.map((f) => (
                  <tr key={f.id}>
                    <td>
                      {f.first_name ? `${f.first_name} ${f.last_name}` : <span className="muted">—</span>}
                      <br /><small className="muted">{f.phone || '—'}</small>
                    </td>
                    <td>
                      {f.rating
                        ? <span className="stars">{'★'.repeat(f.rating)}{'☆'.repeat(5 - f.rating)}</span>
                        : <span className="muted">—</span>}
                    </td>
                    <td style={{ maxWidth: 200 }}>{f.message || <span className="muted">—</span>}</td>
                    <td>{f.type}</td>
                    <td>{f.service_type ? <ServiceBadge type={f.service_type} /> : <span className="muted">—</span>}</td>
                    <td>{new Date(f.created_at).toLocaleString('uz-UZ')}</td>
                  </tr>
                ))}
                {!feedback.length && <tr><td colSpan={6} className="empty-cell">Fikr-mulohazalar topilmadi</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Shared ───────────────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="modal-close" type="button" onClick={onClose}>✕</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }) {
  return (
    <div className={`stat-card stat-${color}`}>
      <span className="stat-icon">{icon}</span>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  );
}

function ServiceBadge({ type }) {
  const map = {
    ambulance: ['🚑', 'badge-red', 'Tez yordam'],
    police: ['🚔', 'badge-blue', 'Politsiya'],
    firefighter: ['🚒', 'badge-orange', "O't o'chiruvchi"],
  };
  const [icon, cls, label] = map[type] || ['?', 'badge-gray', type];
  return <span className={`badge ${cls}`}>{icon} {label}</span>;
}

function StatusBadge({ status }) {
  const map = {
    new: ['badge-yellow', 'Yangi'],
    confirmed: ['badge-blue', 'Tasdiqlangan'],
    dispatched: ['badge-purple', "Jo'natilgan"],
    completed: ['badge-green', 'Yakunlangan'],
    cancelled: ['badge-red', 'Bekor'],
  };
  const [cls, label] = map[status] || ['badge-gray', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

// ─── App shell ────────────────────────────────────────────────────────────────
const PAGES = [
  { id: 'dashboard', icon: '📊', label: 'Dashboard' },
  { id: 'users', icon: '👥', label: 'Foydalanuvchilar' },
  { id: 'centers', icon: '🏢', label: 'Markazlar' },
  { id: 'emergencies', icon: '🚨', label: 'Chaqiriqlar' },
  { id: 'feedback', icon: '💬', label: 'Fikr-mulohazalar' },
];

function App() {
  const [token, setToken] = useState(() => localStorage.getItem('adminToken') || '');
  const [user, setUser] = useState(() => {
    try { return JSON.parse(localStorage.getItem('adminUser') || 'null'); } catch { return null; }
  });
  const [page, setPage] = useState('dashboard');

  const handleLogin = (t, u) => {
    setToken(t);
    setUser(u);
    localStorage.setItem('adminToken', t);
    localStorage.setItem('adminUser', JSON.stringify(u));
  };

  const handleLogout = () => {
    setToken('');
    setUser(null);
    localStorage.removeItem('adminToken');
    localStorage.removeItem('adminUser');
  };

  if (!token) return <LoginPage onLogin={handleLogin} />;

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span>🛡️</span>
          <span>Help Mee</span>
        </div>
        <nav>
          {PAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`nav-item ${page === p.id ? 'active' : ''}`}
              onClick={() => setPage(p.id)}
            >
              <span className="nav-icon">{p.icon}</span>
              <span>{p.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">
            <strong>{user?.first_name} {user?.last_name}</strong>
            <br /><span className="badge badge-purple" style={{ marginTop: 4 }}>Admin</span>
          </div>
          <button type="button" className="btn-logout" onClick={handleLogout}>Chiqish</button>
        </div>
      </aside>

      <main className="content">
        {page === 'dashboard' && <Dashboard token={token} />}
        {page === 'users' && <UsersPage token={token} />}
        {page === 'centers' && <DispatchCentersPage token={token} />}
        {page === 'emergencies' && <EmergenciesPage token={token} />}
        {page === 'feedback' && <FeedbackPage token={token} />}
      </main>
    </div>
  );
}

export default App;
