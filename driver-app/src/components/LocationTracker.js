import { useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const INTERVAL_MS = 10000;

function LocationTracker({ token }) {
  const intervalRef = useRef(null);
  const tokenRef = useRef(token);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const sendLocation = () => {
      if (!navigator.geolocation) return;
      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          try {
            await fetch(`${API_URL}/api/driver/location`, {
              method: 'PATCH',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${tokenRef.current}`,
              },
              body: JSON.stringify({ latitude, longitude }),
            });
          } catch {
            // Silently ignore network errors
          }
        },
        (err) => {
          console.warn('[LocationTracker] Geolocation error:', err.message);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
      );
    };

    sendLocation();
    intervalRef.current = setInterval(sendLocation, INTERVAL_MS);

    return () => clearInterval(intervalRef.current);
  }, []);

  return null;
}

export default LocationTracker;
