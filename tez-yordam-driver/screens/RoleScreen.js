import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLanguage } from '../LanguageContext';
import { LANGUAGES } from '../translations';

export default function RoleScreen({ onSelectRole }) {
  const { t, lang, setLanguage, theme, darkMode, setDarkMode } = useLanguage();
  const [langModal, setLangModal] = useState(false);

  const currentLang = LANGUAGES.find(l => l.code === lang);

  return (
    <SafeAreaView style={s.safe}>
      <Modal visible={langModal} transparent animationType="fade" onRequestClose={() => setLangModal(false)}>
        <TouchableOpacity style={s.langOverlay} activeOpacity={1} onPress={() => setLangModal(false)}>
          <View style={s.langDropdown}>
            <Text style={s.langDropdownTitle}>{t.language}</Text>
            {LANGUAGES.map(l => (
              <TouchableOpacity
                key={l.code}
                style={[s.langOption, lang === l.code && s.langOptionActive]}
                onPress={() => { setLanguage(l.code); setLangModal(false); }}
              >
                <Text style={s.langOptionFlag}>{l.flag}</Text>
                <Text style={[s.langOptionLabel, lang === l.code && s.langOptionLabelActive]}>{l.label}</Text>
                {lang === l.code && <Text style={s.langCheck}>✓</Text>}
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      <View style={s.topBar}>
        <TouchableOpacity style={s.topBtn} onPress={() => setDarkMode(!darkMode)}>
          <Text style={s.topBtnIcon}>{darkMode ? '☀' : '🌙'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.topBtn} onPress={() => setLangModal(true)}>
          <Text style={s.topBtnFlag}>{currentLang?.flag}</Text>
          <Text style={s.topBtnIcon}>{lang?.toUpperCase()}</Text>
        </TouchableOpacity>
      </View>

      <View style={s.hero}>
        <View style={s.pulseRing} />
        <View style={[s.pulseRing, s.delay1]} />
        <View style={[s.pulseRing, s.delay2]} />
        <Text style={s.heroIcon}>+</Text>
        <Text style={s.heroTitle}>{t.roleTitle}</Text>
        <Text style={s.heroSub}>{t.roleSub}</Text>
      </View>

      <View style={[s.card, { backgroundColor: theme.card }]}>
        <Text style={[s.question, { color: theme.textSub }]}>{t.roleQuestion}</Text>

        <TouchableOpacity
          style={[s.roleBtn, s.roleBtnUser, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
          onPress={() => onSelectRole('caller')}
        >
          <Text style={s.roleBtnIcon}>👤</Text>
          <View style={s.roleBtnText}>
            <Text style={[s.roleBtnTitle, { color: theme.text }]}>{t.roleCaller}</Text>
            <Text style={[s.roleBtnSub, { color: theme.textSub }]}>{t.roleCallerSub}</Text>
          </View>
          <Text style={s.roleBtnArrow}>›</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.roleBtn, s.roleBtnDriver, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
          onPress={() => onSelectRole('hodim')}
        >
          <Text style={s.roleBtnIcon}>🚑</Text>
          <View style={s.roleBtnText}>
            <Text style={[s.roleBtnTitle, { color: theme.text }]}>{t.roleHodim}</Text>
            <Text style={[s.roleBtnSub, { color: theme.textSub }]}>{t.roleHodimSub}</Text>
          </View>
          <Text style={s.roleBtnArrow}>›</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#e74c3c' },
  topBar: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, paddingHorizontal: 16, paddingTop: 8 },
  topBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  topBtnIcon: { fontSize: 14, color: '#fff', fontWeight: '600' },
  topBtnFlag: { fontSize: 16 },
  langOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-start', alignItems: 'flex-end', paddingTop: 80, paddingRight: 16 },
  langDropdown: { backgroundColor: '#fff', borderRadius: 16, padding: 8, minWidth: 180, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 16, elevation: 8 },
  langDropdownTitle: { fontSize: 12, color: '#aaa', fontWeight: '600', paddingHorizontal: 12, paddingVertical: 8 },
  langOption: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10 },
  langOptionActive: { backgroundColor: '#f0f8ff' },
  langOptionFlag: { fontSize: 22 },
  langOptionLabel: { flex: 1, fontSize: 14, color: '#333', fontWeight: '500' },
  langOptionLabelActive: { color: '#4fc3f7', fontWeight: '700' },
  langCheck: { color: '#4fc3f7', fontSize: 16, fontWeight: '700' },
  hero: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#e74c3c', position: 'relative' },
  pulseRing: { position: 'absolute', width: 160, height: 160, borderRadius: 80, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)' },
  delay1: { width: 200, height: 200, borderRadius: 100 },
  delay2: { width: 240, height: 240, borderRadius: 120 },
  heroIcon: { fontSize: 60, zIndex: 1, marginBottom: 16, color: '#fff', fontWeight: '900' },
  heroTitle: { fontSize: 32, fontWeight: '800', color: '#fff', zIndex: 1, letterSpacing: 1 },
  heroSub: { fontSize: 14, color: 'rgba(255,255,255,0.8)', zIndex: 1, marginTop: 8 },
  card: { backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 28, paddingBottom: 40 },
  question: { fontSize: 16, fontWeight: '600', color: '#555', marginBottom: 16 },
  roleBtn: { flexDirection: 'row', alignItems: 'center', borderRadius: 16, padding: 18, marginBottom: 14, borderWidth: 1.5 },
  roleBtnUser: { backgroundColor: '#f0f4ff', borderColor: '#e0e8ff' },
  roleBtnDriver: { backgroundColor: '#f0fff4', borderColor: '#c8e6c9' },
  roleBtnIcon: { fontSize: 32, marginRight: 14 },
  roleBtnText: { flex: 1 },
  roleBtnTitle: { fontSize: 17, fontWeight: '700', color: '#1a1a1a' },
  roleBtnSub: { fontSize: 13, color: '#888', marginTop: 3 },
  roleBtnArrow: { fontSize: 24, color: '#ccc' },
});
