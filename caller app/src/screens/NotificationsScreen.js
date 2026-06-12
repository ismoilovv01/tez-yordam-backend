import React, { useState, useEffect } from 'react';
import '../styles/NotificationsScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

function NotificationsScreen({ token, onBack }) {
  const [notifications, setNotifications] = useState([]);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/my/history`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.slice(0, 10));
      }
    } catch {}
  };

  const statusEmoji = (status) => {
    const map = { completed: '✅', cancelled: '❌', on_the_way: '🚑', arrived: '📍', confirmed: '✔️', new: '🆕', assigned: '👨‍✈️' };
    return map[status] || '📋';
  };

  const statusLabel = (status) => {
    const map = { new: 'Yangi', confirmed: 'Tasdiqlandi', assigned: 'Haydovchi tayinlandi', on_the_way: "Yo'lda", arrived: 'Keldi', completed: 'Tugatildi', cancelled: 'Bekor qilindi' };
    return map[status] || status;
  };

  const timeAgo = (dateStr) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins} daqiqa oldin`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} soat oldin`;
    return `${Math.floor(hours / 24)} kun oldin`;
  };

  return (
    <div className="notif-container">
      <div className="notif-header">
        <p className="notif-title">Bildirishnomalar</p>
        <p className="notif-sub">Oxirgi yangiliklar</p>
      </div>
      <div className="notif-content">
        {notifications.length === 0 ? (
          <div className="notif-empty">
            <span className="notif-empty-icon">🔔</span>
            <p className="notif-empty-text">Hozircha bildirishnomalar yo'q</p>
          </div>
        ) : (
          notifications.map((n) => (
            <div key={n.id} className="notif-card">
              <div className="notif-card-icon">{statusEmoji(n.status)}</div>
              <div className="notif-card-info">
                <p className="notif-card-title">Chaqiruv #{n.id} — {statusLabel(n.status)}</p>
                <p className="notif-card-time">{timeAgo(n.created_at)}</p>
              </div>
            </div>
          ))
        )}
      </div>
      <div className="notif-bottom-nav">
        <button className="notif-nav-btn" onClick={onBack}>
          <span>🏠</span>
          <span className="notif-nav-label">Asosiy</span>
        </button>
        <button className="notif-nav-btn">
          <span>👤</span>
          <span className="notif-nav-label">Profil</span>
        </button>
      </div>
    </div>
  );
}

export default NotificationsScreen;
