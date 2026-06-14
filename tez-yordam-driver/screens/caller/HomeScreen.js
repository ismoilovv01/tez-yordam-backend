import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ScrollView,
  Modal, TextInput, ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { API_URL, GOOGLE_KEY } from '../../constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useLanguage } from '../../LanguageContext';

const CITY_COORDS = {
  'Tashkent': [41.2995, 69.2401], 'Toshkent': [41.2995, 69.2401],
  'Samarqand': [39.6547, 66.9758], 'Samarkand': [39.6547, 66.9758],
  'Buxoro': [39.7747, 64.4286], 'Bukhara': [39.7747, 64.4286],
  'Namangan': [41.0011, 71.6722], 'Andijon': [40.7829, 72.3442],
  "Farg'ona": [40.3864, 71.7864], 'Fergana': [40.3864, 71.7864],
  'Xorazm': [41.5534, 60.6166], 'Urganch': [41.5534, 60.6166],
  'Nukus': [42.4603, 59.6166], 'Navoiy': [40.0963, 65.3791],
  'Qarshi': [38.8600, 65.7897], 'Termiz': [37.2241, 67.2786],
  'Jizzax': [40.1158, 67.8422], 'Guliston': [40.4897, 68.7842],
};

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function findNearestCenter(centers, serviceType, userLat, userLon) {
  const filtered = centers.filter(c => c.service_type === serviceType);
  if (!filtered.length) return null;
  if (!userLat || !userLon) return filtered[0];
  let nearest = null, minDist = Infinity;
  filtered.forEach(c => {
    const coords = CITY_COORDS[c.city];
    if (!coords) return;
    const dist = getDistance(userLat, userLon, coords[0], coords[1]);
    if (dist < minDist) { minDist = dist; nearest = c; }
  });
  return nearest || filtered[0];
}

const STATUS_COLOR = {
  new: '#f39c12', confirmed: '#3498db', assigned: '#9b59b6',
  on_the_way: '#e67e22', arrived: '#27ae60', completed: '#27ae60', cancelled: '#e74c3c',
};

