import React, { useState } from 'react';
import '../styles/LoginScreen.css';

function LoginScreen({ onLogin, loading }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState('phone');
  const [error, setError] = useState('');

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (!phone.match(/^\+?[0-9]{10,15}$/)) {
      setError('Telefon raqamini to\'g\'ri kiriting');
      return;
    }
    onLogin(phone, null);
    setStep('code');
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError('Kod 6 ta raqamdan iborat bo\'lishi kerak');
      return;
    }
    onLogin(phone, code);
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <div className="logo-icon">🔥</div>
          <h1 className="app-title">Yong'in</h1>
          <p className="app-subtitle">Dispetcher Markazi</p>
        </div>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="login-form">
            <h2>Kirish</h2>
            <p className="form-description">Telefon raqamingizni kiriting</p>
            <div className="form-group">
              <label htmlFor="phone">Telefon raqam</label>
              <input id="phone" type="tel" placeholder="+998901234567"
                value={phone} onChange={(e) => { setPhone(e.target.value); setError(''); }}
                disabled={loading} autoFocus />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading || !phone}>
              {loading ? 'Yuborilmoqda...' : 'Kod yuborish'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <h2>Kodni kiriting</h2>
            <p className="form-description">{phone} raqamiga kod yuborildi</p>
            <div className="form-group">
              <label htmlFor="code">Tasdiqlash kodi</label>
              <input id="code" type="text" placeholder="000000" maxLength="6"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/[^0-9]/g, '')); setError(''); }}
                disabled={loading} autoFocus className="code-input" />
            </div>
            {error && <div className="error-message">{error}</div>}
            <button type="submit" className="btn-primary" disabled={loading || code.length !== 6}>
              {loading ? 'Tekshirilmoqda...' : 'Kirish'}
            </button>
            <button type="button" className="btn-secondary"
              onClick={() => { setStep('phone'); setCode(''); setError(''); }} disabled={loading}>
              Orqaga
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
