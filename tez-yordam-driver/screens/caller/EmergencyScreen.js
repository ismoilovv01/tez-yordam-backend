import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { API_URL } from '../../constants';
import { useLanguage } from '../../LanguageContext';

export default function CallerEmergencyScreen({ token, navigation, route }) {
  const { t, theme } = useLanguage();
  const { dispatchCenterId = 1, serviceType = 'ambulance' } = route?.params || {};
  const [location, setLocation] = useState(null);
  const [description, setDescription] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const mapRef = useRef(null);

  // SOS radar searching animation
  const ring1 = useRef(new Animated.Value(0)).current;
  const ring2 = useRef(new Animated.Value(0)).current;
  const ring3 = useRef(new Animated.Value(0)).current;
  const animsRef = useRef([]);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      const fallback = { latitude: 41.2995, longitude: 69.2401 };
      if (status !== 'granted') { setLocation(fallback); return; }
      try {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
      } catch { setLocation(fallback); }
    })();
  }, []);

  useEffect(() => {
    if (sending) {
      const makePulse = (anim, delay) => {
        anim.setValue(0);
        return Animated.loop(
          Animated.sequence([
            Animated.delay(delay),
            Animated.timing(anim, { toValue: 1, duration: 1800, useNativeDriver: true }),
            Animated.timing(anim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ])
        );
      };
      const a1 = makePulse(ring1, 0);
      const a2 = makePulse(ring2, 600);
      const a3 = makePulse(ring3, 1200);
      animsRef.current = [a1, a2, a3];
      a1.start(); a2.start(); a3.start();
    } else {
      animsRef.current.forEach(a => a.stop());
      animsRef.current = [];
    }
    return () => { animsRef.current.forEach(a => a.stop()); };
  }, [sending]);

  const radarRingStyle = (anim) => ({
    opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.55, 0.2, 0] }),
    transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [1, 2.6] }) }],
  });

  const handleLocate = async () => {
    try {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      setLocation(coords);
      mapRef.current?.animateToRegion({ ...coords, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500);
    } catch {}
  };

  const handleSend = async () => {
    if (!location) return setError(t.waitingGps);
    setSending(true); setError('');
    try {
      const res = await fetch(`${API_URL}/api/emergencies`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          latitude: location.latitude, longitude: location.longitude,
          service_type: serviceType, dispatch_center_id: dispatchCenterId, description,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || t.error);
      // Brief delay so the searching animation is visible before navigating
      setTimeout(() => {
        navigation.replace('CallerConfirmation', {
          emergencyId: data.id,
          callerLocation: { lat: location.latitude, lng: location.longitude },
        });
      }, 900);
    } catch (err) {
      setError(err.message);
      setSending(false);
    }
  };

  const serviceTitle = serviceType === 'police' ? `🛡️ ${t.police}`
    : serviceType === 'fire' ? `🔥 ${t.fire}` : `🚑 ${t.ambulance}`;
  const btnLabel = serviceType === 'police' ? t.callPolice
    : serviceType === 'fire' ? t.callFire : t.callAmbulance;

  return (
    <SafeAreaView style={[s.safe, { backgroundColor: theme.bg }]} edges={['top', 'left', 'right', 'bottom']}>
      <View style={s.mapWrapper}>
        {location ? (
          <MapView ref={mapRef} style={s.map} provider={PROVIDER_GOOGLE}
            initialRegion={{ ...location, latitudeDelta: 0.01, longitudeDelta: 0.01 }}
            onPress={(e) => !sending && setLocation(e.nativeEvent.coordinate)}>
            <Marker coordinate={location} draggable={!sending} onDragEnd={(e) => setLocation(e.nativeEvent.coordinate)} pinColor="red" />
          </MapView>
        ) : (
          <View style={[s.mapLoading, { backgroundColor: theme.cardBg }]}>
            <ActivityIndicator size="large" color="#e74c3c" />
          </View>
        )}

        {/* Back button */}
        {!sending && (
          <TouchableOpacity style={[s.backBtn, { backgroundColor: theme.card }]} onPress={() => navigation.goBack()}>
            <Text style={[s.backBtnText, { color: theme.text }]}>←</Text>
          </TouchableOpacity>
        )}

        {/* Title */}
        <View style={[s.titleBadge, { backgroundColor: theme.card }]}>
          <Text style={[s.titleText, { color: theme.text }]}>{serviceTitle}</Text>
        </View>

        {/* Notification bell */}
        {!sending && (
          <TouchableOpacity style={s.notifBtn} onPress={() => navigation.navigate('CallerNotifications')}>
            <Text style={s.notifIcon}>🔔</Text>
            <View style={s.notifDot} />
          </TouchableOpacity>
        )}

        {/* Locate button */}
        {!sending && (
          <TouchableOpacity style={[s.locateBtn, { backgroundColor: theme.card }]} onPress={handleLocate}>
            <Text style={s.locateIcon}>📍</Text>
          </TouchableOpacity>
        )}

        {/* SOS searching overlay */}
        {sending && (
          <View style={s.searchOverlay} pointerEvents="none">
            <View style={s.radarWrap}>
              <Animated.View style={[s.radarRing, radarRingStyle(ring1)]} />
              <Animated.View style={[s.radarRing, radarRingStyle(ring2)]} />
              <Animated.View style={[s.radarRing, radarRingStyle(ring3)]} />
              <View style={s.radarCore}>
                <Text style={s.radarCoreIcon}>🚑</Text>
              </View>
            </View>
            <Text style={s.searchText}>{t.searchingDriver || 'Eng yaqin yordam qidirilmoqda...'}</Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={[s.bottom, { backgroundColor: theme.card }]}>
          <View style={s.handle} />
          {!!error && <View style={s.errorBox}><Text style={s.errorText}>⚠️ {error}</Text></View>}
          <TextInput
            style={[s.textarea, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder, color: theme.text }]}
            placeholder={t.additionalInfo} placeholderTextColor={theme.textSub}
            value={description} onChangeText={setDescription} multiline numberOfLines={2} maxHeight={80}
            editable={!sending} />
          <TouchableOpacity style={[s.sendBtn, sending && { opacity: 0.7 }]} onPress={handleSend} disabled={sending}>
            {sending ? (
              <View style={s.sendingRow}>
                <ActivityIndicator color="#fff" style={{ marginRight: 8 }} />
                <Text style={s.sendBtnText}>{t.searching || 'Qidirilmoqda...'}</Text>
              </View>
            ) : (
              <Text style={s.sendBtnText}>🚑 {btnLabel}</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1 },
  mapWrapper: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  mapLoading: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  backBtn: { position: 'absolute', top: 12, left: 12, zIndex: 10, width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  backBtnText: { fontSize: 20 },
  titleBadge: { position: 'absolute', top: 12, left: 60, right: 60, zIndex: 10, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 10, elevation: 3 },
  titleText: { fontSize: 13, fontWeight: '600' },
  notifBtn: { position: 'absolute', top: 12, right: 12, zIndex: 10, width: 40, height: 40, borderRadius: 12, backgroundColor: '#4fc3f7', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  notifIcon: { fontSize: 18 },
  notifDot: { position: 'absolute', top: 6, right: 6, width: 8, height: 8, backgroundColor: '#e74c3c', borderRadius: 4, borderWidth: 1.5, borderColor: '#4fc3f7' },
  locateBtn: { position: 'absolute', bottom: 14, right: 12, zIndex: 10, width: 40, height: 40, borderRadius: 12, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 10, elevation: 4 },
  locateIcon: { fontSize: 18 },
  bottom: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 12, paddingBottom: 16, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 20, elevation: 8 },
  handle: { width: 36, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 10 },
  errorBox: { backgroundColor: '#fff5f5', borderWidth: 1, borderColor: '#ffcdd2', borderRadius: 10, padding: 10, marginBottom: 12 },
  errorText: { fontSize: 13, color: '#e74c3c' },
  textarea: { borderWidth: 1.5, borderRadius: 12, padding: 10, paddingHorizontal: 14, fontSize: 14, marginBottom: 10, minHeight: 48, maxHeight: 80, textAlignVertical: 'top' },
  sendBtn: { borderRadius: 14, paddingVertical: 13, alignItems: 'center', backgroundColor: '#e74c3c' },
  sendBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', letterSpacing: 0.5 },
  sendingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  searchOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,46,0.55)', justifyContent: 'center', alignItems: 'center', zIndex: 50 },
  radarWrap: { width: 220, height: 220, justifyContent: 'center', alignItems: 'center', marginBottom: 24 },
  radarRing: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 3, borderColor: '#e74c3c', backgroundColor: 'rgba(231,76,60,0.15)' },
  radarCore: { width: 72, height: 72, borderRadius: 36, backgroundColor: '#e74c3c', justifyContent: 'center', alignItems: 'center', shadowColor: '#e74c3c', shadowOpacity: 0.6, shadowRadius: 16, elevation: 10 },
  radarCoreIcon: { fontSize: 32 },
  searchText: { color: '#fff', fontSize: 16, fontWeight: '600', textAlign: 'center', paddingHorizontal: 32 },
});
