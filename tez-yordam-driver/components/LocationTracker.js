import { useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { API_URL } from '../constants';

const INTERVAL_MS = 1000; // every 1 second

export default function LocationTracker({ token }) {
  const tokenRef    = useRef(token);
  const intervalRef = useRef(null);

  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    const sendLocation = async () => {
      try {
        const { status } = await Location.getForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });
        await fetch(`${API_URL}/api/driver/location`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${tokenRef.current}`,
          },
          body: JSON.stringify({
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
          }),
        });
      } catch {}
    };
    sendLocation();
    intervalRef.current = setInterval(sendLocation, INTERVAL_MS);
    return () => clearInterval(intervalRef.current);
  }, []);

  return null;
}
