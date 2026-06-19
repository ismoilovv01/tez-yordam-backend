import React, { useState, useEffect } from 'react';
import axios from 'axios';
import '../styles/DashboardScreen.css';

const API\\\\\\\_URL = process.env.REACT\\\\\\\_APP\\\\\\\_API\\\\\\\_URL || 'http://localhost:3000';

function DashboardScreen({ token, onLogout }) {
  const \\\\\\\[emergencies, setEmergencies] = useState(\\\\\\\[]);
  const \\\\\\\[loading, setLoading] = useState(false);
  const \\\\\\\[mapLoaded, setMapLoaded] = useState(false);
  const \\\\\\\[mapInstance, setMapInstance] = useState(null);

  // Load Yandex Maps
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://api-maps.yandex.ru/2.1/?apikey=YOUR\\\\\\\_API\\\\\\\_KEY\\\\\\\&lang=en\\\\\\\_US';
    script.async = true;
    script.onload = () => {
      window.ymaps.ready(() => {
        initializeMap();
      });
    };
    document.body.appendChild(script);

    return () => {
      if (script) document.body.removeChild(script);
    };
  }, \\\\\\\[]);

  // Initialize map
  const initializeMap = () => {
    const map = new window.ymaps.Map('dispatcher-map', {
      center: \\\\\\\[41.2995, 69.2401],
      zoom: 13,
      controls: \\\\\\\['zoomControl']
    });

    setMapInstance(map);
    setMapLoaded(true);
    fetchEmergencies();
  };

  // Fetch emergencies
  const fetchEmergencies = async () => {
    setLoading(true);
    try {
      const response = await axios.get(`${API\\\\\\\_URL}/api/emergencies?status=new`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });

      setEmergencies(response.data);
      updateMap(response.data);
    } catch (err) {
      console.error('Error fetching emergencies:', err);
    }
    setLoading(false);
  };

  // Update map with markers
  const updateMap = (emerg) => {
    if (!mapInstance) return;

    mapInstance.geoObjects.removeAll();

    emerg.forEach((e) => {
      const placemark = new window.ymaps.Placemark(
        \\\\\\\[parseFloat(e.latitude), parseFloat(e.longitude)],
        { 
          balloonContent: `Emergency #${e.id}<br>${e.service\\\\\\\_type}<br>${new Date(e.created\\\\\\\_at).toLocaleTimeString()}`
        },
        { preset: 'islands#redIcon' }
      );
      mapInstance.geoObjects.add(placemark);
    });
  };

  // Confirm emergency
  const handleConfirm = async (id) => {
    try {
      await axios.patch(`${API\\\\\\\_URL}/api/emergencies/${id}/confirm`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchEmergencies();
    } catch (err) {
      console.error('Error confirming:', err);
    }
  };

  // Dispatch emergency
  const handleDispatch = async (id) => {
    try {
      await axios.patch(`${API\\\\\\\_URL}/api/emergencies/${id}/dispatch`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchEmergencies();
    } catch (err) {
      console.error('Error dispatching:', err);
    }
  };

  // Complete emergency
  const handleComplete = async (id) => {
    try {
      await axios.patch(`${API\\\\\\\_URL}/api/emergencies/${id}/complete`, {}, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      fetchEmergencies();
    } catch (err) {
      console.error('Error completing:', err);
    }
  };

  return (
    <div className="dashboard-container">
      {/\\\\\\\* Header \\\\\\\*/}
      <div className="dashboard-header">
        <h1>Dispatcher Control Center</h1>
        <div className="header-actions">
          <button className="btn-refresh" onClick={fetchEmergencies} disabled={loading}>
            🔄 Refresh
          </button>
          <button className="btn-logout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </div>

      <div className="dashboard-content">
        {/\\\\\\\* Map \\\\\\\*/}
        <div className="map-section">
          <div id="dispatcher-map" className="dispatcher-map"></div>
          {!mapLoaded \\\\\\\&\\\\\\\& <div className="loading-map">Loading map...</div>}
        </div>

        {/\\\\\\\* Emergencies List \\\\\\\*/}
        <div className="emergencies-section">
          <h2>Active Emergencies ({emergencies.length})</h2>
          <div className="emergencies-list">
            {emergencies.length === 0 ? (
              <p className="no-emergencies">No active emergencies</p>
            ) : (
              emergencies.map((e) => (
                <div key={e.id} className="emergency-item">
                  <div className="emergency-info">
                    <p className="emergency-id">#{e.id}</p>
                    <p className="emergency-type">🚑 {e.service\\\\\\\_type}</p>
                    <p className="emergency-location">
                      📍 {parseFloat(e.latitude).toFixed(4)}, {parseFloat(e.longitude).toFixed(4)}
                    </p>
                    <p className="emergency-time">
                      {new Date(e.created\\\\\\\_at).toLocaleTimeString()}
                    </p>
                    {e.description \\\\\\\&\\\\\\\& (
                      <p className="emergency-description">"{e.description}"</p>
                    )}
                  </div>
                  <div className="emergency-actions">
                    <button
                      className="btn-action btn-confirm"
                      onClick={() => handleConfirm(e.id)}
                    >
                      ✓ Confirm
                    </button>
                    <button
                      className="btn-action btn-dispatch"
                      onClick={() => handleDispatch(e.id)}
                    >
                      → Dispatch
                    </button>
                    <button
                      className="btn-action btn-complete"
                      onClick={() => handleComplete(e.id)}
                    >
                      ✓ Complete
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DashboardScreen;