const SERVICES = [
  { key: 'ambulance', icon: '🚑', textColor: '#c0392b', bg: '#ffebee' },
  { key: 'pharmacy',  icon: '🏥', textColor: '#3949ab', bg: '#e8eaf6' },
  { key: 'police',    icon: '🛡️', textColor: '#1565c0', bg: '#e3f2fd' },
  { key: 'fire',      icon: '🔥', textColor: '#bf360c', bg: '#fff3e0' },
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
  const [userCoords, setUserCoords] = useState(null);

  // Location picker modal
  const [locationModal, setLocationModal] = useState(false);
  const [pickerLocation, setPickerLocation] = useState(null);
  const [pickerCity, setPickerCity] = useState('');
  const mapRef = useRef(null);

  useEffect(() => {
    fetchLastEmergency();
    fetchDispatchCenters();
    const interval = setInterval(fetchDispatchCenters, 10000);
    fetchCurrentLocation();
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const interval = setInterval(fetchLastEmergency, 5000);
    return () => clearInterval(interval);
  }, []);

  const fetchCurrentLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setUserCoords(coords);
      setPickerLocation(coords);
      reverseGeocode(coords.latitude, coords.longitude, setCityName);
    } catch {}
  };

  const reverseGeocode = async (lat, lng, setter) => {
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=AIzaSyBZcFRlN-fA4eempYCxNItSuAKykUsSoRM&language=uz`
      );
      const data = await res.json();
      const components = data.results?.[0]?.address_components || [];
      const city = components.find(c => c.types.includes('locality'));
      const region = components.find(c => c.types.includes('administrative_area_level_1'));
      const name = city?.long_name || region?.long_name || '';
      if (name) setter(name);
    } catch {}
  };

  const handleOpenLocationPicker = () => {
    setPickerLocation(userCoords || { latitude: 41.2995, longitude: 69.2401 });
    setLocationModal(true);
  };

  const handleSaveLocation = async () => {
    if (!pickerLocation) return;
    setUserCoords(pickerLocation);
    await reverseGeocode(pickerLocation.latitude, pickerLocation.longitude, (name) => {
      setCityName(name);
      setPickerCity(name);
    });
    setLocationModal(false);
  };

  const handleLocateMe = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({});
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setPickerLocation(coords);
      reverseGeocode(coords.latitude, coords.longitude, setPickerCity);
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    } catch {}
  };

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
    } catch (e) {}
    finally { setLoadingCenters(false); }
  };

  const showComingSoon = (name) => { setComingSoon(name); setTimeout(() => setComingSoon(''), 2500); };

  const isActiveEmergency = lastEmergency && !['completed', 'cancelled'].includes(lastEmergency.status);

  const handleServiceClick = (serviceType) => {
    if (isActiveEmergency) {
      navigation.navigate('CallerConfirmation', { emergencyId: lastEmergency.id });
      return;
    }
    if (serviceType === 'police' || serviceType === 'fire' || serviceType === 'pharmacy') {
      const name = serviceType === 'police' ? t.police : serviceType === 'fire' ? t.fire : t.pharmacy;
      showComingSoon(name);
      return;
    }
    const center = findNearestCenter(dispatchCenters, serviceType, userCoords?.latitude, userCoords?.longitude);
    navigation.navigate('CallerEmergency', { dispatchCenterId: center?.id || 1, serviceType });
  };

  const handleLastCallPress = () => {
    if (isActiveEmergency) {
      navigation.navigate('CallerConfirmation', { emergencyId: lastEmergency.id });
    }
  };

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
      {/* Coming soon modal */}
      <Modal visible={!!comingSoon} transparent animationType="fade">
        <TouchableOpacity style={s.comingOverlay} activeOpacity={1} onPress={() => setComingSoon('')}>
          <View style={[s.comingModal, { backgroundColor: theme.card }]}>
            <Text style={s.comingEmoji}>🚀</Text>
            <Text style={[s.comingTitle, { color: theme.text }]}>{comingSoon}</Text>
            <Text style={[s.comingSub, { color: theme.textSub }]}>{t.comingSoonMsg}</Text>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Location picker modal */}
      <Modal visible={locationModal} transparent animationType="slide" onRequestClose={() => setLocationModal(false)}>
        <View style={s.locationModalOverlay}>
          <View style={[s.locationModalCard, { backgroundColor: theme.card }]}>
            <View style={s.locationModalHeader}>
              <Text style={[s.locationModalTitle, { color: theme.text }]}>📍 {t.locationPickerTitle || "Joylashuvni tanlang"}</Text>
              <TouchableOpacity onPress={() => setLocationModal(false)}>
                <Text style={{ fontSize: 22, color: '#999' }}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={[s.locationModalSub, { color: theme.textSub }]}>
              Xaritada o'z joyingizni belgilang
            </Text>
            {pickerLocation && (
              <View style={s.locationMapWrapper}>
                <MapView
                  ref={mapRef}
                  style={s.locationMap}
                  provider={PROVIDER_GOOGLE}
                  initialRegion={{ ...pickerLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
                  onPress={(e) => {
                    const coords = e.nativeEvent.coordinate;
                    setPickerLocation(coords);
                    reverseGeocode(coords.latitude, coords.longitude, setPickerCity);
                  }}
                >
                  <Marker
                    coordinate={pickerLocation}
                    draggable
                    onDragEnd={(e) => {
                      const coords = e.nativeEvent.coordinate;
                      setPickerLocation(coords);
                      reverseGeocode(coords.latitude, coords.longitude, setPickerCity);
                    }}
                    pinColor="red"
                  />
                </MapView>
                <TouchableOpacity style={s.locateMeBtn} onPress={handleLocateMe}>
                  <Text style={s.locateMeBtnIcon}>📍</Text>
                </TouchableOpacity>
              </View>
            )}
            {pickerCity ? (
              <Text style={[s.locationModalCity, { color: theme.text }]}>📍 {pickerCity}, O'zbekiston</Text>
            ) : null}
            <TouchableOpacity style={[s.locationSaveBtn, { backgroundColor: '#4fc3f7' }]} onPress={handleSaveLocation}>
              <Text style={s.locationSaveBtnText}>{t.locationPickerSave || 'Shu joyni saqlash'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <LinearGradient colors={gradColors} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[s.header, { paddingTop: insets.top + 12 }]}>
        <View style={s.headerTop}>
          <View>
            <Text style={s.greeting}>{t.hello}, {firstName} 👋</Text>
            <Text style={s.locationText}>📍 {cityName ? `${cityName}, O'zbekiston` : t.location}</Text>
          </View>
          <TouchableOpacity style={s.notifBtn} onPress={() => navigation.navigate('CallerNotifications')}>
            <Text style={s.notifIcon}>🔔</Text>
            <View style={s.notifDot} />
          </TouchableOpacity>
        </View>
        <View style={s.searchBar}>
          <Text style={s.searchIconText}>🔍</Text>
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
              <Text style={s.clearBtn}>✕</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      <ScrollView style={[s.content, { backgroundColor: theme.card }]} contentContainerStyle={s.contentInner} showsVerticalScrollIndicator={false}>

        {isActiveEmergency && (
          <TouchableOpacity
            style={s.activeBanner}
            onPress={() => navigation.navigate('CallerConfirmation', { emergencyId: lastEmergency.id })}
          >
            <Text style={s.activeBannerIcon}>🚨</Text>
            <View style={{ flex: 1 }}>
              <Text style={s.activeBannerTitle}>Faol chaqiruv #{lastEmergency.id}</Text>
              <Text style={s.activeBannerSub}>{STATUS_LABEL[lastEmergency.status] || lastEmergency.status}</Text>
            </View>
            <Text style={s.activeBannerArrow}>›</Text>
          </TouchableOpacity>
        )}

        <View style={s.quickRow}>
          <TouchableOpacity style={s.quickBtn} onPress={() => navigation.navigate('CallerEmergencyNumbers')}>
            <View style={[s.quickIcon, { backgroundColor: '#f0f4ff', borderColor: '#e0e8ff' }]}>
              <Text style={s.quickIconText}>📞</Text>
            </View>
            <Text style={[s.quickLabel, { color: theme.textSub }]}>{t.call}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.quickBtn} onPress={handleOpenLocationPicker}>
            <View style={[s.quickIcon, { backgroundColor: '#fff8f0', borderColor: '#ffe0b2' }]}>
              <Text style={s.quickIconText}>📍</Text>
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
          <TouchableOpacity
            style={[s.lastCall, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}
            onPress={handleLastCallPress}
          >
            <Text style={s.lastCallIcon}>🚑</Text>
            <View style={s.lastCallInfo}>
              <Text style={[s.lastCallTitle, { color: theme.text }]}>{t.lastCall} #{lastEmergency.id}</Text>
              <Text style={[s.lastCallSub, { color: STATUS_COLOR[lastEmergency.status] || '#aaa' }]}>
                {STATUS_LABEL[lastEmergency.status] || lastEmergency.status}
              </Text>
            </View>
            <Text style={s.lastCallArrow}>›</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[s.bottomNav, { backgroundColor: theme.navBg, borderTopColor: theme.navBorder, paddingBottom: insets.bottom || 16 }]}>
        <TouchableOpacity style={s.navBtn}>
          <Text style={s.navIcon}>🏠</Text>
          <Text style={[s.navLabel, s.navLabelActive]}>{t.home}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.navBtn} onPress={() => navigation.navigate('CallerProfile')}>
          <Text style={s.navIcon}>👤</Text>
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
  searchInput: { flex: 1, fontSize: 14, color: '#333', padding: 0 },
  clearBtn: { color: '#aaa', fontSize: 16, paddingHorizontal: 4 },
  content: { flex: 1, borderTopLeftRadius: 24, borderTopRightRadius: 24, marginTop: -16 },
  contentInner: { padding: 20, paddingBottom: 100 },
  activeBanner: { backgroundColor: '#e74c3c', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 16 },
  activeBannerIcon: { fontSize: 24 },
  activeBannerTitle: { color: '#fff', fontWeight: '700', fontSize: 14 },
  activeBannerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 12, marginTop: 2 },
  activeBannerArrow: { color: '#fff', fontSize: 24 },
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
  // Location picker
  locationModalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  locationModalCard: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 },
  locationModalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  locationModalTitle: { fontSize: 17, fontWeight: '700' },
  locationModalSub: { fontSize: 12, marginBottom: 14 },
  locationMap: { width: '100%', height: '100%' },
  locationMapWrapper: { width: '100%', height: 280, borderRadius: 16, marginBottom: 12, overflow: 'hidden' },
  locateMeBtn: { position: 'absolute', right: 12, bottom: 12, width: 44, height: 44, borderRadius: 22, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 4 },
  locateMeBtnIcon: { fontSize: 20 },
  locationModalCity: { fontSize: 14, fontWeight: '600', textAlign: 'center', marginBottom: 14 },
  locationSaveBtn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center' },
  locationSaveBtnText: { color: '#fff', fontWeight: '700', fontSize: 15 },
});
