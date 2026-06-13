import React, { useState, useEffect } from 'react';

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
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function CallHistoryScreen({ token, onBack, onLogout }) {
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
    <div className="screen">
      {/* Top bar */}
      <div className="topbar">
        <button className="btn-back" onClick={onBack}>
          ← Orqaga
        </button>
        <span className="topbar-title">Chaqiruvlar tarixi</span>
        {onLogout && (
          <button className="btn-logout" onClick={onLogout}>
            Chiqish
          </button>
        )}
      </div>

      <div className="history-container">
        {loading && (
          <div className="center-screen">
            <div className="pulse-ring" />
            <p className="loading-text">Yuklanmoqda...</p>
          </div>
        )}

        {error && <div className="error-msg">⚠️ {error}</div>}

        {!loading && !error && history.length === 0 && (
          <div className="empty-state">
            <div className="empty-icon">📋</div>
            <p className="empty-text">Hali chaqiruvlar yo'q</p>
          </div>
        )}

        {!loading &&
          history.map((item) => {
            const statusInfo =
              STATUS_LABELS[item.status] || { label: item.status, color: '#7f8c8d' };
            return (
              <div className="history-card" key={item.id}>
                <div className="history-card-top">
                  <span className="history-num">#{item.id}</span>
                  <span
                    className="history-status"
                    style={{ backgroundColor: statusInfo.color }}
                  >
                    {statusInfo.label}
                  </span>
                </div>

                <div className="history-row">
                  <span className="history-label">📅 Sana</span>
                  <span className="history-val">{formatDate(item.created_at)}</span>
                </div>

                <div className="history-row">
                  <span className="history-label">📞 Bemor tel.</span>
                  <a
                    className="history-val phone-link"
                    href={`tel:${item.caller_phone}`}
                  >
                    {item.caller_phone || '—'}
                  </a>
                </div>

                <div className="history-row">
                  <span className="history-label">📍 Koordinata</span>
                  <span className="history-val small">
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

export default CallHistoryScreen;
