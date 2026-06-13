import { useEffect, useRef } from 'react';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const POLL_INTERVAL = 8000;

// Generate alarm sound using Web Audio API — no external file needed
function playAlarm() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    
    const playBeep = (startTime, freq, duration) => {
      const oscillator = ctx.createOscillator();
      const gainNode = ctx.createGain();
      oscillator.connect(gainNode);
      gainNode.connect(ctx.destination);
      oscillator.frequency.value = freq;
      oscillator.type = 'sine';
      gainNode.gain.setValueAtTime(0.8, startTime);
      gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration);
    };

    // Play 3 urgent beeps
    playBeep(ctx.currentTime, 880, 0.3);
    playBeep(ctx.currentTime + 0.4, 880, 0.3);
    playBeep(ctx.currentTime + 0.8, 1100, 0.5);
  } catch (e) {
    console.warn('Audio not supported:', e);
  }
}

function SoundNotification({ token }) {
  const lastCallCountRef = useRef(null);
  const tokenRef = useRef(token);
  const intervalRef = useRef(null);

  useEffect(() => {
    tokenRef.current = token;
  }, [token]);

  useEffect(() => {
    const checkForNewCalls = async () => {
      try {
        const res = await fetch(`${API_URL}/api/driver/available-calls`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
        const data = await res.json();
        const currentCount = (data.calls || []).length;

        // If we have a previous count and new calls appeared — play alarm
        if (lastCallCountRef.current !== null && currentCount > lastCallCountRef.current) {
          playAlarm();
        }

        lastCallCountRef.current = currentCount;
      } catch {}
    };

    checkForNewCalls();
    intervalRef.current = setInterval(checkForNewCalls, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  return null;
}

export default SoundNotification;
