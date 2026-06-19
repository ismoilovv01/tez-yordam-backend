import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, SafeAreaView,
  ScrollView, ActivityIndicator, Modal, TextInput, Switch,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../constants';
import { useLanguage } from '../../LanguageContext';
import { LANGUAGES } from '../../translations';

export default function CallerProfileScreen({ user, token, onLogout, navigation, homeScreen = 'CallerHome' }) {
  const { t, lang, setLanguage, darkMode, setDarkMode, soundOn, setSoundOn, theme } = useLanguage();
  const insets = useSafeAreaInsets();
  const [userData, setUserData] = useState(user);
  const [callCount, setCallCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [editNameModal, setEditNameModal] = useState(false);
  const [settingsModal, setSettingsModal] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isDriver = homeScreen === 'DriverHome';
  const feedbackScreenName = isDriver ? 'DriverFeedback' : 'CallerFeedback';
  const feedbackType = isDriver ? 'driver' : 'caller';

  useEffect(() => { fetchUser(); }, [token]);

  const fetchUser = async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (res.ok) {
        setUserData(data);
        setCallCount(data.call_count || 0);
        setFirstName(data.first_name || '');
        setLastName(data.last_name || '');
      }
    } catch {}
    setLoading(false);
  };

  const showSuccess = (msg) => { setSuccessMsg(msg); setTimeout(() => setSuccessMsg(''), 3000); };

  const handleSaveName = async () => {
    if (!firstName.trim() || !lastName.trim()) return setError(`${t.firstName} ${t.lastName}`);
    setSaving(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/auth/update-profile`, {
        method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ first_name: firstName.trim(), last_name: lastName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      setUserData(prev => ({ ...prev, first_name: firstName.trim(), last_name: lastName.trim() }));
      setEditNameModal(false); showSuccess(t.nameSaved);
    } catch (err) { setError(err.message); }
    setSaving(false);
  };

  const fullName = [userData?.first_name, userData?.last_name].filter(Boolean).join(' ') || t.roleCaller;
  const phone = userData?.phone || '';
  const gradColors = theme.dark ? ['#0f3460', '#16213e'] : ['#4fc3f7', '#81c784'];

  return (
    <View style={[s.safe, { backgroundColor: theme.bg }]}>
      {!!successMsg && (
        <View style={s.successBanner}>
          <Text style={s.successBannerText}>✅ {successMsg}</Text>
        </View>
      )}

      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: (insets.top || 0) + 12 }]}>
        <View style={s.avatar}><Text style={s.avatarIcon}>👤</Text></View>
        <Text style={s.name}>{fullName}</Text>
        <Text style={s.phone}>{phone}</Text>
      </LinearGradient>

      <ScrollView style={[s.content, { backgroundColor: theme.card }]} contentContainerStyle={{ padding: 20, paddingBottom: 100 }}>
        {loading ? <ActivityIndicator color="#4fc3f7" style={{ marginTop: 40 }} /> : (
          <>
            <Text style={[s.sectionTitle, { color: theme.sectionTitle }]}>{t.account.toUpperCase()}</Text>

            <TouchableOpacity style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]} onPress={() => { setError(''); setEditNameModal(true); }}>
              <Text style={s.cardIcon}>👤</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: theme.text }]}>{fullName}</Text>
                <Text style={[s.cardLabel, { color: theme.textSub }]}>{t.fullName} • {t.editLabel}</Text>
              </View>
              <Text style={s.cardArrow}>›</Text>
            </TouchableOpacity>

            <View style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
              <Text style={s.cardIcon}>📱</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: theme.text }]}>{phone}</Text>
                <Text style={[s.cardLabel, { color: theme.textSub }]}>{t.phone}</Text>
              </View>
            </View>

            <TouchableOpacity style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]} onPress={() => navigation.navigate(isDriver ? 'DriverHistory' : 'CallerNotifications')}>
              <Text style={s.cardIcon}>📋</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: theme.text }]}>{t.callHistory}</Text>
                <Text style={[s.cardLabel, { color: theme.textSub }]}>{t.viewAllCalls}</Text>
              </View>
              <Text style={s.cardArrow}>›</Text>
            </TouchableOpacity>

            <Text style={[s.sectionTitle, { color: theme.sectionTitle }]}>{(t.feedbackSection || 'Fikr va takliflar').toUpperCase()}</Text>

            <TouchableOpacity
              style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
              onPress={() => navigation.navigate(feedbackScreenName, { type: feedbackType })}
            >
              <Text style={s.cardIcon}>⭐</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: theme.text }]}>{t.feedbackSection || 'Fikr va takliflar'}</Text>
                <Text style={[s.cardLabel, { color: theme.textSub }]}>{t.feedbackSectionSub || "Ilovani yaxshilashga yordam bering"}</Text>
              </View>
              <Text style={s.cardArrow}>›</Text>
            </TouchableOpacity>

            <Text style={[s.sectionTitle, { color: theme.sectionTitle }]}>{t.settings.toUpperCase()}</Text>

            <TouchableOpacity style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]} onPress={() => setSettingsModal(true)}>
              <Text style={s.cardIcon}>⚙️</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: theme.text }]}>{t.appSettings}</Text>
                <Text style={[s.cardLabel, { color: theme.textSub }]}>{t.appSettingsSub}</Text>
              </View>
              <Text style={s.cardArrow}>›</Text>
            </TouchableOpacity>

            <View style={[s.card, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
              <Text style={s.cardIcon}>ℹ️</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: theme.text }]}>Help Mee v1.0.0</Text>
                <Text style={[s.cardLabel, { color: theme.textSub }]}>{t.version}</Text>
              </View>
            </View>

            <TouchableOpacity style={[s.card, s.logoutCard]} onPress={onLogout}>
              <Text style={s.cardIcon}>🚪</Text>
              <View style={s.cardInfo}>
                <Text style={[s.cardValue, { color: '#e74c3c' }]}>{t.logout}</Text>
              </View>
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      <View style={[s.bottomNav, { backgroundColor: theme.navBg, borderTopColor: theme.navBorder, paddingBottom: insets.bottom || 16 }]}>
        <TouchableOpacity style={s.navBtn} onPress={() => navigation.navigate(homeScreen)}>
          <Text style={s.navIcon}>🏠</Text>
          <Text style={[s.navLabel, { color: theme.textSub }]}>{t.home}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn}>
          <Text style={s.navIcon}>👤</Text>
          <Text style={[s.navLabel, s.navLabelActive]}>{t.profile}</Text>
        </TouchableOpacity>
      </View>

      {/* Edit Name Modal */}
      <Modal visible={editNameModal} transparent animationType="slide" onRequestClose={() => setEditNameModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setEditNameModal(false)}>
            <TouchableOpacity style={[s.modalCard, { backgroundColor: theme.card }]} activeOpacity={1}>
              <Text style={[s.modalTitle, { color: theme.text }]}>{t.editName}</Text>
              <TextInput style={[s.modalInput, { backgroundColor: '#fff', borderColor: '#ddd', color: '#000' }]} placeholder={t.firstName} placeholderTextColor="#999" value={firstName} onChangeText={setFirstName} />
              <TextInput style={[s.modalInput, { backgroundColor: '#fff', borderColor: '#ddd', color: '#000' }]} placeholder={t.lastName} placeholderTextColor="#999" value={lastName} onChangeText={setLastName} />
              {!!error && <Text style={s.modalError}>{error}</Text>}
              <TouchableOpacity style={s.modalBtn} onPress={handleSaveName} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.modalBtnText}>{t.save}</Text>}
              </TouchableOpacity>
              <TouchableOpacity style={s.modalBtnGhost} onPress={() => setEditNameModal(false)}>
                <Text style={s.modalBtnGhostText}>{t.cancel}</Text>
              </TouchableOpacity>
            </TouchableOpacity>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      </Modal>

      {/* Settings Modal */}
      <Modal visible={settingsModal} transparent animationType="slide" onRequestClose={() => setSettingsModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setSettingsModal(false)}>
          <TouchableOpacity style={[s.modalCard, { backgroundColor: theme.card }]} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: theme.text }]}>{t.settingsTitle}</Text>
            <View style={[s.settingRow, { borderBottomColor: theme.cardBorder }]}>
              <Text style={[s.settingLabel, { color: theme.text }]}>🌙 {t.darkMode}</Text>
              <Switch value={darkMode} onValueChange={setDarkMode} trackColor={{ true: '#4fc3f7' }} thumbColor="#fff" />
            </View>
            <View style={[s.settingRow, { borderBottomColor: theme.cardBorder }]}>
              <Text style={[s.settingLabel, { color: theme.text }]}>🔔 {t.soundNotif}</Text>
              <Switch value={soundOn} onValueChange={setSoundOn} trackColor={{ true: '#4fc3f7' }} thumbColor="#fff" />
            </View>
            <View style={{ paddingVertical: 14 }}>
              <Text style={[s.settingLabel, { color: theme.text, marginBottom: 12 }]}>🌐 {t.language}</Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {LANGUAGES.map(l => (
                  <TouchableOpacity key={l.code} onPress={() => setLanguage(l.code)}
                    style={{ flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', backgroundColor: lang === l.code ? '#4fc3f7' : theme.cardBg, borderWidth: 1.5, borderColor: lang === l.code ? '#4fc3f7' : theme.cardBorder }}>
                    <Text style={{ fontSize: 20, marginBottom: 2 }}>{l.flag}</Text>
                    <Text style={{ color: lang === l.code ? '#fff' : theme.text, fontWeight: '600', fontSize: 11 }}>{l.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <TouchableOpacity style={s.modalBtn} onPress={() => setSettingsModal(false)}>
              <Text style={s.modalBtnText}>{t.close}</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  successBanner: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 100, backgroundColor: '#27ae60', padding: 12, alignItems: 'center' },
  successBannerText: { color: '#fff', fontWeight: '600', fontSize: 14 },
  header: { padding: 40, paddingBottom: 40, alignItems: 'center', gap: 8 },
  avatar: { width: 72, height: 72, backgroundColor: 'rgba(255,255,255,0.2)', borderRadius: 36, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  avatarIcon: { fontSize: 36 },
  name: { fontSize: 20, fontWeight: '700', color: '#fff' },
  phone: { fontSize: 13, color: 'rgba(255,255,255,0.8)' },
  content: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -16 },
  sectionTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.5, marginBottom: 8, marginTop: 16 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, borderRadius: 14, padding: 14, paddingHorizontal: 16, borderWidth: 1, marginBottom: 10 },
  logoutCard: { backgroundColor: '#fff5f5', borderColor: '#ffcdd2' },
  cardIcon: { fontSize: 20 },
  cardInfo: { flex: 1 },
  cardValue: { fontSize: 14, fontWeight: '500' },
  cardLabel: { fontSize: 11, marginTop: 2 },
  cardArrow: { fontSize: 20, color: '#ccc' },
  bottomNav: { paddingTop: 12, paddingBottom: 20, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1 },
  navBtn: { alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 22 },
  navLabel: { fontSize: 11 },
  navLabelActive: { color: '#4fc3f7', fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, paddingBottom: 40 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 16 },
  modalInput: { borderRadius: 12, padding: 14, fontSize: 15, marginBottom: 12, borderWidth: 1.5 },
  modalError: { color: '#e74c3c', fontSize: 13, marginBottom: 8 },
  modalBtn: { backgroundColor: '#4fc3f7', borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  modalBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  modalBtnGhost: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#ddd' },
  modalBtnGhostText: { color: '#888', fontSize: 14 },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, borderBottomWidth: 1 },
  settingLabel: { fontSize: 14 },
});
