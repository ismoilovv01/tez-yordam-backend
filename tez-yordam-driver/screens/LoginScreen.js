import React, { useState } from 'react';
function LoginScreen({ step, pendingPhone, onSendCode, onVerifyCode, onBack, loading }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState('');

  const fullPhone = '+998' + phone.replace(/\D/g, '');

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (phone.replace(/\D/g, '').length < 9) {
      setError("To'liq telefon raqam kiriting");
      return;
    }
    onSendCode(fullPhone);
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    setError('');
    if (code.length !== 6) {
      setError("Kod 6 ta raqamdan iborat bo'lishi kerak");
      return;
    }
    onVerifyCode(code);
  };

  const handleBack = () => {
    setCode('');
    setError('');
    onBack();
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <h1 className="app-title">Dispatcher</h1>
          <p className="app-subtitle">Tez Yordam Control Center</p>
        </div>

        {step === 'phone' && (
          <form onSubmit={handlePhoneSubmit} className="login-form">
            <h2>Dispetcher kirishi</h2>
            <p className="form-description">Telefon raqamingizni kiriting</p>
            <div className="form-group">
              <label htmlFor="phone">Telefon raqam</label>
              <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1.5px solid #ddd' }}>
                <div style={{ background: '#f9f9f9', padding: '12px 14px', color: '#555', fontWeight: '600', fontSize: 15, borderRight: '1px solid #ddd', whiteSpace: 'nowrap' }}>
                  +998
                </div>
                <input
                  id="phone"
                  type="tel"
                  placeholder="90 123 45 67"
                  value={phone}
                  onChange={(e) => { setPhone(e.target.value.replace(/\D/g, '')); setError(''); }}
                  disabled={loading}
                  autoFocus
                  maxLength={9}
                  style={{ flex: 1, border: 'none', outline: 'none', padding: '12px 14px', fontSize: 15 }}
                />
              </div>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || phone.replace(/\D/g, '').length < 9}
            >
              {loading ? 'Yuborilmoqda...' : 'Kod yuborish'}
            </button>
          </form>
        )}

        {step === 'code' && (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <h2>Kodni tasdiqlash</h2>
            <p className="form-description">
              <strong>{pendingPhone}</strong> raqamiga yuborilgan 6 xonali kodni kiriting
            </p>
            <div className="form-group">
              <label htmlFor="code">Tasdiqlash kodi</label>
              <input
                id="code"
                type="text"
                placeholder="000000"
                maxLength="6"
                value={code}
                onChange={(e) => { setCode(e.target.value.replace(/[^0-9]/g, '')); setError(''); }}
                disabled={loading}
                autoFocus
                className="code-input"
              />
              <small className="hint">Railway loglardan kodni ko'ring</small>
            </div>
            {error && <div className="error-message">{error}</div>}
            <button
              type="submit"
              className="btn-primary"
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Tekshirilmoqda...' : 'Kirish'}
            </button>
            <button
              type="button"
              className="btn-secondary"
              onClick={handleBack}
              disabled={loading}
            >
              Orqaga
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
