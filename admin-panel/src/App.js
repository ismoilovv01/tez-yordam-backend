import React, { useState, useEffect, useCallback } from 'react';
import './App.css';

const API = 'https://tez-yordam-backend-production.up.railway.app';

function api(path, token, opts = {}) {
  return fetch(`${API}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(opts.headers || {}) },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  }).then(async (r) => {
    const d = await r.json();
    if (!r.ok) throw new Error(d.error || 'Server error');
    return d;
  });
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
      const data = await fetch(`${API}/api/auth/email-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw new Error(d.error || 'Login failed');
        return d;
      });
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
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="admin@helpmee.uz" required autoFocus />
          </div>
          <div className="field">
            <label>Parol</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" required />
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

  useEffect(() => {
    api('/api/admin-panel/overview', token)
      .then(setData)
      .catch((e) => setError(e.message));
  }, [token]);

  if (error) return <div className="error-box">{error}</div>;
  if (!data) return <div className="loading">Yuklanmoqda...</div>;

  const usersByType = Object.fromEntries(data.users_by_type.map((r) => [r.user_type, r.count]));
  const byStatus = Object.fromEntries(data.emergencies_by_status.map((r) => [r.status, r.count]));
  const byService = Object.fromEntries(data.emergencies_by_service.map((r) => [r.service_type, r.count]));
  const unitsByStatus = Object.fromEntries(data.units_by_status.map((r) => [r.status, r.count]));

  return (
    <div>
      <h2 className="page-title">Dashboard</h2>

      <div className="stat-grid">
        <StatCard icon="👥" label="Foydalanuvchilar" value={data.users_by_type.reduce((s, r) => s + parseInt(r.count), 0)} color="blue" />
        <StatCard icon="🚨" label="Jami chaqiriqlar" value={data.emergencies_by_status.reduce((s, r) => s + parseInt(r.count), 0)} color="red" />
        <StatCard icon="🏢" label="Dispatch markazlari" value={data.dispatch_centers_count} color="purple" />
        <StatCard icon="🚑" label="Faol birliklar" value={unitsByStatus['available'] || 0} color="green" />
      </div>

      <div className="dashboard-row">
        <div className="card">
          <h3>Foydalanuvchilar (tizim)</h3>
          <table className="mini-table">
            <tbody>
              {[['caller', 'Chaqiruvchilar', '📞'], ['dispatcher', 'Dispetcherlar', '🖥️'], ['admin', 'Adminlar', '🛡️']].map(([type, label, icon]) => (
                <tr key={type}><td>{icon} {label}</td><td><strong>{usersByType[type] || 0}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Chaqiriqlar holati</h3>
          <table className="mini-table">
            <tbody>
              {[['new', 'Yangi', '#f59e0b'], ['confirmed', 'Tasdiqlangan', '#3b82f6'], ['dispatched', 'Jo\'natilgan', '#8b5cf6'], ['completed', 'Yakunlangan', '#10b981'], ['cancelled', 'Bekor', '#ef4444']].map(([s, label, color]) => (
                <tr key={s}><td><span className="dot" style={{ background: color }} />{label}</td><td><strong>{byStatus[s] || 0}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="card">
          <h3>Xizmat turi bo'yicha</h3>
          <table className="mini-table">
            <tbody>
              {[['ambulance', 'Tez yordam', '🚑'], ['police', 'Politsiya', '🚔'], ['firefighter', 'O\'t o\'chiruvchi', '🚒']].map(([s, label, icon]) => (
                <tr key={s}><td>{icon} {label}</td><td><strong>{byService[s] || 0}</strong></td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <h3>So'nggi chaqiriqlar</h3>
        <table className="data-table">
          <thead><tr><th>ID</th><th>Xizmat</th><th>Holat</th><th>Vaqt</th></tr></thead>
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

// ─── Users ────────────────────────────────────────────────────────────────────
function UsersPage({ token }) {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    const q = filter ? `?user_type=${filter}` : '';
    api(`/api/admin-panel/users${q}`, token)
      .then((d) => { setUsers(d.users); setLoading(false); })
      .catch((e) => { setError(e.message); setLoading(false); });
  }, [token, filter]);

  useEffect(() => { load(); }, [load]);

  const toggleBlock = async (user) => {
    try {
      await api(`/api/admin-panel/users/${user.id}`, token, { method: 'PATCH', body: { blocked: !user.blocked } });
      load();
    } catch (e) { alert(e.message); }
  };

  const deleteUser = async (user) => {
    if (!window.confirm(`${user.first_name} ${user.last_name} ni o'chirasizmi?`)) return;
    try {
      await api(`/api/admin-panel/users/${user.id}`, token, { method: 'DELETE' });
      load();
    } catch (e) { alert(e.message); }
  };

  return (
    <div>
      <h2 className="page-title">Foydalanuvchilar</h2>
      <div className="toolbar">
        <div className="filter-tabs">
          {[['', 'Barchasi'], ['caller', 'Chaqiruvchilar'], ['dispatcher', 'Dispetcherlar'], ['admin', 'Adminlar']].map(([v, l]) => (
            <button key={v} className={`tab ${filter === v ? 'active' : ''}`} onClick={() => setFilter(v)}>{l}</button>
          ))}
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <table className="data-table">
            <thead>
              <tr><th>Ism</th><th>Email / Telefon</th><th>Tur</th><th>Markaz</th><th>Holat</th><th>Amallar</th></tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className={u.blocked ? 'row-blocked' : ''}>
                  <td><strong>{u.first_name} {u.last_name}</strong><br /><small>#{u.id}</small></td>
                  <td>{u.email || '—'}<br /><small>{u.phone || '—'}</small></td>
                  <td><RoleBadge role={u.user_type} /></td>
                  <td>{u.dispatch_center_name || '—'}</td>
                  <td>{u.blocked ? <span className="badge badge-red">Bloklangan</span> : <span className="badge badge-green">Faol</span>}</td>
                  <td>
                    <div className="action-row">
                      <button className={`btn-sm ${u.blocked ? 'btn-success' : 'btn-warn'}`} onClick={() => toggleBlock(u)}>
                        {u.blocked ? 'Blokdan chiqar' : 'Blokla'}
                      </button>
                      <button className="btn-sm btn-danger" onClick={() => deleteUser(u)}>O'chir</button>
                    </div>
                  </td>
                </tr>
              ))}
              {!users.length && <tr><td colSpan={6} className="empty-cell">Foydalanuvchilar topilmadi</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Dispatch Centers ─────────────────────────────────────────────────────────
function DispatchCentersPage({ token }) {
  const [centers, setCenters] = useState([]);
  const [modal, setModal] = useState(null); // null | 'add' | center object
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ name: '', city: '', service_type: 'ambulance', phone: '', email: '', latitude: '', longitude: '' });

  const load = useCallback(() => {
    setLoading(true);
    api('/api/admin-panel/dispatch-centers', token)
      .then((d) => { setCenters(d.dispatch_centers); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => { setForm({ name: '', city: '', service_type: 'ambulance', phone: '', email: '', latitude: '', longitude: '' }); setModal('add'); };
  const openEdit = (c) => { setForm({ name: c.name, city: c.city, service_type: c.service_type, phone: c.phone || '', email: c.email || '', latitude: c.latitude || '', longitude: c.longitude || '' }); setModal(c); };

  const handleSave = async (e) => {
    e.preventDefault();
    try {
      if (modal === 'add') {
        await api('/api/admin-panel/dispatch-centers', token, { method: 'POST', body: form });
      } else {
        await api(`/api/admin-panel/dispatch-centers/${modal.id}`, token, { method: 'PATCH', body: form });
      }
      setModal(null);
      load();
    } catch (err) { alert(err.message); }
  };

  const handleDelete = async (c) => {
    if (!window.confirm(`"${c.name}" ni o'chirasizmi?`)) return;
    try { await api(`/api/admin-panel/dispatch-centers/${c.id}`, token, { method: 'DELETE' }); load(); }
    catch (err) { alert(err.message); }
  };

  return (
    <div>
      <h2 className="page-title">Dispatch Markazlari</h2>
      <div className="toolbar">
        <button className="btn-primary" onClick={openAdd}>+ Markaz qo'shish</button>
      </div>
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Nomi</th><th>Shahar</th><th>Xizmat</th><th>Dispetcherlar</th><th>Birliklar</th><th>Amallar</th></tr></thead>
            <tbody>
              {centers.map((c) => (
                <tr key={c.id}>
                  <td><strong>{c.name}</strong><br /><small>#{c.id}</small></td>
                  <td>{c.city}</td>
                  <td><ServiceBadge type={c.service_type} /></td>
                  <td>{c.dispatcher_count}</td>
                  <td>{c.unit_count}</td>
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
      )}

      {modal && (
        <Modal title={modal === 'add' ? 'Markaz qo\'shish' : 'Tahrirlash'} onClose={() => setModal(null)}>
          <form onSubmit={handleSave}>
            <div className="field"><label>Nomi *</label><input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required /></div>
            <div className="field"><label>Shahar *</label><input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} required /></div>
            <div className="field">
              <label>Xizmat turi *</label>
              <select value={form.service_type} onChange={(e) => setForm({ ...form, service_type: e.target.value })}>
                <option value="ambulance">Tez yordam</option>
                <option value="police">Politsiya</option>
                <option value="firefighter">O't o'chiruvchi</option>
              </select>
            </div>
            <div className="field"><label>Telefon</label><input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field-row">
              <div className="field"><label>Kenglik</label><input type="number" step="any" value={form.latitude} onChange={(e) => setForm({ ...form, latitude: e.target.value })} /></div>
              <div className="field"><label>Uzunlik</label><input type="number" step="any" value={form.longitude} onChange={(e) => setForm({ ...form, longitude: e.target.value })} /></div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>Bekor</button>
              <button type="submit" className="btn-primary">Saqlash</button>
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

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (serviceType) params.set('service_type', serviceType);
    api(`/api/admin-panel/emergencies?${params}`, token)
      .then((d) => { setEmergencies(d.emergencies); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token, status, serviceType]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h2 className="page-title">Chaqiriqlar</h2>
      <div className="toolbar">
        <div className="filter-tabs">
          {[['', 'Barchasi'], ['new', 'Yangi'], ['confirmed', 'Tasdiqlangan'], ['dispatched', 'Jo\'natilgan'], ['completed', 'Yakunlangan'], ['cancelled', 'Bekor']].map(([v, l]) => (
            <button key={v} className={`tab ${status === v ? 'active' : ''}`} onClick={() => setStatus(v)}>{l}</button>
          ))}
        </div>
        <div className="filter-tabs" style={{ marginTop: 8 }}>
          {[['', 'Barchasi'], ['ambulance', 'Tez yordam'], ['police', 'Politsiya'], ['firefighter', 'O\'t o\'chiruvchi']].map(([v, l]) => (
            <button key={v} className={`tab tab-sm ${serviceType === v ? 'active' : ''}`} onClick={() => setServiceType(v)}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Chaqiruvchi</th><th>Xizmat</th><th>Holat</th><th>Markaz</th><th>Vaqt</th></tr></thead>
            <tbody>
              {emergencies.map((e) => (
                <tr key={e.id}>
                  <td>#{e.id}</td>
                  <td>{e.first_name ? `${e.first_name} ${e.last_name}` : '—'}<br /><small>{e.caller_phone || '—'}</small></td>
                  <td><ServiceBadge type={e.service_type} /></td>
                  <td><StatusBadge status={e.status} /></td>
                  <td>{e.dispatch_center_name || '—'}</td>
                  <td>{new Date(e.created_at).toLocaleString('uz-UZ')}</td>
                </tr>
              ))}
              {!emergencies.length && <tr><td colSpan={6} className="empty-cell">Chaqiriqlar topilmadi</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Feedback ─────────────────────────────────────────────────────────────────
function FeedbackPage({ token }) {
  const [feedback, setFeedback] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    api('/api/admin-panel/feedback', token)
      .then((d) => { setFeedback(d.feedback); setLoading(false); })
      .catch(() => setLoading(false));
  }, [token]);

  const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);

  return (
    <div>
      <h2 className="page-title">Fikr-mulohazalar</h2>
      {loading ? <div className="loading">Yuklanmoqda...</div> : (
        <div className="card">
          <table className="data-table">
            <thead><tr><th>Foydalanuvchi</th><th>Reyting</th><th>Xabar</th><th>Tur</th><th>Vaqt</th></tr></thead>
            <tbody>
              {feedback.map((f) => (
                <tr key={f.id}>
                  <td>{f.first_name ? `${f.first_name} ${f.last_name}` : '—'}<br /><small>{f.phone || '—'}</small></td>
                  <td><span className="stars">{f.rating ? stars(f.rating) : '—'}</span></td>
                  <td>{f.message || '—'}</td>
                  <td>{f.type}</td>
                  <td>{new Date(f.created_at).toLocaleString('uz-UZ')}</td>
                </tr>
              ))}
              {!feedback.length && <tr><td colSpan={5} className="empty-cell">Fikr-mulohazalar topilmadi</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Shared components ────────────────────────────────────────────────────────
function Modal({ title, onClose, children }) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header"><h3>{title}</h3><button className="modal-close" onClick={onClose}>✕</button></div>
        {children}
      </div>
    </div>
  );
}

function ServiceBadge({ type }) {
  const map = { ambulance: ['🚑', 'badge-red', 'Tez yordam'], police: ['🚔', 'badge-blue', 'Politsiya'], firefighter: ['🚒', 'badge-orange', 'O\'t o\'chiruvchi'] };
  const [icon, cls, label] = map[type] || ['?', '', type];
  return <span className={`badge ${cls}`}>{icon} {label}</span>;
}

function StatusBadge({ status }) {
  const map = { new: ['badge-yellow', 'Yangi'], confirmed: ['badge-blue', 'Tasdiqlangan'], dispatched: ['badge-purple', 'Jo\'natilgan'], completed: ['badge-green', 'Yakunlangan'], cancelled: ['badge-red', 'Bekor'] };
  const [cls, label] = map[status] || ['', status];
  return <span className={`badge ${cls}`}>{label}</span>;
}

function RoleBadge({ role }) {
  const map = { admin: ['badge-purple', 'Admin'], dispatcher: ['badge-blue', 'Dispetcher'], caller: ['badge-gray', 'Chaqiruvchi'] };
  const [cls, label] = map[role] || ['', role];
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
  const [token, setToken] = useState(localStorage.getItem('adminToken') || '');
  const [user, setUser] = useState(() => { try { return JSON.parse(localStorage.getItem('adminUser') || 'null'); } catch { return null; } });
  const [page, setPage] = useState('dashboard');

  const handleLogin = (t, u) => {
    setToken(t); setUser(u);
    localStorage.setItem('adminToken', t);
    localStorage.setItem('adminUser', JSON.stringify(u));
  };

  const handleLogout = () => {
    setToken(''); setUser(null);
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
            <button key={p.id} className={`nav-item ${page === p.id ? 'active' : ''}`} onClick={() => setPage(p.id)}>
              <span>{p.icon}</span><span>{p.label}</span>
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="user-info">{user?.first_name} {user?.last_name}<br /><small>Admin</small></div>
          <button className="btn-logout" onClick={handleLogout}>Chiqish</button>
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
