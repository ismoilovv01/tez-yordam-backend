import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, Alert, ActivityIndicator, Linking,
} from 'react-native';
import MapView, { Marker, MarkerAnimated, AnimatedRegion, PROVIDER_GOOGLE } from 'react-native-maps';
import MapViewDirections from 'react-native-maps-directions';
import * as Location from 'expo-location';
import { API_URL, GOOGLE_KEY } from '../../constants';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLanguage } from '../../LanguageContext';

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

const STATUS_LABELS = {
  assigned:   { label: 'Qabul qilindi', color: '#2980b9' },
  on_the_way: { label: "Yo'lda",        color: '#f39c12' },
  arrived:    { label: 'Keldi',          color: '#27ae60' },
  completed:  { label: 'Tugatildi',      color: '#9b59b6' },
};

function DriverScreen({ token, user, onLogout, navigation, accentColor, markerColor, markerEmoji }) {
  const { t, theme, lang } = useLanguage();
  const insets = useSafeAreaInsets();
  const [activeCall, setActiveCall]         = useState(null);
  const [availableCalls, setAvailableCalls] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverHeading, setDriverHeading]   = useState(0);
  const [selectedCall, setSelectedCall]     = useState(null);
  const [loading, setLoading]               = useState(false);
  const [routeInfo, setRouteInfo]           = useState(null);
  const [statusMsg, setStatusMsg]           = useState('');
  const [isNavigating, setIsNavigating]     = useState(false);
  const [isFollowing, setIsFollowing]       = useState(true);
  const [is3D, setIs3D]                     = useState(true);
  const [driverName, setDriverName]         = useState([user?.first_name, user?.last_name].filter(Boolean).join(' ') || '');
  const [cityName, setCityName]             = useState('');
  const [cancelledPopup, setCancelledPopup]   = useState(false);
  const [completedPopup, setCompletedPopup]   = useState(false);
  const [navModal, setNavModal]               = useState(false);

  const mapRef               = useRef(null);
  const locationRef          = useRef(null);
  const pollRef              = useRef(null);
  const activeCallRef        = useRef(null);
  const lastCompletedCallRef = useRef(null);
  const isFollowingRef       = useRef(true);
  const is3DRef              = useRef(true);
  const headingRef           = useRef(0);
  const userInteractingRef   = useRef(false);
  const prevStatusRef        = useRef(null);
  const resumeFollowTimerRef = useRef(null);
  const animatedCoordRef     = useRef(null);

  useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);
  useEffect(() => { headingRef.current = driverHeading; }, [driverHeading]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.first_name) setDriverName([data.first_name, data.last_name].filter(Boolean).join(' ')); })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    let sub;
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Xato', 'Joylashuvga ruxsat bering'); return; }
      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 2 },
        (loc) => {
          const coords = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          const heading = loc.coords.heading || 0;
          const speed = loc.coords.speed || 0;
          setDriverLocation(coords);
          setDriverHeading(heading);
          locationRef.current = { ...coords, speed };
          headingRef.current = heading;
          // Smooth marker animation
          if (!animatedCoordRef.current) {
            animatedCoordRef.current = new AnimatedRegion({ latitude: coords.latitude, longitude: coords.longitude, latitudeDelta: 0, longitudeDelta: 0 });
          } else {
            animatedCoordRef.current.timing({ latitude: coords.latitude, longitude: coords.longitude, duration: 800, useNativeDriver: false }).start();
          }
          if (!cityName) {
            fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${GOOGLE_KEY}&language=uz`)
              .then(r => r.json())
              .then(data => {
                const components = data.results?.[0]?.address_components || [];
                const city = components.find(c => c.types.includes('locality'));
                const region = components.find(c => c.types.includes('administrative_area_level_1'));
                if (city?.long_name || region?.long_name) setCityName(city?.long_name || region?.long_name);
              }).catch(() => {});
          }
          if (isFollowingRef.current && activeCallRef.current?.status === 'on_the_way' && mapRef.current && !userInteractingRef.current) {
            mapRef.current.animateCamera({ center: coords, heading, pitch: is3DRef.current ? 60 : 0, zoom: 18 }, { duration: 800 });
          }
        }
      );
    })();
    return () => { sub?.remove(); if (resumeFollowTimerRef.current) clearTimeout(resumeFollowTimerRef.current); };
  }, []);

  const fetchData = useCallback(async () => {
    try {
      const [assignedRes, availableRes] = await Promise.all([
        fetch(`${API_URL}/api/driver/assigned-call`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/driver/available-calls`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const assignedData  = await assignedRes.json();
      const availableData = await availableRes.json();
      const call = assignedData.call || null;
      const prev = prevStatusRef.current;
      if (prev === 'arrived' && (!call || call.status === 'completed')) {
        setCompletedPopup(true);
        lastCompletedCallRef.current = activeCallRef.current?.id || null;
      } else if (prev && !['cancelled','completed',null].includes(prev)) {
        if (!call || call.status === 'cancelled') setCancelledPopup(true);
      }
      prevStatusRef.current = call?.status || null;
      setActiveCall(call);
      activeCallRef.current = call;
      setAvailableCalls(availableData.calls || []);
      if (!call) { setRouteInfo(null); setIsNavigating(false); }
      if (call?.status === 'on_the_way') {
        setIsNavigating(true);
        if (isFollowingRef.current && mapRef.current && locationRef.current && !userInteractingRef.current) {
          mapRef.current.animateCamera({ center: locationRef.current, heading: headingRef.current, pitch: is3DRef.current ? 60 : 0, zoom: 18 }, { duration: 1000 });
        }
      } else if (!call || call.status !== 'on_the_way') setIsNavigating(false);
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  const showMsg = (msg) => { setStatusMsg(msg); setTimeout(() => setStatusMsg(''), 3000); };

  const apiAction = async (url, method = 'PATCH') => {
    setLoading(true);
    try {
      const res = await fetch(url, { method, headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) throw new Error(data.error || `Server xatosi (${res.status})`);
      await fetchData();
      return true;
    } catch (err) { Alert.alert('Xato', err.message); return false; }
    finally { setLoading(false); }
  };

  const handleAccept = async (callId) => {
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/api/driver/accept-call/${callId}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let data = {};
      try { data = JSON.parse(text); } catch {}
      if (!res.ok) throw new Error(data.error || 'Xato');
      setSelectedCall(null);
      showMsg(t.statusAssigned);
      await fetchData();
    } catch (err) { Alert.alert('Xato', err.message); }
    finally { setLoading(false); }
  };

  const handleStart = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/start/${activeCall.id}`);
    if (ok) {
      showMsg(t.statusOnTheWay); setIsNavigating(true); setIsFollowing(true); isFollowingRef.current = true;
      if (mapRef.current && locationRef.current) mapRef.current.animateCamera({ center: locationRef.current, heading: headingRef.current, pitch: 60, zoom: 18 }, { duration: 1500 });
    }
  };

  const handleArrived = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/arrived/${activeCall.id}`);
    if (ok) {
      setRouteInfo(null); setIsNavigating(false); setIsFollowing(true); showMsg(t.statusArrived);
      if (mapRef.current && locationRef.current) mapRef.current.animateCamera({ center: locationRef.current, pitch: 0, heading: 0, zoom: 15 }, { duration: 1000 });
    }
  };

  const handleComplete = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/complete/${activeCall.id}`);
    if (ok) { setRouteInfo(null); setIsNavigating(false); showMsg(t.statusCompleted); }
  };

  const handleCancel = () => {
    Alert.alert(t.cancelCall, t.cancelConfirm, [
      { text: t.no, style: 'cancel' },
      { text: t.yes, style: 'destructive', onPress: async () => {
        const ok = await apiAction(`${API_URL}/api/driver/cancel/${activeCall.id}`);
        if (ok) { setRouteInfo(null); setIsNavigating(false); showMsg(t.statusCancelled); }
      }},
    ]);
  };

  const openNavigation = (app) => {
    if (!activeCall) return;
    const lat = parseFloat(activeCall.latitude);
    const lng = parseFloat(activeCall.longitude);
    const url = app === 'google'
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : `yandexmaps://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto`;
    Linking.canOpenURL(url).then(supported => {
      if (supported) Linking.openURL(url);
      else Linking.openURL(app === 'yandex' ? `https://maps.yandex.ru/?rtext=~${lat},${lng}&rtt=auto` : `https://www.google.com/maps?q=${lat},${lng}`);
    });
    setNavModal(false);
  };

  const handleReCenter = () => {
    setIsFollowing(true); isFollowingRef.current = true;
    if (mapRef.current && locationRef.current) {
      mapRef.current.animateCamera({ center: locationRef.current, heading: isNavigating ? headingRef.current : 0, pitch: isNavigating && is3D ? 60 : 0, zoom: 18 }, { duration: 1000 });
    }
  };

  const toggle3D = () => {
    const new3D = !is3D; setIs3D(new3D); is3DRef.current = new3D;
    if (mapRef.current) mapRef.current.animateCamera({ pitch: new3D ? 60 : 0, heading: new3D ? headingRef.current : 0 }, { duration: 600 });
  };

  const handleMapInteraction = () => {
    userInteractingRef.current = true; setIsFollowing(false); isFollowingRef.current = false;
    if (resumeFollowTimerRef.current) clearTimeout(resumeFollowTimerRef.current);
    if (activeCallRef.current?.status !== 'on_the_way') return;
    resumeFollowTimerRef.current = setTimeout(() => {
      userInteractingRef.current = false;
      setIsFollowing(true); isFollowingRef.current = true;
      if (mapRef.current && locationRef.current) {
        mapRef.current.animateCamera({ center: locationRef.current, heading: headingRef.current, pitch: is3DRef.current ? 60 : 0, zoom: 18 }, { duration: 1000 });
      }
    }, 4000);
  };

  const statusInfo = activeCall ? (STATUS_LABELS[activeCall.status] || { label: activeCall.status, color: '#7f8c8d' }) : null;
  const distanceKm = activeCall && driverLocation ? getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(activeCall.latitude), parseFloat(activeCall.longitude)).toFixed(1) : null;
  const showRoute = activeCall?.status === 'on_the_way' && driverLocation;
  const initialRegion = driverLocation ? { ...driverLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 } : { latitude: 41.2995, longitude: 69.2401, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>

      {/* Cancellation Popup */}
      <Modal visible={cancelledPopup} transparent animationType="fade">
        <View style={s.cancelOverlay}>
          <View style={s.cancelCard}>
            <Text style={s.cancelIcon}>❌</Text>
            <Text style={s.cancelTitle}>Chaqiruv bekor qilindi</Text>
            <Text style={s.cancelSub}>Chaqiruv bekor qilindi. Yangi chaqiruvlarni kuting.</Text>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: accentColor }]} onPress={() => setCancelledPopup(false)}>
              <Text style={s.cancelBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Completion Popup */}
      <Modal visible={completedPopup} transparent animationType="fade">
        <View style={s.cancelOverlay}>
          <View style={s.cancelCard}>
            <Text style={s.cancelIcon}>✅</Text>
            <Text style={[s.cancelTitle, { color: '#27ae60' }]}>Muvaffaqiyatli yakunlandi!</Text>
            <Text style={s.cancelSub}>Chaqiruv muvaffaqiyatli yakunlandi. Yangi chaqiruvlarni kuting.</Text>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#f39c12' }]} onPress={() => setCompletedPopup(false)}>
              <Text style={[s.cancelBtnText, { color: '#f39c12' }]}>⭐ Baholash</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: '#27ae60', marginTop: 8 }]} onPress={() => setCompletedPopup(false)}>
              <Text style={s.cancelBtnText}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Navigation modal */}
      <Modal visible={navModal} transparent animationType="slide" onRequestClose={() => setNavModal(false)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setNavModal(false)}>
          <TouchableOpacity style={[s.modalCard, { backgroundColor: theme.card }]} activeOpacity={1}>
            <Text style={[s.modalTitle, { color: theme.text, marginBottom: 16 }]}>🗺️ Navigatsiya ilovasini tanlang</Text>
            <TouchableOpacity style={s.navAppBtn} onPress={() => openNavigation('google')}>
              <Text style={{ fontSize: 24 }}>🌍</Text>
              <Text style={s.navAppText}>Google Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.navAppBtn, { backgroundColor: '#fff9c4' }]} onPress={() => openNavigation('yandex')}>
              <Text style={{ fontSize: 24 }}>🟡</Text>
              <Text style={s.navAppText}>Yandex Maps</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.modalBtnGhost} onPress={() => setNavModal(false)}>
              <Text style={{ color: '#888', fontSize: 14 }}>Bekor</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      <View style={s.mapContainer}>
        <MapView ref={mapRef} style={s.map} provider={PROVIDER_GOOGLE} initialRegion={initialRegion}
          showsUserLocation={false} showsMyLocationButton={false} showsCompass={true} showsTraffic={isNavigating}
          rotateEnabled={true} pitchEnabled={true} onPanDrag={handleMapInteraction} onTouchStart={handleMapInteraction}>
          {animatedCoordRef.current && (
            <MarkerAnimated coordinate={animatedCoordRef.current} anchor={{ x: 0.5, y: 0.5 }} rotation={driverHeading} flat>
              {isNavigating
                ? <View style={[s.navArrow, { backgroundColor: accentColor }]}><Text style={s.navArrowText}>▲</Text></View>
                : <View style={[s.driverMarker, { borderColor: accentColor }]}><Text style={{ fontSize: 20 }}>{markerEmoji}</Text></View>}
            </MarkerAnimated>
          )}
          {activeCall && <Marker coordinate={{ latitude: parseFloat(activeCall.latitude), longitude: parseFloat(activeCall.longitude) }} pinColor="red" />}
          {!activeCall && availableCalls.map((call) => (
            <Marker key={call.id} coordinate={{ latitude: parseFloat(call.latitude), longitude: parseFloat(call.longitude) }} pinColor="orange" onPress={() => setSelectedCall(call)} />
          ))}
          {showRoute && (
            <MapViewDirections key={`route-${activeCall?.id}`} origin={driverLocation} destination={{ latitude: parseFloat(activeCall.latitude), longitude: parseFloat(activeCall.longitude) }}
              apikey={GOOGLE_KEY} strokeWidth={isNavigating ? 10 : 5} strokeColor="#e74c3c"
              onReady={(r) => setRouteInfo({ distance: r.distance.toFixed(1) + ' km', duration: Math.round(r.duration) + ' daqiqa' })}
              onError={() => {}} />
          )}
        </MapView>

        {activeCall && (routeInfo || distanceKm) && (
          <View style={s.headerPillWrapper}>
            <View style={s.etaPill}>
              <Text style={s.etaText}>⏱ {routeInfo?.duration || '—'}</Text>
              <Text style={s.etaSep}>•</Text>
              <Text style={s.etaText}>📍 {routeInfo?.distance || (distanceKm + ' km')}</Text>
            </View>
          </View>
        )}

        {!activeCall && (
          <View style={s.headerPillWrapper}>
            <View style={[s.headerPill, { backgroundColor: theme.card }]}>
              {driverName ? <Text style={[s.headerPillText, { color: theme.text }]}>{t.hello}, {driverName}</Text> : null}
              <Text style={[s.headerPillSub, { color: theme.textSub }]}>📍 {cityName ? `${cityName}, O'zbekiston` : "O'zbekiston"}</Text>
            </View>
          </View>
        )}

        <TouchableOpacity style={[s.bellBtn, { backgroundColor: accentColor }]} onPress={() => navigation.navigate('CallerNotifications')}>
          <Text style={s.bellIcon}>🔔</Text>
          {availableCalls.length > 0 && <View style={s.bellDot} />}
        </TouchableOpacity>

        {activeCall && (
          <TouchableOpacity style={s.navExtBtn} onPress={() => setNavModal(true)}>
            <Text style={{ fontSize: 18 }}>🗺️</Text>
          </TouchableOpacity>
        )}

        {!isFollowing && (
          <View style={s.leftButtons}>
            <TouchableOpacity style={s.reCenterBtn} onPress={handleReCenter}>
              <Text style={[s.reCenterIcon, { color: accentColor }]}>▲</Text>
              <Text style={[s.reCenterText, { color: accentColor }]}>{lang === 'ru' ? 'Центрировать' : lang === 'en' ? 'Re-center' : 'Markazga'}</Text>
            </TouchableOpacity>
          </View>
        )}

        <View style={s.rightButtons}>
          <TouchableOpacity style={s.toggleBtn} onPress={toggle3D}><Text style={s.toggleBtnText}>{is3D ? '2D' : '3D'}</Text></TouchableOpacity>
          <TouchableOpacity style={s.locateBtn} onPress={() => {
            if (driverLocation && mapRef.current) { setIsFollowing(true); isFollowingRef.current = true; mapRef.current.animateToRegion({ ...driverLocation, latitudeDelta: 0.01, longitudeDelta: 0.01 }, 500); }
          }}><Text style={{ fontSize: 20 }}>📍</Text></TouchableOpacity>
        </View>

        {!driverLocation && (
          <View style={s.gpsOverlay}><ActivityIndicator color={accentColor} size="large" /><Text style={s.gpsText}>GPS aniqlanmoqda...</Text></View>
        )}
      </View>

      <View style={[s.bottomPanel, { backgroundColor: theme.card }]}>
        <View style={s.sheetHandle} />
        {statusMsg ? <Text style={s.successMsg}>{statusMsg}</Text> : null}

        {activeCall && (
          <>
            <View style={[s.callInfoCard, { backgroundColor: accentColor }]}>
              <View style={s.callInfoTop}>
                <Text style={s.callInfoId}>Chaqiruv #{activeCall.id}</Text>
                <View style={[s.statusBadge, { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                  <Text style={s.statusBadgeText}>{statusInfo?.label}</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${activeCall.caller_phone}`)}>
                <Text style={s.callInfoPhone}>📞 {activeCall.caller_phone || '—'}</Text>
              </TouchableOpacity>
            </View>
            {activeCall.status === 'assigned' && (
              <TouchableOpacity style={[s.btnPrimary, { backgroundColor: accentColor }]} onPress={handleStart} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>🚗 Boshlash</Text>}
              </TouchableOpacity>
            )}
            {activeCall.status === 'on_the_way' && (
              <TouchableOpacity style={[s.btnPrimary, { backgroundColor: '#27ae60' }]} onPress={handleArrived} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>✅ {t.stepArrived}</Text>}
              </TouchableOpacity>
            )}
            {activeCall.status === 'arrived' && (
              <TouchableOpacity style={[s.btnPrimary, { backgroundColor: '#9b59b6' }]} onPress={handleComplete} disabled={loading}>
                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnPrimaryText}>🏁 {t.stepDone}</Text>}
              </TouchableOpacity>
            )}
            {['assigned', 'on_the_way'].includes(activeCall.status) && (
              <TouchableOpacity style={s.btnCancel} onPress={handleCancel} disabled={loading}>
                <Text style={s.btnCancelText}>{t.cancelCall}</Text>
              </TouchableOpacity>
            )}
          </>
        )}

        {!activeCall && (
          <>
            <View style={s.availableHeader}>
              <Text style={[s.availableTitle, { color: theme.text }]}>📋 {t.callHistory}</Text>
              <View style={[s.countBadge, { backgroundColor: accentColor }]}><Text style={s.countText}>{availableCalls.length}</Text></View>
            </View>
            {availableCalls.length === 0 ? (
              <View style={s.noCallsRow}><ActivityIndicator color={accentColor} size="small" style={{ marginRight: 8 }} /><Text style={[s.noCallsText, { color: theme.textSub }]}>{t.updating}</Text></View>
            ) : (
              <FlatList data={availableCalls} keyExtractor={(item) => String(item.id)} style={{ maxHeight: 180 }}
                renderItem={({ item }) => {
                  const dist = driverLocation ? getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(item.latitude), parseFloat(item.longitude)).toFixed(1) : null;
                  return (
                    <TouchableOpacity style={[s.availableCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]} onPress={() => setSelectedCall(item)}>
                      <View style={[s.availableCardIcon, { backgroundColor: '#e3f2fd' }]}><Text style={{ fontSize: 18 }}>{markerEmoji}</Text></View>
                      <View style={s.availableCardInfo}>
                        <Text style={[s.availableCardId, { color: theme.text }]}>Chaqiruv #{item.id}</Text>
                        <Text style={[s.availableCardDist, { color: theme.textSub }]}>{dist ? dist + ' km' : item.caller_phone}</Text>
                      </View>
                      <TouchableOpacity style={[s.qabulBtn, { backgroundColor: accentColor }]} onPress={() => handleAccept(item.id)} disabled={loading}>
                        <Text style={s.qabulBtnText}>Qabul</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }} />
            )}
          </>
        )}

        <View style={[s.bottomNav, { backgroundColor: theme.card, borderTopColor: theme.navBorder, paddingBottom: (insets.bottom || 0) + 10 }]}>
          <TouchableOpacity style={s.navBtn}><Text style={s.navIconActive}>🏠</Text><Text style={[s.navLabelActive, { color: accentColor }]}>{t.home}</Text></TouchableOpacity>
          <TouchableOpacity style={s.navBtn} onPress={() => navigation.navigate('CallerProfile')}><Text style={s.navIcon}>👤</Text><Text style={[s.navLabel, { color: theme.textSub }]}>{t.profile}</Text></TouchableOpacity>
        </View>
      </View>

      <Modal visible={!!selectedCall} transparent animationType="slide" onRequestClose={() => setSelectedCall(null)}>
        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setSelectedCall(null)}>
          <TouchableOpacity style={[s.modalCard, { backgroundColor: theme.card }]} activeOpacity={1}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: theme.text }]}>🚨 Chaqiruv #{selectedCall?.id}</Text>
              <TouchableOpacity onPress={() => setSelectedCall(null)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
            </View>
            <View style={s.modalRow}>
              <Text style={[s.modalLabel, { color: theme.textSub }]}>📞 {t.phone}</Text>
              <TouchableOpacity onPress={() => Linking.openURL(`tel:${selectedCall?.caller_phone}`)}>
                <Text style={[s.modalValue, { color: '#3498db' }]}>{selectedCall?.caller_phone}</Text>
              </TouchableOpacity>
            </View>
            {driverLocation && selectedCall && (
              <View style={s.modalRow}>
                <Text style={[s.modalLabel, { color: theme.textSub }]}>📏 {t.distance}</Text>
                <Text style={[s.modalValue, { color: theme.text }]}>{getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(selectedCall.latitude), parseFloat(selectedCall.longitude)).toFixed(2)} km</Text>
              </View>
            )}
            {selectedCall?.description && (
              <View style={s.modalRow}>
                <Text style={[s.modalLabel, { color: theme.textSub }]}>📝 {t.note}</Text>
                <Text style={[s.modalValue, { color: theme.text }]}>{selectedCall.description}</Text>
              </View>
            )}
            <TouchableOpacity style={[s.acceptFull, { backgroundColor: accentColor }]} onPress={() => handleAccept(selectedCall?.id)} disabled={loading}>
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.acceptFullText}>✅ {t.continue}</Text>}
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

export default function FireHomeScreen(props) {
  return <DriverScreen {...props} accentColor="#e65100" markerColor="#e65100" markerEmoji="🚒" />;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#f5f5f5' },
  mapContainer: { flex: 1, position: 'relative' },
  map: { flex: 1 },
  driverMarker: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 4, elevation: 5, borderWidth: 2 },
  navArrow: { width: 44, height: 44, borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 6, elevation: 8, borderWidth: 3, borderColor: '#fff' },
  navArrowText: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginTop: -2 },
  etaPill: { backgroundColor: 'rgba(255,255,255,0.95)', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  etaText: { fontSize: 12, fontWeight: '600', color: '#333' },
  etaSep: { color: '#ccc', fontSize: 12 },
  headerPillWrapper: { position: 'absolute', top: 16, left: 60, right: 60, alignItems: 'center', zIndex: 10 },
  headerPill: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  headerPillText: { fontSize: 12, fontWeight: '600' },
  headerPillSub: { fontSize: 10, marginTop: 1 },
  bellBtn: { position: 'absolute', top: 16, right: 16, width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 8, elevation: 4 },
  bellIcon: { fontSize: 16 },
  bellDot: { position: 'absolute', top: 5, right: 5, width: 8, height: 8, backgroundColor: '#e74c3c', borderRadius: 4, borderWidth: 1.5, borderColor: '#fff' },
  navExtBtn: { position: 'absolute', top: 60, right: 16, width: 36, height: 36, borderRadius: 10, backgroundColor: '#fff', justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 4 },
  rightButtons: { position: 'absolute', bottom: 20, right: 16, alignItems: 'center', gap: 10 },
  leftButtons: { position: 'absolute', bottom: 20, left: 16, alignItems: 'flex-start', gap: 10 },
  reCenterBtn: { backgroundColor: '#fff', borderRadius: 28, paddingHorizontal: 18, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 8, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  reCenterIcon: { fontSize: 16, fontWeight: 'bold' },
  reCenterText: { fontSize: 14, fontWeight: '700' },
  toggleBtn: { width: 56, height: 56, backgroundColor: '#fff', borderRadius: 28, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  toggleBtnText: { color: '#333', fontSize: 14, fontWeight: '700' },
  locateBtn: { width: 44, height: 44, backgroundColor: '#fff', borderRadius: 22, justifyContent: 'center', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 8, elevation: 5 },
  gpsOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' },
  gpsText: { color: '#fff', marginTop: 12, fontSize: 15 },
  bottomPanel: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 16, paddingTop: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, elevation: 8 },
  sheetHandle: { width: 36, height: 4, backgroundColor: '#e0e0e0', borderRadius: 2, alignSelf: 'center', marginBottom: 12 },
  successMsg: { backgroundColor: '#81c784', borderRadius: 10, padding: 10, marginBottom: 10, color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  callInfoCard: { borderRadius: 14, padding: 14, marginBottom: 12 },
  callInfoTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  callInfoId: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  statusBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  callInfoPhone: { color: 'rgba(255,255,255,0.9)', fontSize: 13 },
  btnPrimary: { borderRadius: 28, paddingVertical: 14, alignItems: 'center', marginBottom: 8 },
  btnPrimaryText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  btnCancel: { borderWidth: 1.5, borderColor: '#e74c3c', borderRadius: 28, paddingVertical: 13, alignItems: 'center', marginBottom: 8 },
  btnCancelText: { color: '#e74c3c', fontSize: 15 },
  availableHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  availableTitle: { fontWeight: 'bold', fontSize: 14, flex: 1 },
  countBadge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 2 },
  countText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  noCallsRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12 },
  noCallsText: { fontSize: 13 },
  availableCard: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 0.5 },
  availableCardIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  availableCardInfo: { flex: 1 },
  availableCardId: { fontWeight: '600', fontSize: 13 },
  availableCardDist: { fontSize: 11, marginTop: 2 },
  qabulBtn: { borderRadius: 10, paddingHorizontal: 14, paddingVertical: 7 },
  qabulBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  bottomNav: { flexDirection: 'row', borderTopWidth: 0.5, paddingTop: 10, paddingBottom: 16, marginTop: 8 },
  navBtn: { flex: 1, alignItems: 'center', gap: 2 },
  navIconActive: { fontSize: 22 },
  navLabelActive: { fontSize: 10, fontWeight: '600' },
  navIcon: { fontSize: 22 },
  navLabel: { fontSize: 10 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalCard: { borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  modalTitle: { fontWeight: 'bold', fontSize: 17 },
  modalClose: { color: '#666', fontSize: 20 },
  modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  modalLabel: { fontSize: 13 },
  modalValue: { fontWeight: 'bold', fontSize: 13, maxWidth: '55%', textAlign: 'right' },
  acceptFull: { borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
  acceptFullText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  navAppBtn: { backgroundColor: '#e8f5e9', borderRadius: 12, padding: 16, flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 10 },
  navAppText: { fontSize: 16, fontWeight: '600', color: '#333' },
  modalBtnGhost: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: '#ddd', marginTop: 4 },
  cancelOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  cancelCard: { backgroundColor: '#fff', borderRadius: 20, padding: 28, alignItems: 'center', width: '100%' },
  cancelIcon: { fontSize: 48, marginBottom: 12 },
  cancelTitle: { fontSize: 20, fontWeight: '700', color: '#e74c3c', marginBottom: 8, textAlign: 'center' },
  cancelSub: { fontSize: 14, color: '#666', textAlign: 'center', marginBottom: 20, lineHeight: 20 },
  cancelBtn: { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 40 },
  cancelBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
});
