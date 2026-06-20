import React from 'react';
import { useLanguage } from '../LanguageContext';
import '../styles/EmergencyNumbersScreen.css';

function EmergencyNumbersScreen({ onBack }) {
  const { t } = useLanguage();

  const NUMBERS = [
    { icon: '🚑', name: t.enAmbulance, sub: t.enAmbulanceSub, num: '103',  color: '#e74c3c', bg: '#fff0ee' },
    { icon: '🛡️', name: t.enPolice,    sub: t.enPoliceSub,    num: '102',  color: '#1565c0', bg: '#eef4ff' },
    { icon: '🔥', name: t.enFire,      sub: t.enFireSub,      num: '101',  color: '#bf360c', bg: '#fff3ee' },
    { icon: '⚠️', name: t.enGas,      sub: t.enGasSub,       num: '104',  color: '#e65100', bg: '#fff8ee' },
    { icon: '🪖', name: t.enGuard,     sub: t.enGuardSub,     num: '117',  color: '#2e7d32', bg: '#eef8ef' },
    { icon: '🆘', name: t.enSos,       sub: t.enSosSub,       num: '1050', color: '#6a1b9a', bg: '#f5eeff' },
    { icon: '📞', name: t.enSingle,    sub: t.enSingleSub,    num: '112',  color: '#263238', bg: '#f0f4f8' },
  ];

  return (
    <div className="en-screen">
      <div className="en-header">
        <button className="en-back" onClick={onBack}>‹</button>
        <span className="en-title">📞 {t.emergencyNumbers}</span>
      </div>
      <p className="en-subtitle">{t.emergencyNumbersHint}</p>
      <div className="en-list">
        {NUMBERS.map(({ icon, name, sub, num, color, bg }) => (
          <a key={num} href={`tel:${num}`} className="en-card" style={{ background: bg, borderColor: color + '33' }}>
            <div className="en-icon-wrap" style={{ background: color + '22' }}>
              <span className="en-icon">{icon}</span>
            </div>
            <div className="en-info">
              <span className="en-name" style={{ color }}>{name}</span>
              <span className="en-sub">{sub}</span>
            </div>
            <span className="en-num" style={{ background: color }}>{num}</span>
          </a>
        ))}
      </div>
    </div>
  );
}

export default EmergencyNumbersScreen;
