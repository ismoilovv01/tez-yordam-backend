import React from 'react';
import '../styles/EmergencyNumbersScreen.css';

const NUMBERS = [
  { icon: '🚑', name: 'Tez Yordam',       sub: 'Скорая помощь / Ambulance',          num: '103',  color: '#e74c3c', bg: '#fff0ee' },
  { icon: '🛡️', name: 'Politsiya',        sub: 'Полиция / Police',                   num: '102',  color: '#1565c0', bg: '#eef4ff' },
  { icon: '🔥', name: "Yong'in xizmati",  sub: 'Пожарная служба / Fire Department',  num: '101',  color: '#bf360c', bg: '#fff3ee' },
  { icon: '⚠️', name: 'Gaz xizmati',     sub: 'Газовая служба / Gas Service',       num: '104',  color: '#e65100', bg: '#fff8ee' },
  { icon: '🪖', name: 'Milliy gvardiya',  sub: 'Нацгвардия / National Guard',        num: '117',  color: '#2e7d32', bg: '#eef8ef' },
  { icon: '🆘', name: 'Favqulodda vaziyat', sub: 'МЧС / Emergency Mgmt',             num: '1050', color: '#6a1b9a', bg: '#f5eeff' },
  { icon: '📞', name: 'Yagona raqam',     sub: 'Единый номер / Single Emergency',    num: '112',  color: '#263238', bg: '#f0f4f8' },
];

function EmergencyNumbersScreen({ onBack }) {
  return (
    <div className="en-screen">
      <div className="en-header">
        <button className="en-back" onClick={onBack}>‹</button>
        <span className="en-title">📞 Favqulodda raqamlar</span>
      </div>
      <p className="en-subtitle">Raqamga bosing — avtomatik qo'ng'iroq</p>
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
