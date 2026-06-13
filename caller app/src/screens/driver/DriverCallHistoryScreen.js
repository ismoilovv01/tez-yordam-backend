import React, { useState, useEffect } from 'react';
import '../../styles/driver/DriverCallHistoryScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const STATUS_LABELS = {
  pending: { label: 'Kutilmoqda', color: '#f39c12' },
  assigned: { label: 'Tayinlangan', color: '#2980b9' },
  on_the_way: { label: "Yo'lda", color: '#f39c12' },
  arrived: { label: 'Yetib bordi', color: '#27ae60' },
  completed: { label: 'Tugallangan', color: '#27ae60' },
  rejected: { label: 'Rad etilgan', color: '#e74c3c' },
  cancelled: { label: 'Bekor qilindi', color: '#95a5a6' },
};

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleString('uz-UZ', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}

function DriverCallHistoryScreen({ token, onBack, onLogout }) {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch(`${API_URL}/api/driver/call-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Xato yuz berdi');
        setHistory(data.calls || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [token]);

  return (
    <div className="dh-history-screen">
      <div className="dh-history-topbar">
        <button className="dh-history-btn-back" onClick={onBack}>← Orqaga</button>
        <span className="dh-history-title">Chaqiruvlar tarixi</span>
        {onLogout && <button className="dh-history-btn-logout" onClick={onLogout}>Chiqish</button>}
      </div>

      <div className="dh-history-container">
        {loading && (
          <div className="dh-history-center">
            <div className="dh-history-pulse-ring" />
            <p className="dh-history-loading-text">Yuklanmoqda...</p>
          </div>
        )}

        {error && <div className="dh-history-error">⚠️ {error}</div>}

        {!loading && !error && history.length === 0 && (
          <div className="dh-history-empty">
            <div className="dh-history-empty-icon">📋</div>
            <p className="dh-history-empty-text">Hali chaqiruvlar yo'q</p>
          </div>
        )}

        {!loading &&
          history.map((item) => {
            const statusInfo = STATUS_LABELS[item.status] || { label: item.status, color: '#7f8c8d' };
            return (
              <div className="dh-history-card" key={item.id}>
                <div className="dh-history-card-top">
                  <span className="dh-history-num">#{item.id}</span>
                  <span className="dh-history-status-chip" style={{ backgroundColor: statusInfo.color }}>
                    {statusInfo.label}
                  </span>
                </div>
                <div className="dh-history-row">
                  <span className="dh-history-label">📅 Sana</span>
                  <span className="dh-history-val">{formatDate(item.created_at)}</span>
                </div>
                <div className="dh-history-row">
                  <span className="dh-history-label">📞 Bemor tel.</span>
                  <a className="dh-history-val dh-history-phone-link" href={`tel:${item.caller_phone}`}>
                    {item.caller_phone || '—'}
                  </a>
                </div>
                <div className="dh-history-row">
                  <span className="dh-history-label">📍 Koordinata</span>
                  <span className="dh-history-val small">
                    {item.latitude && item.longitude
                      ? `${parseFloat(item.latitude).toFixed(4)}, ${parseFloat(item.longitude).toFixed(4)}`
                      : '—'}
                  </span>
                </div>
              </div>
            );
          })}
      </div>
    </div>
  );
}

export default DriverCallHistoryScreen;
