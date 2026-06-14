import React, { useState } from 'react';
import '../styles/FeedbackScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';

const RATING_LABELS = ['', '😞 Yomon', '😐 Qoniqarsiz', '🙂 Normal', '😊 Yaxshi', '🤩 Ajoyib!'];

function FeedbackScreen({ token, emergencyId, type = 'general', afterCall = false, onBack, onDone }) {
  const [rating, setRating] = useState(0);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async () => {
    if (!message.trim() && rating === 0) {
      setError('Iltimos baho bering yoki fikr yozing');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${API_URL}/api/feedback`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rating: rating || null,
          message: message.trim() || null,
          emergency_id: emergencyId || null,
          type,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Xato');
      setSent(true);
    } catch (err) {
      setError(err.message || 'Yuborishda xato. Qayta urinib ko\'ring.');
    } finally {
      setLoading(false);
    }
  };

  const handleDone = () => {
    if (onDone) onDone();
  };

  if (sent) {
    return (
      <div className="fb-container">
        <div className="fb-success">
          <div className="fb-success-icon">🎉</div>
          <h2 className="fb-success-title">Fikringiz qabul qilindi!</h2>
          <p className="fb-success-sub">Rahmat 🙏</p>
          <button className="fb-done-btn" onClick={handleDone}>OK</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fb-container">
      <div className="fb-header">
        {!afterCall && (
          <button className="fb-back-btn" onClick={onBack}>←</button>
        )}
        <h2 className="fb-title">Fikr bildirish</h2>
        <p className="fb-sub">
          {emergencyId ? 'Chaqiruvni baholang' : 'Xizmat haqida fikringizni qoldiring'}
        </p>
      </div>

      <div className="fb-card">
        <p className="fb-label">Baholang</p>
        <div className="fb-stars">
          {[1, 2, 3, 4, 5].map((star) => (
            <button
              key={star}
              className="fb-star-btn"
              onClick={() => setRating(star)}
            >
              <span className={`fb-star ${star <= rating ? 'active' : ''}`}>★</span>
            </button>
          ))}
        </div>
        {rating > 0 && <p className="fb-rating-label">{RATING_LABELS[rating]}</p>}
      </div>

      <div className="fb-card">
        <p className="fb-label">Fikr</p>
        <textarea
          className="fb-textarea"
          placeholder="Fikringizni yozing..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          maxLength={500}
          rows={4}
        />
        <p className="fb-char-count">{message.length}/500</p>
      </div>

      {error && <p className="fb-error">⚠️ {error}</p>}

      <button className="fb-submit-btn" onClick={handleSubmit} disabled={loading}>
        {loading ? 'Yuborilmoqda...' : 'Yuborish'}
      </button>

      {afterCall && (
        <button className="fb-skip-btn" onClick={handleDone}>O'tkazib yuborish →</button>
      )}
    </div>
  );
}

export default FeedbackScreen;
