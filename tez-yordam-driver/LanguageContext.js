import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translations } from './translations';

const LanguageContext = createContext();

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState('uz');
  const [darkMode, setDarkModeState] = useState(false);
  const [soundOn, setSoundOnState] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const savedLang = await AsyncStorage.getItem('app_language');
        const savedDark = await AsyncStorage.getItem('app_dark_mode');
        const savedSound = await AsyncStorage.getItem('app_sound');
        if (savedLang && translations[savedLang]) setLangState(savedLang);
        if (savedDark !== null) setDarkModeState(savedDark === 'true');
        if (savedSound !== null) setSoundOnState(savedSound !== 'false');
      } catch {}
    })();
  }, []);

  const setLanguage = async (code) => {
    setLangState(code);
    await AsyncStorage.setItem('app_language', code);
  };

  const setDarkMode = async (val) => {
    setDarkModeState(val);
    await AsyncStorage.setItem('app_dark_mode', String(val));
  };

  const setSoundOn = async (val) => {
    setSoundOnState(val);
    await AsyncStorage.setItem('app_sound', String(val));
  };

  const t = translations[lang];

  // Dark mode color tokens
  const theme = {
    bg: darkMode ? '#1a1a2e' : '#f0f4ff',
    card: darkMode ? '#16213e' : '#fff',
    cardBorder: darkMode ? '#0f3460' : '#e8ecff',
    cardBg: darkMode ? '#0f3460' : '#f8f9ff',
    text: darkMode ? '#ecf0f1' : '#1a1a1a',
    textSub: darkMode ? '#95a5a6' : '#aaa',
    header: darkMode ? '#0f3460' : '#4fc3f7',
    navBg: darkMode ? '#16213e' : '#fff',
    navBorder: darkMode ? '#0f3460' : '#f0f0f0',
    inputBg: darkMode ? '#0f3460' : '#fff',
    inputBorder: darkMode ? '#1565c0' : '#ddd',
    inputText: darkMode ? '#ecf0f1' : '#000',
    sectionTitle: darkMode ? '#7f8c8d' : '#aaa',
    dark: darkMode,
  };

  return (
    <LanguageContext.Provider value={{ lang, setLanguage, t, darkMode, setDarkMode, soundOn, setSoundOn, theme }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
