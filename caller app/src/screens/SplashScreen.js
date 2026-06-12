import React, { useEffect } from 'react';
import '../styles/SplashScreen.css';

function SplashScreen() {
  return (
    <div className="splash-container">
      <div className="splash-pulse-ring" />
      <div className="splash-pulse-ring delay1" />
      <div className="splash-pulse-ring delay2" />
      <div className="splash-logo">🚑</div>
      <h1 className="splash-title">Tez Yordam</h1>
      <p className="splash-sub">Favqulodda yordam tizimi</p>
      <div className="splash-loader">
        <div className="splash-loader-bar" />
      </div>
    </div>
  );
}

export default SplashScreen;
