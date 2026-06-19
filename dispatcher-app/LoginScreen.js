import React, { useState } from 'react';
import '../styles/LoginScreen.css';

function LoginScreen({ onLogin, loading }) {
  const \\\\\\\[phone, setPhone] = useState('');
  const \\\\\\\[code, setCode] = useState('');
  const \\\\\\\[step, setStep] = useState('phone');
  const \\\\\\\[error, setError] = useState('');

  const handlePhoneSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (!phone.match(/^\\\\\\\\+?\\\\\\\[0-9]{10,15}$/)) {
      setError('Please enter a valid phone number');
      return;
    }

    setStep('code');
  };

  const handleCodeSubmit = (e) => {
    e.preventDefault();
    setError('');

    if (code.length !== 6) {
      setError('Code must be 6 digits');
      return;
    }

    onLogin(phone, code);
  };

  const handleBackToPhone = () => {
    setStep('phone');
    setCode('');
    setError('');
  };

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="logo-section">
          <h1 className="app-title">Dispatcher</h1>
          <p className="app-subtitle">Tez Yordam Control Center</p>
        </div>

        {step === 'phone' \\\\\\\&\\\\\\\& (
          <form onSubmit={handlePhoneSubmit} className="login-form">
            <h2>Dispatcher Login</h2>
            <p className="form-description">Enter your phone number</p>

            <div className="form-group">
              <label htmlFor="phone">Phone Number</label>
              <input
                id="phone"
                type="tel"
                placeholder="+998 (99) 123-45-67"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  setError('');
                }}
                disabled={loading}
                autoFocus
              />
            </div>

            {error \\\\\\\&\\\\\\\& <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || !phone}
            >
              {loading ? 'Sending code...' : 'Send Code'}
            </button>
          </form>
        )}

        {step === 'code' \\\\\\\&\\\\\\\& (
          <form onSubmit={handleCodeSubmit} className="login-form">
            <h2>Verify Code</h2>
            <p className="form-description">
              Enter the 6-digit code sent to <strong>{phone}</strong>
            </p>

            <div className="form-group">
              <label htmlFor="code">Verification Code</label>
              <input
                id="code"
                type="text"
                placeholder="000000"
                maxLength="6"
                value={code}
                onChange={(e) => {
                  const val = e.target.value.replace(/\\\\\\\[^0-9]/g, '');
                  setCode(val);
                  setError('');
                }}
                disabled={loading}
                autoFocus
                className="code-input"
              />
              <small className="hint">Check backend console for code</small>
            </div>

            {error \\\\\\\&\\\\\\\& <div className="error-message">{error}</div>}

            <button
              type="submit"
              className="btn-primary"
              disabled={loading || code.length !== 6}
            >
              {loading ? 'Verifying...' : 'Verify \\\\\\\& Login'}
            </button>

            <button
              type="button"
              className="btn-secondary"
              onClick={handleBackToPhone}
              disabled={loading}
            >
              Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
