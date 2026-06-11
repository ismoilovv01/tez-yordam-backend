import { useEffect, useRef } from 'react';
import { Audio } from 'expo-av';
import { API_URL } from '../constants';
import { useLanguage } from '../LanguageContext';

const POLL_INTERVAL = 1000;

async function playAlarm() {
  try {
    await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
    const { sound } = await Audio.Sound.createAsync(
      { uri: 'https://www.soundjay.com/buttons/sounds/beep-07.mp3' },
      { shouldPlay: true }
    );
    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.didJustFinish) sound.unloadAsync();
    });
  } catch (e) {
    console.warn('Sound error:', e);
  }
}

export default function SoundNotification({ token }) {
  const { soundOn } = useLanguage();
  const lastCountRef = useRef(null);
  const tokenRef = useRef(token);
  const soundOnRef = useRef(soundOn);
  const intervalRef = useRef(null);

  useEffect(() => { tokenRef.current = token; }, [token]);
  useEffect(() => { soundOnRef.current = soundOn; }, [soundOn]);

  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch(`${API_URL}/api/driver/available-calls`, {
          headers: { Authorization: `Bearer ${tokenRef.current}` },
        });
        const data = await res.json();
        const count = (data.calls || []).length;
        if (lastCountRef.current !== null && count > lastCountRef.current && soundOnRef.current) {
          playAlarm();
        }
        lastCountRef.current = count;
      } catch {}
    };
    check();
    intervalRef.current = setInterval(check, POLL_INTERVAL);
    return () => clearInterval(intervalRef.current);
  }, []);

  return null;
}
