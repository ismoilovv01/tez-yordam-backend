import React, { useState, useEffect, useRef } from 'react';
import '../styles/LoginScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const RESEND_SECONDS = 60;

function LoginScreen({ onLogin, onDriverLogin, onBack, role }) {
  const [tab, setTab] = useState('phone');
  const [step, setStep] = useState('input'); // input | code | profile | email-register | email-otp
  const [phone, setPhone] = useState('');
  const [emailPhone, setEmailPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [code, setCode] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [pendingRegisterData, setPendingRegisterData] = useState(null);
  const [secondsLeft, setSecondsLeft] = useState(0);

  // Driver login fields
  const [driverPhone, setDriverPhone] = useState('');
  const [driverCode, setDriverCode] = useState('');

  const timerRef = useRef(null);

  const isDriver = role === 'driver';

  // OTP resend countdown timer
  useEffect(() => {
    if (secondsLeft <= 0) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }
    timerRef.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s <= 1) {
          clearInterval(timerRef.current);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(timerRef.current);
  }, [secondsLeft > 0]);

  // ── DRIVER LOGIN (8-character code) ───────────────────────────────
  const handleDriverLogin = async () => {
    const cleanPhone = driverPhone.replace(/\D/g, '');
    if (cleanPhone.length < 9) return setError("Telefon raqamini to'liq kiriting");
    if (driverCode.length < 6) return setError("Kodni to'liq kiriting");
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/driver-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+998' + cleanPhone, login_code: driverCode.toUpperCase() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato yuz berdi');
      onDriverLogin(data.user, data.token, data.service_type);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── PHONE OTP LOGIN ──────────────────────────────────────────────
  const handleSendCode = async () => {
    const cleanPhone = phone.replace(/^\+?998/, '').trim();
    if (!cleanPhone) return setError('Telefon raqamini kiriting');
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/send-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+998' + cleanPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato yuz berdi');
      setStep('code');
      setCode('');
      setSecondsLeft(RESEND_SECONDS);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleVerifyCode = async (fn, ln) => {
    if (!code.trim()) return setError('Kodni kiriting');
    if (secondsLeft <= 0) return setError('Kod muddati tugadi, qaytadan yuboring');
    setLoading(true); setError('');
    try {
      const cleanPhone = phone.replace(/^\+?998/, '').trim();
      const body = { phone: '+998' + cleanPhone, code };
      if (fn && ln) { body.first_name = fn; body.last_name = ln; }
      const res = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Noto'g'ri kod");
      if (data.requires_profile) { setStep('profile'); setLoading(false); return; }
      onLogin(data.user, data.token);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleProfileSubmit = async () => {
    if (!firstName.trim() || !lastName.trim()) return setError("Ism va familiyangizni kiriting");
    await handleVerifyCode(firstName.trim(), lastName.trim());
  };

  // ── EMAIL LOGIN ──────────────────────────────────────────────────
  const handleEmailLogin = async () => {
    if (!email.trim() || !password.trim()) return setError("Email va parolni kiriting");
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/email-login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      onLogin(data.user, data.token);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── EMAIL REGISTER — Step 1: collect info, send OTP ────────────
  const handleEmailRegisterSubmit = async () => {
    const cleanPhone = emailPhone.replace(/^\+?998/, '').trim();
    if (!firstName.trim() || !lastName.trim()) return setError("Ism va familiyangizni kiriting");
    if (!cleanPhone) return setError("Telefon raqamini kiriting");
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) return setError("Noto'g'ri email format");
    if (password.length < 8) return setError("Parol kamida 8 ta belgi bo'lishi kerak");
    if (password !== confirmPassword) return setError("Parollar mos kelmadi");
    setLoading(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/send-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: '+998' + cleanPhone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'SMS yuborishda xato');
      setPendingRegisterData({ email, password, first_name: firstName.trim(), last_name: lastName.trim(), phone: '+998' + cleanPhone });
      setCode('');
      setSecondsLeft(RESEND_SECONDS);
      setStep('email-otp');
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  // ── EMAIL REGISTER — Step 2: verify OTP then create account ─────
  const handleEmailOtpVerify = async () => {
    if (!code.trim()) return setError('Kodni kiriting');
    if (!pendingRegisterData) return setError('Xato. Qaytadan urinib koring');
    if (secondsLeft <= 0) return setError('Kod muddati tugadi, qaytadan yuboring');
    setLoading(true); setError('');
    try {
      const otpRes = await fetch(`${API_URL}/api/auth/verify-code`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: pendingRegisterData.phone, code, skip_user_create: true }),
      });
      const otpData = await otpRes.json();
      if (!otpRes.ok) throw new Error(otpData.error || "Noto'g'ri kod");

      const regRes = await fetch(`${API_URL}/api/auth/email-register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pendingRegisterData),
      });
      const regData = await regRes.json();
      if (!regRes.ok) throw new Error(regData.error || "Ro'yxatdan o'tishda xato");
      onLogin(regData.user, regData.token);
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  };

  const handleKeyDown = (e, action) => { if (e.key === 'Enter') action(); };
  const switchTab = (t) => { setTab(t); setError(''); setStep('input'); };

  const resendLabel = (action) => {
    if (secondsLeft > 0) {
      const ss = secondsLeft < 10 ? `0${secondsLeft}` : secondsLeft;
      return <p className="login-timer-text">Qaytadan yuborish 0:{ss}</p>;
    }
    return (
      <button className="login-btn-resend" onClick={action} disabled={loading}>
        Qayta yuborish
      </button>
    );
  };

  // ── DRIVER LOGIN FORM ────────────────────────────────────────────
  if (isDriver) {
    return (
      <div className="login-container dlogin-variant">
        <div className="login-hero">
          <div className="login-pulse-ring" />
          <div className="login-pulse-ring delay1" />
          <div className="login-pulse-ring delay2" />
          {onBack && <button className="login-back-btn" onClick={onBack}>←</button>}
          <div className="login-ambulance-icon">👮</div>
          <h1 className="login-app-name">Haydovchi</h1>
        </div>

        <div className="login-form-card">
          <h2 className="login-form-title">Haydovchi kirishi</h2>
          <p className="login-form-sub">Telefon raqam va login kodingizni kiriting</p>

          <label className="dlogin-label">Telefon raqam</label>
          <div className="login-input-row">
            <span className="login-prefix">+998</span>
            <input
              className="login-input"
              type="tel"
              placeholder="90 123 45 67"
              value={driverPhone}
              onChange={(e) => setDriverPhone(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => handleKeyDown(e, handleDriverLogin)}
              maxLength={9}
              autoFocus
            />
          </div>

          <label className="dlogin-label" style={{ marginTop: 16 }}>Login kod</label>
          <p className="dlogin-hint">Admin tomonidan berilgan 8 xonali kod</p>
          <input
            className="login-input code-input"
            style={{ letterSpacing: 6, fontSize: 22 }}
            type="text"
            placeholder="XXXXXXXX"
            value={driverCode}
            onChange={(e) => setDriverCode(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
            onKeyDown={(e) => handleKeyDown(e, handleDriverLogin)}
            maxLength={8}
            autoCapitalize="characters"
          />

          {error && <p className="login-error">⚠️ {error}</p>}

          <button className="login-btn" onClick={handleDriverLogin} disabled={loading}>
            {loading ? 'Yuklanmoqda...' : 'Kirish'}
          </button>
        </div>
      </div>
    );
  }

  // ── CALLER LOGIN FORM ────────────────────────────────────────────
  return (
    <div className="login-container">
      <div className="login-hero">
        <div className="login-pulse-ring" />
        <div className="login-pulse-ring delay1" />
        <div className="login-pulse-ring delay2" />
        {onBack && <button className="login-back-btn" onClick={onBack}>←</button>}
        <div className="login-ambulance-icon">🚑</div>
        <h1 className="login-app-name">Help Mee</h1>
      </div>

      <div className="login-form-card">

        {/* ── PHONE LOGIN ── */}
        {step === 'input' && tab === 'phone' && (
          <>
            <div className="login-tabs">
              <button className={`login-tab ${tab === 'phone' ? 'active' : ''}`} onClick={() => switchTab('phone')}>📱 Telefon</button>
              <button className={`login-tab ${tab === 'email' ? 'active' : ''}`} onClick={() => switchTab('email')}>📧 Email</button>
            </div>
            <h2 className="login-form-title">Kirish</h2>
            <p className="login-form-sub">Telefon raqamingizni kiriting</p>
            <div className="login-input-row">
              <span className="login-prefix">+998</span>
              <input className="login-input" type="tel" placeholder="90 123 45 67"
                value={phone} onChange={(e) => setPhone(e.target.value.replace(/^\+?998/, ''))}
                onKeyDown={(e) => handleKeyDown(e, handleSendCode)} maxLength={13} autoFocus />
            </div>
            {error && <p className="login-error">⚠️ {error}</p>}
            <button className="login-btn" onClick={handleSendCode} disabled={loading}>
              {loading ? 'Yuklanmoqda...' : 'Kod yuborish'}
            </button>
            <button className="login-btn-back" onClick={() => setStep('email-register')}>
              Hisobingiz yo'qmi? Ro'yxatdan o'tish →
            </button>
          </>
        )}

        {/* ── EMAIL LOGIN ── */}
        {step === 'input' && tab === 'email' && (
          <>
            <div className="login-tabs">
              <button className={`login-tab ${tab === 'phone' ? 'active' : ''}`} onClick={() => switchTab('phone')}>📱 Telefon</button>
              <button className={`login-tab ${tab === 'email' ? 'active' : ''}`} onClick={() => switchTab('email')}>📧 Email</button>
            </div>
            <h2 className="login-form-title">Email bilan kirish</h2>
            <p className="login-form-sub">Email va parolingizni kiriting</p>
            <div className="login-input-row">
              <input className="login-input" type="email" placeholder="email@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleEmailLogin)} autoFocus />
            </div>
            <div className="login-input-row">
              <input className="login-input" type="password" placeholder="Parol"
                value={password} onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleEmailLogin)} />
            </div>
            {error && <p className="login-error">⚠️ {error}</p>}
            <button className="login-btn" onClick={handleEmailLogin} disabled={loading}>
              {loading ? 'Yuklanmoqda...' : 'Kirish'}
            </button>
            <button className="login-btn-back" onClick={() => setStep('email-register')}>
              Hisobingiz yo'qmi? Ro'yxatdan o'tish →
            </button>
          </>
        )}

        {/* ── EMAIL REGISTER FORM ── */}
        {step === 'email-register' && (
          <>
            <h2 className="login-form-title">Ro'yxatdan o'tish</h2>
            <p className="login-form-sub">Barcha maydonlarni to'ldiring</p>
            <div className="login-input-row">
              <input className="login-input" type="text" placeholder="Ismingiz"
                value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus />
            </div>
            <div className="login-input-row">
              <input className="login-input" type="text" placeholder="Familiyangiz"
                value={lastName} onChange={(e) => setLastName(e.target.value)} />
            </div>
            <div className="login-input-row">
              <span className="login-prefix">+998</span>
              <input className="login-input" type="tel" placeholder="90 123 45 67"
                value={emailPhone} onChange={(e) => setEmailPhone(e.target.value.replace(/^\+?998/, ''))}
                maxLength={13} />
            </div>
            <div className="login-input-row">
              <input className="login-input" type="email" placeholder="email@example.com"
                value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="login-input-row">
              <input className="login-input" type="password" placeholder="Parol (kamida 8 belgi)"
                value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <div className="login-input-row">
              <input className="login-input" type="password" placeholder="Parolni tasdiqlang"
                value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleEmailRegisterSubmit)} />
            </div>
            {error && <p className="login-error">⚠️ {error}</p>}
            <button className="login-btn" onClick={handleEmailRegisterSubmit} disabled={loading}>
              {loading ? 'SMS yuborilmoqda...' : 'Davom etish →'}
            </button>
            <button className="login-btn-back" onClick={() => { setStep('input'); setError(''); }}>
              ← Kirishga qaytish
            </button>
          </>
        )}

        {/* ── EMAIL OTP VERIFICATION ── */}
        {step === 'email-otp' && (
          <>
            <h2 className="login-form-title">SMS kodni kiriting</h2>
            <p className="login-form-sub">{pendingRegisterData?.phone} raqamiga yuborildi</p>
            <input className="login-input code-input" type="number" placeholder="------"
              value={code} onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, handleEmailOtpVerify)} maxLength={6} autoFocus />
            {error && <p className="login-error">⚠️ {error}</p>}
            <button className="login-btn" onClick={handleEmailOtpVerify} disabled={loading}>
              {loading ? 'Tekshirilmoqda...' : "✅ Ro'yxatdan o'tish"}
            </button>
            {resendLabel(handleEmailRegisterSubmit)}
            <button className="login-btn-back" onClick={() => { setStep('email-register'); setCode(''); setError(''); setSecondsLeft(0); }}>
              ← Orqaga
            </button>
          </>
        )}

        {/* ── PHONE OTP CODE ── */}
        {step === 'code' && (
          <>
            <h2 className="login-form-title">SMS kodni kiriting</h2>
            <p className="login-form-sub">+998{phone} raqamiga yuborildi</p>
            <input className="login-input code-input" type="number" placeholder="------"
              value={code} onChange={(e) => setCode(e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, () => handleVerifyCode())} maxLength={6} autoFocus />
            {error && <p className="login-error">⚠️ {error}</p>}
            <button className="login-btn" onClick={() => handleVerifyCode()} disabled={loading}>
              {loading ? 'Tekshirilmoqda...' : 'Davom etish'}
            </button>
            {resendLabel(handleSendCode)}
            <button className="login-btn-back" onClick={() => { setStep('input'); setCode(''); setError(''); setSecondsLeft(0); }}>
              ← Orqaga
            </button>
          </>
        )}

        {/* ── PROFILE (new phone users) ── */}
        {step === 'profile' && (
          <>
            <h2 className="login-form-title">Profilni to'ldiring</h2>
            <p className="login-form-sub">Bu ma'lumotlar faqat bir marta so'raladi 🙏</p>
            <div className="login-input-row" style={{ marginBottom: 12 }}>
              <input className="login-input" type="text" placeholder="Ismingiz"
                value={firstName} onChange={(e) => setFirstName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleProfileSubmit)} autoFocus />
            </div>
            <div className="login-input-row">
              <input className="login-input" type="text" placeholder="Familiyangiz"
                value={lastName} onChange={(e) => setLastName(e.target.value)}
                onKeyDown={(e) => handleKeyDown(e, handleProfileSubmit)} />
            </div>
            {error && <p className="login-error">⚠️ {error}</p>}
            <button className="login-btn" onClick={handleProfileSubmit} disabled={loading} style={{ marginTop: 8 }}>
              {loading ? 'Saqlanmoqda...' : "✅ Ro'yxatdan o'tish"}
            </button>
          </>
        )}

      </div>
    </div>
  );
}

export default LoginScreen;
