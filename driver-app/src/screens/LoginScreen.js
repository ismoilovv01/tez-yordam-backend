import React, { useState } from 'react';
import '../styles/LoginScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function LoginScreen({ onLogin }) {
  const [phone, setPhone] = useState('');
  const [loginCode, setLoginCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async () => {
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 9) return setError('Telefon raqamini to\'liq kiriting');
    if (loginCode.length < 6) return setError('Kodni to\'liq kiriting');
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/driver-login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+998' + cleanPhone, login_code: loginCode.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato yuz berdi');
      onLogin(data.user, data.token, data.service_type);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e) => { if (e.key === 'Enter') handleLogin(); };

  return (
    <div className="dlogin-container">
      {/* Red hero */}
      <div className="dlogin-hero">
        <div className="dlogin-circle c1" />
        <div className="dlogin-circle c2" />
        <div className="dlogin-circle c3" />
        <div className="dlogin-hero-icon">👮</div>
        <h1 className="dlogin-hero-title">Haydovchi</h1>
        <p className="dlogin-hero-sub">XIZMAT KO'RSATISH TIZIMI</p>
      </div>

      {/* Form card */}
      <div className="dlogin-card">
        <h2 className="dlogin-form-title">Haydovchi kirishi</h2>
        <p className="dlogin-form-sub">Telefon raqam va login kodingizni kiriting</p>

        <label className="dlogin-label">Telefon raqam</label>
        <div className="dlogin-input-row">
          <span className="dlogin-prefix">+998</span>
          <input
            className="dlogin-input"
            type="tel"
            placeholder="90 123 45 67"
            value={phone}
            onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
            onKeyDown={handleKeyDown}
            maxLength={9}
            autoFocus
          />
        </div>

        <label className="dlogin-label" style={{ marginTop: 16 }}>Login kod</label>
        <p className="dlogin-hint">Admin tomonidan berilgan 8 xonali kod</p>
        <input
          className="dlogin-code-input"
          type="text"
          placeholder="XXXXXXXX"
          value={loginCode}
          onChange={(e) => setLoginCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
          onKeyDown={handleKeyDown}
          maxLength={8}
          autoCapitalize="characters"
        />

        {error && <div className="dlogin-error">⚠️ {error}</div>}

        <button className="dlogin-btn" onClick={handleLogin} disabled={loading}>
          {loading ? 'Yuklanmoqda...' : 'Kirish'}
        </button>
      </div>
    </div>
  );
}

export default LoginScreen;
