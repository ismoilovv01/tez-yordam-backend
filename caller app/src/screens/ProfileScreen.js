import React, { useState, useEffect } from 'react';
import '../styles/ProfileScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function ProfileScreen({ user, token, onBack, onLogout, onNotifications }) {
  const [userData, setUserData] = useState(user);
  const [callCount, setCallCount] = useState(0);

  const [editNameModal, setEditNameModal] = useState(false);
  const [editEmailModal, setEditEmailModal] = useState(false);
  const [changePassModal, setChangePassModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [darkMode, setDarkMode] = useState(false);
  const [soundOn, setSoundOn] = useState(true);
  const [language, setLanguage] = useState("O'zbek");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    fetchUser();
  }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setUserData(data);
        setCallCount(data.call_count || 0);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
        setEmail(data.email || '');
      }
    } catch {}
  };

  const showSuccess = (msg) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const handleSaveName = async () => {
    if (!firstName.trim() || !lastName.trim()) return setError('Ism va familiya kiriting');
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/update-profile`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      setUserData(prev => ({ ...prev, first_name: firstName.trim(), last_name: lastName.trim() }));
      setEditNameModal(false);
      showSuccess('Ism muvaffaqiyatli yangilandi');
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleSaveEmail = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return setError("Noto'g'ri email format");
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/update-email`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      setUserData(prev => ({ ...prev, email: email.trim().toLowerCase() }));
      setEditEmailModal(false);
      showSuccess('Email muvaffaqiyatli yangilandi');
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!userData?.email) {
      setChangePassModal(false);
      setTimeout(() => setEditEmailModal(true), 100);
      return;
    }
    if (newPassword.length < 8) return setError("Parol kamida 8 ta belgi bo'lishi kerak");
    if (newPassword !== confirmPassword) return setError("Parollar mos kelmadi");
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/change-password`, {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      setChangePassModal(false);
      setCurrentPassword(''); setNewPassword(''); setConfirmPassword('');
      showSuccess('Parol muvaffaqiyatli yangilandi');
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const fullName = [userData?.first_name, userData?.last_name].filter(Boolean).join(' ') || 'Foydalanuvchi';
  const phone = userData?.phone || '';
  const userEmail = userData?.email || '';

  const Modal = ({ visible, onClose, title, children, onSave, saveLabel }) => {
    if (!visible) return null;
    return (
      <div className="profile-modal-overlay" onClick={onClose}>
        <div className="profile-modal" onClick={e => e.stopPropagation()}>
          <h3 className="profile-modal-title">{title}</h3>
          {children}
          {error && <p className="profile-modal-error">⚠️ {error}</p>}
          {onSave && (
            <button className="profile-modal-btn" onClick={onSave} disabled={saving}>
              {saving ? 'Saqlanmoqda...' : (saveLabel || 'Saqlash')}
            </button>
          )}
          <button className="profile-modal-btn-ghost" onClick={onClose}>Bekor</button>
        </div>
      </div>
    );
  };

  return (
    <div className="profile-container">
      {success && <div className="profile-success-banner">✅ {success}</div>}

      <div className="profile-header">
        <div className="profile-avatar">👤</div>
        <h2 className="profile-name">{fullName}</h2>
        <p className="profile-phone">{phone}</p>
      </div>

      <div className="profile-content">
        <p className="profile-section-title">HISOB</p>

        <div className="profile-card" onClick={() => { setError(''); setEditNameModal(true); }}>
          <span className="profile-card-icon">👤</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{fullName}</p>
            <p className="profile-card-label">Ism Familiya • tahrirlash</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <div className="profile-card">
          <span className="profile-card-icon">📱</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{phone}</p>
            <p className="profile-card-label">Telefon raqam</p>
          </div>
        </div>

        <div className="profile-card" onClick={() => { setError(''); setEditEmailModal(true); }}>
          <span className="profile-card-icon">📧</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{userEmail || "Email qo'shish"}</p>
            <p className="profile-card-label">Email • {userEmail ? 'tahrirlash' : "qo'shish"}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <div className="profile-card" onClick={() => { setError(''); setChangePassModal(true); }}>
          <span className="profile-card-icon">🔑</span>
          <div className="profile-card-info">
            <p className="profile-card-value">Parolni o'zgartirish</p>
            <p className="profile-card-label">{userEmail ? 'Email parolini yangilash' : 'Avval email kiriting'}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <p className="profile-section-title">STATISTIKA</p>

        <div className="profile-card">
          <span className="profile-card-icon">🚑</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{callCount} ta chaqiruv</p>
            <p className="profile-card-label">Jami chaqiruvlar</p>
          </div>
        </div>

        <div className="profile-card" onClick={onNotifications} style={{ cursor: 'pointer' }}>
          <span className="profile-card-icon">📋</span>
          <div className="profile-card-info">
            <p className="profile-card-value">Chaqiruvlar tarixi</p>
            <p className="profile-card-label">Barcha chaqiruvlarni ko'rish</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <p className="profile-section-title">SOZLAMALAR</p>

        <div className="profile-card" onClick={() => setSettingsModal(true)}>
          <span className="profile-card-icon">⚙️</span>
          <div className="profile-card-info">
            <p className="profile-card-value">Ilova sozlamalari</p>
            <p className="profile-card-label">Tema, til, bildirishnoma</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <div className="profile-card">
          <span className="profile-card-icon">ℹ️</span>
          <div className="profile-card-info">
            <p className="profile-card-value">Tez Yordam v1.0.0</p>
            <p className="profile-card-label">Ilova versiyasi</p>
          </div>
        </div>

        <div className="profile-card logout" onClick={onLogout}>
          <span className="profile-card-icon">🚪</span>
          <div className="profile-card-info">
            <p className="profile-card-value logout-text">Chiqish</p>
          </div>
        </div>
      </div>

      <div className="profile-bottom-nav">
        <button className="profile-nav-btn" onClick={onBack}>
          <span>🏠</span>
          <span className="profile-nav-label">Asosiy</span>
        </button>
        <button className="profile-nav-btn active">
          <span>👤</span>
          <span className="profile-nav-label active">Profil</span>
        </button>
      </div>

      {/* Edit Name Modal */}
      <Modal visible={editNameModal} onClose={() => setEditNameModal(false)} title="Ismni tahrirlash" onSave={handleSaveName}>
        <input className="profile-modal-input" placeholder="Ismingiz" value={firstName} onChange={e => setFirstName(e.target.value)} />
        <input className="profile-modal-input" placeholder="Familiyangiz" value={lastName} onChange={e => setLastName(e.target.value)} />
      </Modal>

      {/* Edit Email Modal */}
      <Modal visible={editEmailModal} onClose={() => setEditEmailModal(false)}
        title={userEmail ? 'Emailni tahrirlash' : "Email qo'shish"} onSave={handleSaveEmail}>
        <input className="profile-modal-input" placeholder="email@example.com" type="email"
          value={email} onChange={e => setEmail(e.target.value)} />
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={changePassModal} onClose={() => setChangePassModal(false)} title="Parolni o'zgartirish"
        onSave={userData?.email ? handleChangePassword : null}
        saveLabel="Saqlash">
        {!userData?.email ? (
          <>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>Parol o'zgartirish uchun avval email kiriting.</p>
            <button className="profile-modal-btn" onClick={() => { setChangePassModal(false); setTimeout(() => setEditEmailModal(true), 100); }}>
              Email kiriting
            </button>
          </>
        ) : (
          <>
            <input className="profile-modal-input" placeholder="Hozirgi parol" type="password"
              value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            <input className="profile-modal-input" placeholder="Yangi parol (min 8 belgi)" type="password"
              value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <input className="profile-modal-input" placeholder="Yangi parolni tasdiqlang" type="password"
              value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </>
        )}
      </Modal>

      {/* Settings Modal */}
      {settingsModal && (
        <div className="profile-modal-overlay" onClick={() => setSettingsModal(false)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <h3 className="profile-modal-title">⚙️ Sozlamalar</h3>
            <div className="profile-setting-row">
              <span>🌙 Qorong'u tema</span>
              <label className="profile-toggle">
                <input type="checkbox" checked={darkMode} onChange={e => setDarkMode(e.target.checked)} />
                <span className="profile-toggle-slider" />
              </label>
            </div>
            <div className="profile-setting-row">
              <span>🔔 Ovozli bildirishnoma</span>
              <label className="profile-toggle">
                <input type="checkbox" checked={soundOn} onChange={e => setSoundOn(e.target.checked)} />
                <span className="profile-toggle-slider" />
              </label>
            </div>
            <div className="profile-setting-row">
              <span>🌐 Til</span>
              <button className="profile-lang-btn" onClick={() => setLanguage(language === "O'zbek" ? 'Русский' : "O'zbek")}>
                {language}
              </button>
            </div>
            <button className="profile-modal-btn" onClick={() => setSettingsModal(false)}>Yopish</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileScreen;
