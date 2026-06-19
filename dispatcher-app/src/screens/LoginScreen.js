import React, { useState } from 'react';

const styles = {
  container: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'linear-gradient(135deg, #0f172a 0%, #1e3a5f 50%, #0f766e 100%)', padding: 16 },
  card: { background: '#fff', borderRadius: 24, padding: '36px 32px', width: '100%', maxWidth: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.4)' },
  logo: { textAlign: 'center', marginBottom: 28 },
  logoIcon: { fontSize: 52, display: 'block', marginBottom: 8 },
  title: { fontSize: 26, fontWeight: 800, color: '#0f172a', margin: 0 },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 4 },
  roleRow: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 28 },
  roleBtn: (active, color) => ({
    padding: '18px 10px', border: `2px solid ${active ? color : '#e2e8f0'}`, borderRadius: 14,
    background: active ? color : '#f8fafc', color: active ? '#fff' : '#374151',
    cursor: 'pointer', textAlign: 'center', transition: 'all 0.15s', fontWeight: active ? 700 : 500,
    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6
  }),
  roleIcon: { fontSize: 28 },
  roleLabel: { fontSize: 13 },
  label: { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 },
  phoneRow: { display: 'flex', alignItems: 'center', border: '1.5px solid #e2e8f0', borderRadius: 10, marginBottom: 14, overflow: 'hidden' },
  prefix: { padding: '12px 10px 12px 14px', background: '#f1f5f9', color: '#374151', fontSize: 15, fontWeight: 700, borderRight: '1.5px solid #e2e8f0', whiteSpace: 'nowrap' },
  input: { flex: 1, padding: '12px 14px', border: 'none', fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  codeInput: { width: '100%', padding: '14px', border: '2px solid #e2e8f0', borderRadius: 10, fontSize: 28, fontWeight: 800, letterSpacing: 8, textAlign: 'center', outline: 'none', boxSizing: 'border-box', marginBottom: 14, textTransform: 'uppercase' },
  btn: (disabled, color) => ({
    width: '100%', padding: '14px', border: 'none', borderRadius: 10,
    background: disabled ? '#94a3b8' : color, color: '#fff',
    fontSize: 16, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer', transition: 'all 0.15s'
  }),
  error: { background: '#fee2e2', color: '#991b1b', padding: '10px 14px', borderRadius: 8, fontSize: 13, marginBottom: 14, textAlign: 'center' },
  backBtn: { background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: 13, marginBottom: 20, display: 'flex', alignItems: 'center', gap: 4 },
};

function LoginScreen({ onLogin, loading, error }) {
  const [role, setRole] = useState(null); // null | 'center_admin' | 'dispatcher'
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [localError, setLocalError] = useState('');

  const displayError = error || localError;

  const handleSubmit = (e) => {
    e.preventDefault();
    setLocalError('');
    if (!phone.trim()) { setLocalError("Telefon raqamni kiriting"); return; }
    if (code.trim().length < 4) { setLocalError("Kodni to'liq kiriting"); return; }
    onLogin({ phone: '+998' + phone.trim().replace(/^\+?998/, ''), code: code.trim().toUpperCase(), role });
  };

  const handleBack = () => { setRole(null); setPhone(''); setCode(''); setLocalError(''); };

  const color = role === 'center_admin' ? '#0f766e' : '#1e3a5f';

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <div style={styles.logo}>
          <span style={styles.logoIcon}>🚨</span>
          <h1 style={styles.title}>Tez Yordam</h1>
          <p style={styles.subtitle}>Dispetcher boshqaruv tizimi</p>
        </div>

        {!role ? (
          <>
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: 14, marginBottom: 20 }}>Kimligingizni tanlang</p>
            <div style={styles.roleRow}>
              <button style={styles.roleBtn(false, '#0f766e')} onClick={() => setRole('center_admin')}>
                <span style={styles.roleIcon}>🏢</span>
                <span style={styles.roleLabel}>Markaz Admin</span>
              </button>
              <button style={styles.roleBtn(false, '#1e3a5f')} onClick={() => setRole('dispatcher')}>
                <span style={styles.roleIcon}>🖥️</span>
                <span style={styles.roleLabel}>Dispetcher</span>
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={handleSubmit}>
            <button type="button" onClick={handleBack} style={styles.backBtn}>← Orqaga</button>

            <div style={{ ...styles.roleBtn(true, color), flexDirection: 'row', marginBottom: 20, padding: '12px 16px', cursor: 'default' }}>
              <span style={{ fontSize: 22 }}>{role === 'center_admin' ? '🏢' : '🖥️'}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>{role === 'center_admin' ? 'Markaz Admin' : 'Dispetcher'}</span>
            </div>

            <label style={styles.label}>📱 Telefon raqam</label>
            <div style={styles.phoneRow}>
              <span style={styles.prefix}>+998</span>
              <input
                type="tel"
                value={phone}
                onChange={e => { setPhone(e.target.value.replace(/^\+?998/, '')); setLocalError(''); }}
                placeholder="901234567"
                style={styles.input}
                disabled={loading}
                autoFocus
                maxLength={9}
              />
            </div>

            <label style={styles.label}>🔑 {role === 'center_admin' ? 'Super admin bergan kod' : 'Markaz admin bergan kod'}</label>
            <input
              type="text"
              value={code}
              onChange={e => { setCode(e.target.value.toUpperCase()); setLocalError(''); }}
              placeholder="AB1234"
              maxLength={8}
              style={styles.codeInput}
              disabled={loading}
            />

            {displayError && <div style={styles.error}>{displayError}</div>}

            <button type="submit" disabled={loading || !phone.trim() || code.trim().length < 4} style={styles.btn(loading || !phone.trim() || code.trim().length < 4, color)}>
              {loading ? 'Tekshirilmoqda...' : 'Kirish'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

export default LoginScreen;
