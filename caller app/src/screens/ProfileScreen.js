import React, { useState, useEffect } from 'react';
import '../styles/ProfileScreen.css';
import { useLanguage, LANGUAGES } from '../LanguageContext';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function ProfileScreen({ user, token, onBack, onLogout, onNotifications, onFeedback }) {
  const { t, lang, setLanguage } = useLanguage();
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
  const [soundOn, setSoundOn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => { fetchUser(); }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
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

  const showSuccess = (msg) => { setSuccess(msg); setTimeout(() => setSuccess(''), 3000); };

  const handleSaveName = async () => {
    if (!firstName.trim() || !lastName.trim()) return setError(`${t.firstName} ${t.lastName}`);
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
      showSuccess(t.nameSaved);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleSaveEmail = async () => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return setError("Invalid email format");
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
      showSuccess('Email saved');
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const handleChangePassword = async () => {
    if (!userData?.email) { setChangePassModal(false); setTimeout(() => setEditEmailModal(true), 100); return; }
    if (newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) return setError("Passwords do not match");
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
      showSuccess('Password updated');
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const fullName = [userData?.first_name, userData?.last_name].filter(Boolean).join(' ') || t.roleCaller;
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
              {saving ? '...' : (saveLabel || t.save)}
            </button>
          )}
          <button className="profile-modal-btn-ghost" onClick={onClose}>{t.cancel}</button>
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
        <p className="profile-section-title">{t.account.toUpperCase()}</p>

        <div className="profile-card" onClick={() => { setError(''); setEditNameModal(true); }}>
          <span className="profile-card-icon">👤</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{fullName}</p>
            <p className="profile-card-label">{t.fullName} • {t.edit}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <div className="profile-card">
          <span className="profile-card-icon">📱</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{phone}</p>
            <p className="profile-card-label">{t.phone}</p>
          </div>
        </div>

        <div className="profile-card" onClick={() => { setError(''); setEditEmailModal(true); }}>
          <span className="profile-card-icon">📧</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{userEmail || t.email}</p>
            <p className="profile-card-label">{t.email} • {t.edit}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <div className="profile-card" onClick={onNotifications} style={{ cursor: 'pointer' }}>
          <span className="profile-card-icon">📋</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{t.callHistory}</p>
            <p className="profile-card-label">{t.viewAllCalls}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <p className="profile-section-title">{t.feedback.toUpperCase()}</p>

        <div className="profile-card" onClick={onFeedback} style={{ cursor: 'pointer' }}>
          <span className="profile-card-icon">⭐</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{t.feedback}</p>
            <p className="profile-card-label">{t.feedbackSub}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <p className="profile-section-title">{t.settings.toUpperCase()}</p>

        <div className="profile-card" onClick={() => setSettingsModal(true)}>
          <span className="profile-card-icon">⚙️</span>
          <div className="profile-card-info">
            <p className="profile-card-value">{t.settings}</p>
            <p className="profile-card-label">{t.settingsSub}</p>
          </div>
          <span className="profile-card-arrow">›</span>
        </div>

        <div className="profile-card">
          <span className="profile-card-icon">ℹ️</span>
          <div className="profile-card-info">
            <p className="profile-card-value">Help Mee v1.0.0</p>
            <p className="profile-card-label">{t.version}</p>
          </div>
        </div>

        <div className="profile-card logout" onClick={onLogout}>
          <span className="profile-card-icon">🚪</span>
          <div className="profile-card-info">
            <p className="profile-card-value logout-text">{t.logout}</p>
          </div>
        </div>
      </div>

      <div className="profile-bottom-nav">
        <button className="profile-nav-btn" onClick={onBack}>
          <span>🏠</span>
          <span className="profile-nav-label">{t.welcome.replace('!','')}</span>
        </button>
        <button className="profile-nav-btn active">
          <span>👤</span>
          <span className="profile-nav-label active">{t.account}</span>
        </button>
      </div>

      {/* Edit Name Modal */}
      <Modal visible={editNameModal} onClose={() => setEditNameModal(false)} title={t.editName} onSave={handleSaveName}>
        <input className="profile-modal-input" placeholder={t.firstName} value={firstName} onChange={e => setFirstName(e.target.value)} />
        <input className="profile-modal-input" placeholder={t.lastName} value={lastName} onChange={e => setLastName(e.target.value)} />
      </Modal>

      {/* Edit Email Modal */}
      <Modal visible={editEmailModal} onClose={() => setEditEmailModal(false)} title={t.email} onSave={handleSaveEmail}>
        <input className="profile-modal-input" placeholder="email@example.com" type="email" value={email} onChange={e => setEmail(e.target.value)} />
      </Modal>

      {/* Change Password Modal */}
      <Modal visible={changePassModal} onClose={() => setChangePassModal(false)} title="🔑 Password"
        onSave={userData?.email ? handleChangePassword : null} saveLabel={t.save}>
        {!userData?.email ? (
          <>
            <p style={{ color: '#888', fontSize: 14, marginBottom: 16 }}>Please add email first.</p>
            <button className="profile-modal-btn" onClick={() => { setChangePassModal(false); setTimeout(() => setEditEmailModal(true), 100); }}>
              {t.email}
            </button>
          </>
        ) : (
          <>
            <input className="profile-modal-input" placeholder="Current password" type="password" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
            <input className="profile-modal-input" placeholder="New password (min 8)" type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} />
            <input className="profile-modal-input" placeholder="Confirm new password" type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} />
          </>
        )}
      </Modal>

      {/* Settings Modal */}
      {settingsModal && (
        <div className="profile-modal-overlay" onClick={() => setSettingsModal(false)}>
          <div className="profile-modal" onClick={e => e.stopPropagation()}>
            <h3 className="profile-modal-title">⚙️ {t.settingsTitle}</h3>
            <div className="profile-setting-row">
              <span>🔔 {t.soundNotif}</span>
              <label className="profile-toggle">
                <input type="checkbox" checked={soundOn} onChange={e => setSoundOn(e.target.checked)} />
                <span className="profile-toggle-slider" />
              </label>
            </div>
            <div style={{ paddingTop: 14 }}>
              <p style={{ fontSize: 14, marginBottom: 10 }}>🌐 {t.language}</p>
              <div style={{ display: 'flex', gap: 8 }}>
                {LANGUAGES.map(l => (
                  <button key={l.code} onClick={() => setLanguage(l.code)}
                    style={{
                      flex: 1, padding: '10px 4px', borderRadius: 12, border: `2px solid ${lang === l.code ? '#4fc3f7' : '#ddd'}`,
                      background: lang === l.code ? '#4fc3f7' : '#f5f5f5',
                      color: lang === l.code ? '#fff' : '#333', fontWeight: 600, cursor: 'pointer', fontSize: 12,
                    }}>
                    <div style={{ fontSize: 18 }}>{l.flag}</div>
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <button className="profile-modal-btn" style={{ marginTop: 16 }} onClick={() => setSettingsModal(false)}>{t.save}</button>
          </div>
        </div>
      )}
    </div>
  );
}

export default ProfileScreen;
