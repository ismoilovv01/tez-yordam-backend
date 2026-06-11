import React, { useState, useEffect } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { API_URL } from '../../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../LanguageContext';

const STATUS_COLOR = {
  new: '#f39c12', confirmed: '#3498db', assigned: '#9b59b6',
  on_the_way: '#e67e22', arrived: '#27ae60', completed: '#27ae60', cancelled: '#e74c3c',
};

const SERVICES = [
  { key: 'ambulance', icon: 'рџљ‘', textColor: '#c0392b', bg: '#ffebee' },
  { key: 'pharmacy',  icon: 'рџЏҐ', textColor: '#3949ab', bg: '#e8eaf6' },
  { key: 'police',    icon: 'рџ›ЎпёЏ', textColor: '#1565c0', bg: '#e3f2fd' },
  { key: 'fire',      icon: 'рџ”Ґ', textColor: '#bf360c', bg: '#fff3e0' },
];

export default function CallerHomeScreen({ user, token, navigation }) {
  const { t, theme } = useLanguage();
  const insets = useSafeAreaInsets();
  const [lastEmergency, setLastEmergency] = useState(null);
  const [dispatchCenters, setDispatchCenters] = useState([]);
  const [comingSoon, setComingSoon] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingCenters, setLoadingCenters] = useState(true);
  const [cityName, setCityName] = useState('');

  useEffect(() => {
    fetchLastEmergency();
    fetchDispatchCenters();
    const interval = setInterval(fetchDispatchCenters, 10000);
    import('expo-location').then(Location => {
      Location.requestForegroundPermissionsAsync().then(({ status }) => {
        if (status === 'granted') {
          Location.getCurrentPositionAsync({}).then(pos => {
            const { latitude, longitude } = pos.coords;
            fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${latitude},${longitude}&key=AIzaSyBZcFRlN-fA4eempYCxNItSuAKykUsSoRM&language=uz`)
              .then(r => r.json())
              .then(data => {
                const components = data.results?.[0]?.address_components || [];
                const city = components.find(c => c.types.includes('locality'));
                const region = components.find(c => c.types.includes('administrative_area_level_1'));
                setCityName(city?.long_name || region?.long_name || '');
              }).catch(() => {});
          }).catch(() => {});
        }
      });
    });
    return () => clearInterval(interval);
  }, []);

  const fetchLastEmergency = async () => {
    try {
      const res = await fetch(`${API_URL}/api/emergencies/my/last`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) setLastEmergency(await res.json());
    } catch {}
  };

  const fetchDispatchCenters = async () => {
    try {
      const cached = await AsyncStorage.getItem('dispatch_centers');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (parsed && parsed.length > 0) { setDispatchCenters(parsed); setLoadingCenters(false); }
      }
      const res = await fetch(`${API_URL}/api/dispatch-centers`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.length > 0) {
          setDispatchCenters(data);
          await AsyncStorage.setItem('dispatch_centers', JSON.stringify(data));
        }
      }
    } catch (e) { console.log('fetchDispatchCenters error:', e); }
    finally { setLoadingCenters(false); }
  };

  const showComingSoon = (name) => { setComingSoon(name); setTimeout(() => setComingSoon(''), 2500); };

  const handleServiceClick = (serviceType) => {
    // Police and fire are coming soon вЂ” always show modal
    if (serviceType === 'police' || serviceType === 'fire' || serviceType === 'pharmacy') {
      const name = serviceType === 'police' ? t.police : serviceType === 'fire' ? t.fire : t.pharmacy;
      showComingSoon(name);
      return;
    }
    // Ambulance only
    const center = dispatchCenters.find(c => c.service_type === serviceType);
    navigation.navigate('CallerEmergency', { dispatchCenterId: center?.id || 1, serviceType });
  };

  // Only ambulance is active, everything else is coming soon
  const isActive = (key) => key === 'ambulance';

  const firstName = user?.first_name || user?.phone || t.roleCaller;
  const services = SERVICES.map(s => ({ ...s, name: t[s.key] }));
  const q = searchQuery.toLowerCase();
  const filtered = q ? services.filter(s => s.name.toLowerCase().includes(q)) : services;

  const STATUS_LABEL = {
    new: t.statusLabelNew, confirmed: t.statusLabelConfirmed, assigned: t.statusLabelAssigned,
    on_the_way: t.statusLabelOnWay, arrived: t.statusLabelArrived,
    completed: t.statusLabelCompleted, cancelled: t.statusLabelCancelled,
  };

  const gradColors = theme.dark ? ['#0f3460', '#16213e'] : ['#4fc3f7', '#81c784'];

  return (
    <View style={[s.safe, { backgroundColor: theme.bg }]}>
      <Modal visible={!!comingSoon} transparent animationType="fade">
        <TouchableOpacity style={s.comingOverlay} activeOpacity={1} onPress={() => setComingSoon('')}>
          <View style={[s.comingModal, { backgroundColor: theme.card }]}>
            <Text style={s.comingEmoji}>рџљЂ</Text>
            <Text style={[s.comingTitle, { color: theme.text }]}>{comingSoon}</Text>
            <Text style={[s.comingSub, { color: theme.textSub }]}>{t.comingSoonMsg}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.greeting}>{t.hello}, {firstName} рџ‘‹</Text>
            <Text style={s.locationText}>рџ“Ќ {cityName ? `${cityName}, O'zbekiston` : t.location}</Text>
          </View>
          <TouchableOpacity style={s.notifBtn} onPress={() => navigation.navigate('CallerNotifications')}>
            <Text style={s.notifIcon}>рџ””</Text>
            <View style={s.notifDot} />
          </TouchableOpacity>
        </View>
        <View style={s.searchBar}>
          <Text style={s.searchIconText}>рџ”Ќ</Text>
          <TextInput
            style={s.searchInput}
            placeholder={t.searchPlaceholder}
            placeholderTextColor="#aaa"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCorrect={false}
            spellCheck={false}
          />
          {!!searchQuery && (
            <TouchableOpacity onPress={() => setSearchQuery('')}>
              <Text style={s.clearBtn}>x</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <ScrollView style={[s.content, { backgroundColor: theme.card }]} contentContainerStyle={s.contentInner} showsVerticalScrollIndicator={false}>
        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('CallerEmergencyNumbers')}>
            <View style={[s.quickIcon, { backgroundColor: '#f0f4ff', borderColor: '#e0e8ff' }]}>
              <Text style={s.quickIconText}>рџ“ћ</Text>
            </View>
            <Text style={[s.quickLabel, { color: theme.textSub }]}>{t.call}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn}>
            <View style={[s.quickIcon, { backgroundColor: '#fff8f0', borderColor: '#ffe0b2' }]}>
              <Text style={s.quickIconText}>рџ“Ќ</Text>
            </View>
            <Text style={[s.quickLabel, { color: theme.textSub }]}>{t.myLocation}</Text>
          </TouchableOpacity>
        </View>

        <View style={s.sectionHeader}>
          <Text style={[s.sectionTitle, { color: theme.text }]}>{t.services}</Text>
          <Text style={s.sectionAll}>{t.all}</Text>
        </View>

        <View style={s.grid}>
          {filtered.map((svc) => {
            const active = isActive(svc.key);
            return (
              <TouchableOpacity
                key={svc.key}
                style={[s.card, active ? s.cardActive : s.cardInactive]}
                onPress={() => handleServiceClick(svc.key)}
              >
                <View style={[s.cardIcon, { backgroundColor: svc.bg }]}>
                  <Text style={s.cardIconText}>{svc.icon}</Text>
                </View>
                <Text style={[s.cardName, { color: svc.textColor }]}>{svc.name}</Text>
                <Text style={[s.cardStatus, { color: active ? '#e57373' : '#f39c12' }]}>
                  {active ? t.active : t.comingSoon}
                </Text>
              </TouchableOpacity>
            );
          })}
          {filtered.length === 0 && (
            <Text style={[s.noResults, { color: theme.textSub }]}>{t.noResults}</Text>
          )}
        </View>

        {lastEmergency && (
          <TouchableOpacity style={[s.lastCall, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]} onPress={() => { if (!['completed', 'cancelled'].includes(lastEmergency.status)) navigation.navigate('CallerConfirmation', { emergencyId: lastEmergency.id }); }}>
            <Text style={s.lastCallIcon}>рџљ‘</Text>
            <View style={s.lastCallInfo}>
              <Text style={[s.lastCallTitle, { color: theme.text }]}>{t.lastCall} #{lastEmergency.id}</Text>
              <Text style={[s.lastCallSub, { color: STATUS_COLOR[lastEmergency.status] || '#aaa' }]}>
                {STATUS_LABEL[lastEmergency.status] || lastEmergency.status}
              </Text>
            </View>
            <Text style={s.lastCallArrow}>вЂє</Text>
          </View>
        )}
      </ScrollView>

      <View style={[s.bottomNav, { backgroundColor: theme.navBg, borderTopColor: theme.navBorder, paddingBottom: insets.bottom || 16 }]}>
        <TouchableOpacity style={s.navBtn}>
          <Text style={s.navIcon}>рџЏ </Text>
          <Text style={[s.navLabel, s.navLabelActive]}>{t.home}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => navigation.navigate('CallerProfile')}>
          <Text style={s.navIcon}>рџ‘¤</Text>
          <Text style={[s.navLabel, { color: theme.textSub }]}>{t.profile}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  header: { paddingHorizontal: 20, paddingBottom: 24, paddingTop: 20 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  greeting: { fontSize: 17, fontWeight: '600', color: '#fff', marginBottom: 4 },
  locationText: { fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  notifBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.25)', justifyContent: 'center', alignItems: 'center', position: 'relative' },
  notifIcon: { fontSize: 18 },
  notifDot: { position: 'absolute', top: 6, right: 6, width: 9, height: 9, backgroundColor: '#e74c3c', borderRadius: 5, borderWidth: 1.5, borderColor: '#81c784' },
  searchBar: { backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 14, padding: 12, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchIconText: { fontSize: 16 },
  searchInput: { flex: 1, fontSize: 14, color: '#333', padding: 0, letterSpacing: 0 },
  clearBtn: { color: '#aaa', fontSize: 16, paddingHorizontal: 4 },
  content: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -16 },
  contentInner: { padding: 20, paddingBottom: 100 },
  quickRow: { flexDirection: 'row', justifyContent: 'space-around', marginBottom: 24 },
  quickBtn: { alignItems: 'center', gap: 6 },
  quickIcon: { width: 52, height: 52, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 1 },
  quickIconText: { fontSize: 22 },
  quickLabel: { fontSize: 11 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  sectionTitle: { fontSize: 16, fontWeight: '600' },
  sectionAll: { fontSize: 12, color: '#4fc3f7' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 20 },
  card: { width: '47%', borderRadius: 18, padding: 18, paddingHorizontal: 14, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 120 },
  cardActive: { backgroundColor: '#fff0f0', borderColor: '#ffcdd2' },
  cardInactive: { backgroundColor: '#f8f9ff', borderColor: '#e8ecff', opacity: 0.85 },
  cardIcon: { width: 48, height: 48, borderRadius: 14, justifyContent: 'center', alignItems: 'center' },
  cardIconText: { fontSize: 24 },
  cardName: { fontSize: 13, fontWeight: '600', textAlign: 'center' },
  cardStatus: { fontSize: 11, textAlign: 'center' },
  noResults: { fontSize: 14, padding: 20 },
  lastCall: { borderRadius: 16, padding: 14, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, marginBottom: 20 },
  lastCallIcon: { fontSize: 24 },
  lastCallInfo: { flex: 1 },
  lastCallTitle: { fontSize: 13, fontWeight: '600', marginBottom: 2 },
  lastCallSub: { fontSize: 12 },
  lastCallArrow: { fontSize: 20, color: '#ccc' },
  bottomNav: { paddingTop: 12, paddingHorizontal: 20, flexDirection: 'row', justifyContent: 'space-around', borderTopWidth: 1 },
  navBtn: { alignItems: 'center', gap: 3 },
  navIcon: { fontSize: 22 },
  navLabel: { fontSize: 11 },
  navLabelActive: { color: '#4fc3f7', fontWeight: '600' },
  comingOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  comingModal: { borderRadius: 20, padding: 32, paddingHorizontal: 40, alignItems: 'center', gap: 8 },
  comingEmoji: { fontSize: 48 },
  comingTitle: { fontSize: 20, fontWeight: '700' },
  comingSub: { fontSize: 14 },
});
