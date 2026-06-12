import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ActivityIndicator, Alert, Animated, PanResponder, Dimensions } from 'react-native';

const SCREEN_HEIGHT = Dimensions.get('window').height;
const COLLAPSED_HEIGHT = 130;
const EXPANDED_HEIGHT = SCREEN_HEIGHT * 0.7;
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import { API_URL, GOOGLE_KEY } from '../../constants';
import { useLanguage } from '../../LanguageContext';

export default function CallerConfirmationScreen({ token, onLogout, navigation, route }) {
  const { t, theme } = useLanguage();
  const { emergencyId, callerLocation } = route?.params || {};
  const [status, setStatus] = useState('new');
  const [ambulanceInfo, setAmbulanceInfo] = useState(null);
  const [ambulanceLocation, setAmbulanceLocation] = useState(null);
  const [cancelled, setCancelled] = useState(false);
  const [cancelledBy, setCancelledBy] = useState(null);
  const [routeInfo, setRouteInfo] = useState(null);
  const [sheetExpanded, setSheetExpanded] = useState(false);
  const sheetHeight = useRef(new Animated.Value(COLLAPSED_HEIGHT)).current;

  const expandSheet = () => {
    setSheetExpanded(true);
    Animated.spring(sheetHeight, { toValue: EXPANDED_HEIGHT, useNativeDriver: false, tension: 60, friction: 10 }).start();
  };

  const collapseSheet = () => {
    setSheetExpanded(false);
    Animated.spring(sheetHeight, { toValue: COLLAPSED_HEIGHT, useNativeDriver: false, tension: 60, friction: 10 }).start();
  };

  const panResponder = useRef(PanResponder.create({
    onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 5,
    onPanResponderMove: (_, g) => {
      const current = sheetExpanded ? EXPANDED_HEIGHT : COLLAPSED_HEIGHT;
      const next = current - g.dy;
      if (next >= COLLAPSED_HEIGHT && next <= EXPANDED_HEIGHT) sheetHeight.setValue(next);
    },
    onPanResponderRelease: (_, g) => {
      if (g.dy < -30) expandSheet();
      else if (g.dy > 30) collapseSheet();
      else sheetExpanded ? expandSheet() : collapseSheet();
    },
  })).current;
  const mapRef = useRef(null);
  const pollRef = useRef(null);
  const cancelShownRef = useRef(false);
  const mapFittedRef = useRef(false);

  const STATUSES = {
    new:        { icon: '📋', title: t.statusNew,       subtitle: t.statusNewSub,       color: '#f39c12', step: 1 },
    confirmed:  { icon: '✅', title: t.statusConfirmed,  subtitle: t.statusConfirmedSub, color: '#2980b9', step: 2 },
    assigned:   { icon: '🚑', title: t.statusAssigned,   subtitle: t.statusAssignedSub,  color: '#8e44ad', step: 3 },
    on_the_way: { icon: '🚗', title: t.statusOnTheWay,   subtitle: t.statusOnTheWaySub,  color: '#e67e22', step: 4 },
    arrived:    { icon: '🏥', title: t.statusArrived,    subtitle: t.statusArrivedSub,   color: '#27ae60', step: 5 },
    completed:  { icon: '🏁', title: t.statusCompleted,  subtitle: t.statusCompletedSub, color: '#27ae60', step: 6 },
    cancelled:  { icon: '❌', title: t.statusCancelled,  subtitle: t.statusCancelledSub, color: '#e74c3c', step: 0 },
    rejected:   { icon: '❌', title: t.statusCancelled,  subtitle: t.statusCancelledSub, color: '#e74c3c', step: 0 },
  };

  const STEPS = [
    { key: 'new', label: t.stepSent },
    { key: 'confirmed', label: t.stepConfirmed },
    { key: 'assigned', label: t.stepAccepted },
    { key: 'on_the_way', label: t.stepOnWay },
    { key: 'arrived', label: t.stepArrived },
    { key: 'completed', label: t.stepDone },
  ];

  useEffect(() => {
    fetchStatus();
    pollRef.current = setInterval(fetchStatus, 2000);
    return () => clearInterval(pollRef.current);
  }, []);

  const fetchStatus = async () => {
    if (!emergencyId || !token) return;
    try {
      const res = await fetch(`${API_URL}/api/emergencies/${emergencyId}`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (!res.ok) return;
      setStatus(data.status);
      if ((data.status === 'cancelled' || data.status === 'rejected') && !cancelShownRef.current) {
        cancelShownRef.current = true;
        clearInterval(pollRef.current);
        setCancelledBy(data.cancelled_by || 'dispatcher');
        setCancelled(true);
        return;
      }
      // Show plate_region + unit_number together (e.g. "90 A-01")
      if (data.unit_number) {
        const plateLabel = data.plate_region
          ? `${data.plate_region} ${data.unit_number}`
          : data.unit_number;
        setAmbulanceInfo(plateLabel);
      }
      if (data.amb_lat && data.amb_lng) {
        const ambCoord = { latitude: parseFloat(data.amb_lat), longitude: parseFloat(data.amb_lng) };
        setAmbulanceLocation(ambCoord);
        if (!mapFittedRef.current && callerLocation && mapRef.current) {
          mapFittedRef.current = true;
          mapRef.current.fitToCoordinates(
            [{ latitude: callerLocation.lat, longitude: callerLocation.lng }, ambCoord],
            { edgePadding: { top: 80, right: 80, bottom: 80, left: 80 }, animated: true }
          );
        }
      }
    } catch {}
  };

  const handleCancel = () => {
    Alert.alert(t.cancelCall, t.cancelConfirm, [
      { text: t.no, style: 'cancel' },
      { text: t.yes, style: 'destructive', onPress: async () => {
        try {
          await fetch(`${API_URL}/api/emergencies/${emergencyId}/cancel`, { method: 'PATCH', headers: { Authorization: `Bearer ${token}` } });
          cancelShownRef.current = true;
          clearInterval(pollRef.current);
          setCancelledBy('user'); setCancelled(true);
        } catch {}
      }},
    ]);
  };

  const currentStatus = STATUSES[status] || STATUSES.new;
  const currentStep = currentStatus.step;
  const isCompleted = status === 'completed';
  const canCancel = !['completed', 'cancelled', 'rejected', 'arrived'].includes(status);
  const showRoute = ambulanceLocation && ['assigned', 'on_the_way'].includes(status) && callerLocation;

  if (cancelled) {
    const msgs = {
      user: t.cancelledByUser,
      driver: t.cancelledByDriver,
      dispatcher: t.cancelledByDispatcher,
    };
    return (
      <SafeAreaView style={[s.safe, { justifyContent: 'center', alignItems: 'center', padding: 32, backgroundColor: theme.dark ? '#0d0d1a' : '#1a1a2e' }]}>
        <Text style={{ fontSize: 72, marginBottom: 20 }}>❌</Text>
        <Text style={{ fontSize: 22, fontWeight: '700', color: '#fff', textAlign: 'center', marginBottom: 12 }}>{t.cancelledTitle}</Text>
        <Text style={{ fontSize: 15, color: '#aaa', textAlign: 'center', lineHeight: 22, marginBottom: 32 }}>
          {msgs[cancelledBy] || msgs.dispatcher}
        </Text>
        <TouchableOpacity style={[s.btnNew, { width: '100%' }]} onPress={() => navigation.replace('CallerHome')}>
          <Text style={s.btnNewText}>{t.goBack}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <View style={[s.safe, { backgroundColor: theme.dark ? '#0d0d1a' : '#1a1a2e' }]}>
      <View style={[s.statusBar, { backgroundColor: currentStatus.color }]}>
        <Text style={s.statusIcon}>{currentStatus.icon}</Text>
        <View style={s.statusText}>
          <Text style={s.statusTitle}>{currentStatus.title}</Text>
          <Text style={s.statusSub}>{currentStatus.subtitle}</Text>
        </View>
        {!!emergencyId && <Text style={s.statusId}>#{emergencyId}</Text>}
      </View>

      <View style={s.mapContainer}>
        <MapView ref={mapRef} style={s.map} provider={PROVIDER_GOOGLE}
          initialRegion={callerLocation
            ? { latitude: callerLocation.lat, longitude: callerLocation.lng, latitudeDelta: 0.05, longitudeDelta: 0.05 }
            : { latitude: 41.2995, longitude: 69.2401, latitudeDelta: 0.1, longitudeDelta: 0.1 }}>
          {callerLocation && (
            <Marker coordinate={{ latitude: callerLocation.lat, longitude: callerLocation.lng }} pinColor="red" title={t.yourLocation} />
          )}
          {ambulanceLocation && (
            <Marker coordinate={ambulanceLocation} title={`${t.ambulance}${ambulanceInfo ? ` (${ambulanceInfo})` : ''}`}>
              <View style={s.ambMarker}><Text style={{ fontSize: 24 }}>🚑</Text></View>
            </Marker>
          )}
          {showRoute && (
            <MapViewDirections
              origin={ambulanceLocation}
              destination={{ latitude: callerLocation.lat, longitude: callerLocation.lng }}
              apikey={GOOGLE_KEY} strokeWidth={5} strokeColor="#e74c3c"
              onReady={(r) => setRouteInfo({ distance: r.distance.toFixed(1) + ' km', duration: Math.round(r.duration) + ' daq' })}
            />
          )}
        </MapView>

        <TouchableOpacity
          style={s.locateBtn}
          onPress={() => {
            if (callerLocation && mapRef.current) {
              mapRef.current.animateToRegion({
                latitude: callerLocation.lat,
                longitude: callerLocation.lng,
                latitudeDelta: 0.01,
                longitudeDelta: 0.01,
              }, 500);
            }
          }}
        >
          <Text style={s.locateBtnIcon}>📍</Text>
        </TouchableOpacity>
      </View>

      <Animated.View style={[s.bottomSheet, { maxHeight: sheetHeight }]} {...panResponder.panHandlers}>
        <TouchableOpacity style={s.handle} onPress={() => sheetExpanded ? collapseSheet() : expandSheet()}>
          <View style={s.handleBar} />
          <Text style={s.handleHint}>{sheetExpanded ? t.showLess : t.showMore}</Text>
        </TouchableOpacity>

        {ambulanceLocation && ['assigned', 'on_the_way'].includes(status) && (
          <View style={s.etaCard}>
            <View style={s.etaItem}>
              <Text style={s.etaLabel}>📍 {t.distance}</Text>
              <Text style={s.etaValue}>{routeInfo?.distance || '...'}</Text>
            </View>
            <View style={s.etaDivider} />
            <View style={s.etaItem}>
              <Text style={s.etaLabel}>⏱ {t.eta}</Text>
              <Text style={s.etaValue}>{routeInfo?.duration || '...'}</Text>
            </View>
            <View style={s.etaDivider} />
            <View style={s.etaItem}>
              <Text style={s.etaLabel}>🚑 {t.ambulanceCar}</Text>
              <Text style={s.etaValue}>{ambulanceInfo || '...'}</Text>
            </View>
          </View>
        )}

        {sheetExpanded && (
          <View style={s.steps}>
            {STEPS.map((step, idx) => {
              const stepNum = idx + 1;
              const done = currentStep >= stepNum;
              const active = currentStep === stepNum;
              return (
                <View key={step.key} style={s.stepRow}>
                  <View style={[s.stepCircle, done && s.stepCircleDone, active && s.stepCircleActive]}>
                    <Text style={[s.stepCircleText, done && { color: '#fff' }]}>{done ? '✓' : stepNum}</Text>
                  </View>
                  <Text style={[s.stepLabel, done && s.stepLabelDone]}>{step.label}</Text>
                  {idx < STEPS.length - 1 && <View style={[s.stepLine, currentStep > stepNum && s.stepLineDone]} />}
                </View>
              );
            })}
          </View>
        )}

        {canCancel && (
          <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
            <Text style={s.cancelBtnText}>❌ {t.cancelCall}</Text>
          </TouchableOpacity>
        )}

        {!isCompleted && (
          <View style={s.waitingRow}>
            <ActivityIndicator size="small" color="#e74c3c" style={{ marginRight: 8 }} />
            <Text style={s.waitingText}>{t.updating}</Text>
          </View>
        )}

        {isCompleted && (
          <View style={s.doneBox}>
            <Text style={s.doneThanks}>{t.thanks}</Text>
            <TouchableOpacity style={s.btnNew} onPress={() => navigation.replace('CallerHome')}>
              <Text style={s.btnNewText}>{t.newCall}</Text>
            </TouchableOpacity>
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#1a1a2e' },
  statusBar: { position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, paddingHorizontal: 14, paddingTop: 50 },
  statusIcon: { fontSize: 26 },
  statusText: { flex: 1 },
  statusTitle: { fontSize: 15, fontWeight: '700', color: '#fff' },
  statusSub: { fontSize: 11, color: 'rgba(255,255,255,0.85)' },
  statusId: { backgroundColor: 'rgba(0,0,0,0.25)', color: '#fff', fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  mapContainer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 },
  map: { flex: 1 },
  ambMarker: { backgroundColor: '#fff', borderRadius: 10, padding: 4, elevation: 4 },
  locateBtn: { position: 'absolute', right: 16, bottom: 200, width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a1a2e', justifyContent: 'center', alignItems: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 6, zIndex: 30 },
  locateBtnIcon: { fontSize: 22 },
  bottomSheet: { position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 25, backgroundColor: '#1a1a2e', borderTopLeftRadius: 20, borderTopRightRadius: 20, overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  bottomSheetExpanded: {},
  handle: { alignItems: 'center', paddingTop: 12, paddingBottom: 12, minHeight: 44 },
  handleBar: { width: 36, height: 4, backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 2, marginBottom: 4 },
  handleHint: { fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: 0.3 },
  etaCard: { marginHorizontal: 16, marginBottom: 8, marginTop: 6, backgroundColor: '#0f3460', borderRadius: 12, padding: 10, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  etaItem: { alignItems: 'center', flex: 1 },
  etaLabel: { fontSize: 10, color: '#aaa' },
  etaValue: { fontSize: 15, fontWeight: '700', color: '#fff' },
  etaDivider: { width: 1, height: 32, backgroundColor: 'rgba(255,255,255,0.1)' },
  steps: { paddingHorizontal: 16, paddingBottom: 4 },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 30, position: 'relative' },
  stepCircle: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#2c2c4a', borderWidth: 2, borderColor: '#3d3d66', justifyContent: 'center', alignItems: 'center' },
  stepCircleDone: { backgroundColor: '#e74c3c', borderColor: '#e74c3c' },
  stepCircleActive: { backgroundColor: '#c0392b', borderColor: '#c0392b' },
  stepCircleText: { fontSize: 10, fontWeight: '700', color: '#7f8c8d' },
  stepLabel: { fontSize: 13, color: '#7f8c8d', flex: 1 },
  stepLabelDone: { color: '#ecf0f1', fontWeight: '600' },
  stepLine: { position: 'absolute', left: 11, top: 24, width: 2, height: 6, backgroundColor: '#2c2c4a' },
  stepLineDone: { backgroundColor: '#e74c3c' },
  cancelBtn: { borderWidth: 1, borderColor: '#e74c3c', borderRadius: 8, padding: 10, marginHorizontal: 16, marginTop: 4, alignItems: 'center' },
  cancelBtnText: { color: '#e74c3c', fontSize: 13 },
  waitingRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 6 },
  waitingText: { color: '#7f8c8d', fontSize: 12 },
  doneBox: { padding: 16, gap: 8 },
  doneThanks: { color: '#27ae60', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  btnNew: { backgroundColor: '#e74c3c', borderRadius: 10, padding: 13, alignItems: 'center' },
  btnNewText: { color: '#fff', fontWeight: '700', fontSize: 14 },
});
