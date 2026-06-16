import React from 'react';
import '../styles/RoleScreen.css';

function RoleScreen({ onSelectRole }) {
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
        <h2 className="role-title">Xush kelibsiz!</h2>
        <p className="role-sub">Rolingizni tanlang</p>
        <button className="role-btn role-btn-user" onClick={() => onSelectRole('caller')}>
          <div className="role-btn-icon user">👤</div>
          <div className="role-btn-text">
            <span className="role-btn-label">Foydalanuvchi</span>
            <span className="role-btn-desc">Yordam so'rash</span>
          </div>
          <span className="role-btn-arrow">›</span>
        </button>
        <button className="role-btn role-btn-driver" onClick={() => onSelectRole('driver')}>
          <div className="role-btn-icon driver"><img src="/app-logo.png" alt="" style={{ width: 26, height: 26, objectFit: 'contain' }} /></div>
          <div className="role-btn-text">
            <span className="role-btn-label">Haydovchi</span>
            <span className="role-btn-desc">Xizmat ko'rsatish</span>
          </div>
          <span className="role-btn-arrow">›</span>
        </button>
        <p className="role-note">Haydovchilar faqat admin tomonidan qo'shiladi</p>
      </div>
    </div>
  );
}

export default RoleScreen;
