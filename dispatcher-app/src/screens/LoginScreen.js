import React, { useState } from 'react';
import '../styles/LoginScreen.css';

function LoginScreen({ onLogin, loading, error }) {
  const [mode, setMode] = useState('code'); // 'code' | 'email'
  const [code, setCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    if (code.trim().length < 4) { setLocalError("Kodni to'liq kiriting"); return; }
    onLogin({ type: 'code', code: code.trim().toUpperCase() });
  };

  const handleEmailSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    if (!email || !password) { setLocalError('Email va parolni kiriting'); return; }
    onLogin({ type: 'email', email, password });
  };

  const displayError = error || localError;

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <div style={{ fontSize: 48, marginBottom: 8 }}>🚨</div>
          <h1 className="app-title">Tez Yordam</h1>
          <p className="app-subtitle">Dispetcher tizimi</p>
        </div>

        <div className="mode-tabs">
          <button
            type="button"
            className={`mode-tab ${mode === 'code' ? 'active' : ''}`}
            onClick={() => { setMode('code'); setLocalError(''); }}
          >
            🔑 Kod bilan kirish
          </button>
          <button
            type="button"
            className={`mode-tab ${mode === 'email' ? 'active' : ''}`}
            onClick={() => { setMode('email'); setLocalError(''); }}
          >
            📧 Email bilan kirish
          </button>
        </div>

        {mode === 'code' && (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <p className="form-description">
              Markaz administratori bergan kirish kodingizni kiriting
            </p>
            <div className="form-group">
              <label htmlFor="code">Kirish kodi</label>
              <input
                id="code"
                type="text"
                placeholder="AB1234"
                maxLength="8"
                value={code}
                onChange={(e) => { setCode(e.target.value.toUpperCase()); setLocalError(''); }}
                disabled={loading}
                autoFocus
                className="code-input"
                style={{ textAlign: 'center', fontSize: 24, letterSpacing: 6, fontWeight: 700 }}
              />
            </div>
            {displayError && <div className="error-message">{displayError}</div>}
            <button type="submit" className="btn-primary" disabled={loading || code.trim().length < 4}>
              {loading ? 'Tekshirilmoqda...' : 'Kirish'}
            </button>
          </form>
        )}

        {mode === 'email' && (
          <form onSubmit={handleEmailSubmit} className="login-form">
            <p className="form-description">
              Markaz administratori hisobi uchun
            </p>
            <div className="form-group">
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                placeholder="admin@markazingiz.uz"
                value={email}
                onChange={(e) => { setEmail(e.target.value); setLocalError(''); }}
                disabled={loading}
                autoFocus
              />
            </div>
            <div className="form-group">
              <label htmlFor="password">Parol</label>
              <input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => { setPassword(e.target.value); setLocalError(''); }}
                disabled={loading}
              />
            </div>
            {displayError && <div className="error-message">{displayError}</div>}
            <button type="submit" className="btn-primary" disabled={loading || !email || !password}>
              {loading ? 'Kirish...' : 'Kirish'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
