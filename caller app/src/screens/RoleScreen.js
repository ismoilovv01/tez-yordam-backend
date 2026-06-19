import React from 'react';
import '../styles/RoleScreen.css';
import { useLanguage } from '../LanguageContext';

function RoleScreen({ onSelectRole }) {
  const { t } = useLanguage();
  return (
    <div className="role-container">
      <div className="role-hero">
        <div className="role-pulse-ring" />
        <div className="role-pulse-ring delay1" />
        <div className="role-pulse-ring delay2" />
        <img className="role-logo" src="/app-logo.png" alt="Help Mee" />
        <h1 className="role-app-name">Help Mee</h1>
      </div>
      <div className="role-form-card">
        <h2 className="role-title">{t.welcome}</h2>
        <p className="role-sub">{t.selectRole}</p>
        <button className="role-btn role-btn-user" onClick={() => onSelectRole('caller')}>
          <div className="role-btn-icon user">👤</div>
          <div className="role-btn-text">
            <span className="role-btn-label">{t.roleCaller}</span>
            <span className="role-btn-desc">{t.roleCallerDesc}</span>
          </div>
          <span className="role-btn-arrow">›</span>
        </button>
        <button className="role-btn role-btn-driver" onClick={() => onSelectRole('driver')}>
          <div className="role-btn-icon driver">🚑</div>
          <div className="role-btn-text">
            <span className="role-btn-label">{t.roleDriver}</span>
            <span className="role-btn-desc">{t.roleDriverDesc}</span>
          </div>
          <span className="role-btn-arrow">›</span>
        </button>
        <p className="role-note">{t.roleNote}</p>
      </div>
    </div>
  );
}

export default RoleScreen;
