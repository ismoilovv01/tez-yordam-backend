import React from 'react';
import '../styles/SplashScreen.css';

function SplashScreen() {
  return (
    <div className="splash-container">
      <div className="splash-pulse-ring" />
      <div className="splash-pulse-ring delay1" />
      <div className="splash-pulse-ring delay2" />
      <img className="splash-logo" src="/app-logo.png" alt="Help Mee" />
      <h1 className="splash-title">Help Mee</h1>
      <p className="splash-sub">Favqulodda yordam tizimi</p>
      <div className="splash-loader">
        <div className="splash-loader-bar" />
      </div>
    </div>
  );
}

export default SplashScreen;
