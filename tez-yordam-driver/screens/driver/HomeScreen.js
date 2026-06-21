import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, FlatList,
  Modal, Alert, ActivityIndicator, Linking, AppState,
} from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
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

// How long after a manual map interaction before auto-follow resumes
const RESUME_FOLLOW_MS = 4000;

// Google-Maps-navigator-style camera constants. Tilt is fixed during
// active navigation, and zoom eases based on current speed — matches
// the web driver app's camera behavior.
const NAV_TILT = 60;
const NAV_ZOOM_SLOW = 18.5;  // when stopped / very slow
const NAV_ZOOM_FAST = 16.5;  // at higher speed, zoom out a bit
const SPEED_FAST_MS = 12;    // m/s (~43 km/h) considered "fast"

const speedToZoom = (speedMs) => {

  if (speedMs === null || speedMs === undefined || isNaN(speedMs)) return NAV_ZOOM_SLOW;
  const clamped = Math.max(0, Math.min(speedMs, SPEED_FAST_MS));
  const t = clamped / SPEED_FAST_MS;
  return NAV_ZOOM_SLOW + (NAV_ZOOM_FAST - NAV_ZOOM_SLOW) * t;
};

// ── Kalman filter ─────────────────────────────────────────────────────────────
// Separate instance per axis (lat / lng). R = measurement noise, Q = process noise.
class KalmanFilter {
  constructor(R = 0.0001, Q = 0.00001) {
    this.R = R; this.Q = Q; this.P = 1; this.X = null; this.K = 0;
  }
  filter(z) {
    if (this.X === null) { this.X = z; return z; }
    this.P += this.Q;
    this.K = this.P / (this.P + this.R);
    this.X += this.K * (z - this.X);
    this.P *= (1 - this.K);
    return this.X;
  }
  reset(z) { this.X = z; this.P = 1; }
}

// ── Route-snap helpers ────────────────────────────────────────────────────────
function snapPointToSegment(p, a, b) {
  const dlat = b.latitude - a.latitude, dlng = b.longitude - a.longitude;
  const lenSq = dlat * dlat + dlng * dlng;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1,
    ((p.latitude - a.latitude) * dlat + (p.longitude - a.longitude) * dlng) / lenSq
  ));
  return { latitude: a.latitude + t * dlat, longitude: a.longitude + t * dlng };
}
function snapToPolyline(point, polyline, thresholdM = 40) {
  if (!polyline || polyline.length < 2) return point;
  let best = null, bestDist = Infinity;
  for (let i = 0; i < polyline.length - 1; i++) {
    const s = snapPointToSegment(point, polyline[i], polyline[i + 1]);
    const d = getDistanceKm(point.latitude, point.longitude, s.latitude, s.longitude) * 1000;
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return bestDist < thresholdM ? best : point;
}


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
  const [routeOrigin, setRouteOrigin]       = useState(null);
  const [completedPopup, setCompletedPopup] = useState(false);
  const [navModal, setNavModal]             = useState(false);
  const [markerCoords, setMarkerCoords]     = useState(null);

  const mapRef             = useRef(null);
  const locationRef        = useRef(null);
  const pollRef            = useRef(null);
  const activeCallRef      = useRef(null);
  const lastCompletedCallRef = useRef(null);
  const isFollowingRef     = useRef(true);
  const is3DRef            = useRef(true);
  const headingRef         = useRef(0);
  const userInteractingRef = useRef(false);
  const resumeFollowTimerRef = useRef(null);
  const prevStatusRef      = useRef(null);
  const mapReadyRef        = useRef(false);
  const handleMapInteractionRef = useRef(() => {});
  const cityFetchedRef     = useRef(false);
  const routeOriginRef      = useRef(null);
  const prevHeadingStateRef = useRef(0);
  const smoothedCoordsRef   = useRef(null);
  const prevAvailableKeyRef = useRef('');
  const markerRef           = useRef(null);
  const gpsTargetRef        = useRef(null);
  const displayCoordsRef    = useRef(null);
  const lastGpsTimeRef      = useRef(null);
  const locationSubRef      = useRef(null);
  const locationTimerRef    = useRef(null);
  const routeCoordsRef      = useRef([]);
  const offRouteStartRef    = useRef(null);
  const magHeadingRef       = useRef(null);
  const kalmanLatRef        = useRef(new KalmanFilter());
  const kalmanLngRef        = useRef(new KalmanFilter());


  useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);
  useEffect(() => { headingRef.current = driverHeading; }, [driverHeading]);

  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.first_name) setDriverName([data.first_name, data.last_name].filter(Boolean).join(' ')); })
      .catch(() => {});
  }, [token]);


  // pitch/zoom: if not provided, falls back to is3D toggle (idle) values.
  // Pass `speed` (m/s) during navigation for speed-based zoom easing.
  const moveCamera = (coords, heading, opts = {}) => {
    if (!mapRef.current) return;
    const { pitch, zoom, duration = 1000, speed } = opts;
    const resolvedZoom = zoom !== undefined ? zoom : speedToZoom(speed);
    mapRef.current.animateCamera(
      {
        center: coords,
        heading: heading,
        pitch: pitch !== undefined ? pitch : (is3DRef.current ? 50 : 0),
        zoom: resolvedZoom,
      },
      { duration }
    );
  };

  useEffect(() => {
    const startTracking = async () => {
      // Kill any existing subscription before restarting
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      smoothedCoordsRef.current = null; // reset jump-filter reference

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') { Alert.alert('Xato', 'Joylashuvga ruxsat bering'); return; }

      try {
        const initial = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.BestForNavigation,
          maximumAge: 0,
        });
        const coords = { latitude: initial.coords.latitude, longitude: initial.coords.longitude };
        const heading = initial.coords.heading ?? 0;
        setDriverLocation(coords);
        setDriverHeading(heading);
        locationRef.current = { ...coords, speed: 0 };
        headingRef.current = heading;
        smoothedCoordsRef.current = coords;
        kalmanLatRef.current.reset(coords.latitude);
        kalmanLngRef.current.reset(coords.longitude);
        gpsTargetRef.current = { ...coords };
        lastGpsTimeRef.current = Date.now();
        displayCoordsRef.current = { ...coords };
        setMarkerCoords({ ...coords });
        if (mapReadyRef.current) {
          moveCamera(coords, 0, { pitch: 0, zoom: 17, duration: 0 });
        }
      } catch {}

      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 500, distanceInterval: 0 },
        (loc) => {
          const raw = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
          const rawHeading = loc.coords.heading;
          const rawSpeed = loc.coords.speed;
          const speed = (rawSpeed !== null && rawSpeed !== undefined && !isNaN(rawSpeed) && rawSpeed >= 0) ? rawSpeed : 0;

          // Jump filter — discard readings that teleport >80m (GPS glitch)
          let coords;
          if (!smoothedCoordsRef.current) {
            smoothedCoordsRef.current = raw;
            kalmanLatRef.current.reset(raw.latitude);
            kalmanLngRef.current.reset(raw.longitude);
            coords = raw;
          } else {
            const jumpM = getDistanceKm(
              smoothedCoordsRef.current.latitude, smoothedCoordsRef.current.longitude,
              raw.latitude, raw.longitude
            ) * 1000;
            if (jumpM > 80) {
              coords = smoothedCoordsRef.current;
            } else {
              // Kalman filter on each axis — removes GPS noise without EMA lag
              const kLat = kalmanLatRef.current.filter(raw.latitude);
              const kLng = kalmanLngRef.current.filter(raw.longitude);
              coords = { latitude: kLat, longitude: kLng };
              smoothedCoordsRef.current = coords;
            }
          }

          // Snap to route polyline when navigating — keeps marker on the road
          if (activeCallRef.current?.status === 'on_the_way' && routeCoordsRef.current.length > 1) {
            const snapped = snapToPolyline(coords, routeCoordsRef.current, 40);
            // Off-route detection: if GPS is >40m from route for >5 seconds → reroute
            const distFromRoute = getDistanceKm(coords.latitude, coords.longitude, snapped.latitude, snapped.longitude) * 1000;
            if (distFromRoute > 40) {
              if (!offRouteStartRef.current) offRouteStartRef.current = Date.now();
              else if (Date.now() - offRouteStartRef.current > 5000) {
                offRouteStartRef.current = null;
                routeCoordsRef.current = [];
                routeOriginRef.current = coords;
                setRouteOrigin({ ...coords });
              }
            } else {
              offRouteStartRef.current = null;
              coords = snapped; // use road-snapped position
            }
          }

          // Heading: blend GPS heading (accurate at speed) with magnetometer (accurate when slow)
          let heading = headingRef.current;
          const gpsHeadingValid = speed > 3 && rawHeading !== null && rawHeading !== undefined && rawHeading >= 0;
          if (gpsHeadingValid) {
            const delta = rawHeading - heading;
            const shortDelta = ((delta + 540) % 360) - 180;
            if (Math.abs(shortDelta) > 5) heading = heading + shortDelta * 0.4;
          } else if (magHeadingRef.current !== null && speed <= 3) {
            // Use magnetometer when stopped or slow
            const delta = magHeadingRef.current - heading;
            const shortDelta = ((delta + 540) % 360) - 180;
            if (Math.abs(shortDelta) > 8) heading = heading + shortDelta * 0.3;
          }
          heading = ((heading % 360) + 360) % 360;

          locationRef.current = { ...coords, speed };
          headingRef.current = heading;
          gpsTargetRef.current = { ...coords };
          lastGpsTimeRef.current = Date.now();
          if (!gpsTargetRef.current) setMarkerCoords({ ...coords });

          if (Math.abs(heading - prevHeadingStateRef.current) > 15) {
            prevHeadingStateRef.current = heading;
            setDriverHeading(heading);
          }

          if (!locationTimerRef.current) {
            locationTimerRef.current = setTimeout(() => {
              setDriverLocation({ ...coords });
              locationTimerRef.current = null;
            }, 2000);
          }

          if (!routeOriginRef.current) {
            routeOriginRef.current = coords;
            setRouteOrigin({ ...coords });
          } else {
            const moved = getDistanceKm(
              routeOriginRef.current.latitude, routeOriginRef.current.longitude,
              coords.latitude, coords.longitude
            ) * 1000;
            if (moved > 30) {
              routeOriginRef.current = coords;
              setRouteOrigin({ ...coords });
            }
          }

          if (!cityFetchedRef.current) {
            cityFetchedRef.current = true;
            fetch(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${coords.latitude},${coords.longitude}&key=${GOOGLE_KEY}&language=uz`)
              .then(r => r.json())
              .then(data => {
                const components = data.results?.[0]?.address_components || [];
                const city = components.find(c => c.types.includes('locality'));
                const region = components.find(c => c.types.includes('administrative_area_level_1'));
                if (city?.long_name || region?.long_name) setCityName(city?.long_name || region?.long_name);
              }).catch(() => { cityFetchedRef.current = false; });
          }

          const navigatingNow = activeCallRef.current?.status === 'on_the_way';
          if (navigatingNow && isFollowingRef.current && !userInteractingRef.current) {
            moveCamera(coords, heading, { pitch: NAV_TILT, speed, duration: 600 });
          }
        }
      );
    };

    startTracking();

    // Restart location subscription whenever app returns to foreground —
    // Android kills watchPositionAsync when app is backgrounded with foreground-only
    // permission. Without this, the marker freezes permanently after the app is reopened.
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        lastGpsTimeRef.current = null;
        displayCoordsRef.current = null;
        kalmanLatRef.current = new KalmanFilter();
        kalmanLngRef.current = new KalmanFilter();
        routeCoordsRef.current = [];
        offRouteStartRef.current = null;
        startTracking();
      }
    });

    return () => {
      locationSubRef.current?.remove();
      locationSubRef.current = null;
      if (locationTimerRef.current) clearTimeout(locationTimerRef.current);
      appStateSub.remove();
    };
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
      }
      // Update after checking prev to avoid showing cancelled popup
      // when driver finishes a call and it disappears from assigned list
      prevStatusRef.current = call?.status || null;
      // Only update state when data actually changed — prevents re-renders every poll cycle
      const newCallKey = call ? `${call.id}-${call.status}` : 'null';
      const oldCallKey = activeCallRef.current ? `${activeCallRef.current.id}-${activeCallRef.current.status}` : 'null';
      if (newCallKey !== oldCallKey) {
        setActiveCall(call);
        activeCallRef.current = call;
      }
      const newAvailKey = (availableData.calls || []).map(c => c.id).join(',');
      if (newAvailKey !== prevAvailableKeyRef.current) {
        prevAvailableKeyRef.current = newAvailKey;
        setAvailableCalls(availableData.calls || []);
      }
      const nowNavigating = call?.status === 'on_the_way';
      setIsNavigating(nowNavigating);
      if (!call) { setRouteInfo(null); }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 5000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  useEffect(() => {
    return () => { if (resumeFollowTimerRef.current) clearTimeout(resumeFollowTimerRef.current); };
  }, []);


  // Predict-Correct smoothing loop (runs every 16ms ≈ 60fps).
  //
  // PREDICT: each tick the display position advances forward by speed × 16ms
  // in the current heading direction — the marker moves continuously even
  // between GPS updates (dead reckoning).
  //
  // CORRECT: a small 8% nudge pulls the display toward the last GPS fix,
  // preventing dead-reckoning drift without any visible jump. Over 500ms
  // (one GPS interval) this applies ~32 gentle corrections instead of one
  // big 30% snap, which is what caused the 0.5s jump before.
  //
  // Safety clamp: if dead reckoning somehow drifts >40m from GPS (e.g.
  // GPS correction lags badly) the display snaps 50% toward GPS immediately.
  useEffect(() => {
    const id = setInterval(() => {
      if (!gpsTargetRef.current) return;

      const speed  = locationRef.current?.speed || 0;
      const heading = headingRef.current;
      const gps    = gpsTargetRef.current;

      // First fix — initialise display at GPS position
      if (!displayCoordsRef.current) {
        displayCoordsRef.current = { ...gps };
        setMarkerCoords({ ...gps });
        return;
      }

      const c = displayCoordsRef.current;
      const DT = 0.016; // 16 ms

      // ── Predict ──────────────────────────────────────────────────────
      let next = { latitude: c.latitude, longitude: c.longitude };
      if (speed > 0.3) {
        const rad    = (heading * Math.PI) / 180;
        const latPerM = 1 / 111320;
        const lngPerM = 1 / (111320 * Math.cos(c.latitude * Math.PI / 180));
        next = {
          latitude:  c.latitude  + speed * DT * Math.cos(rad) * latPerM,
          longitude: c.longitude + speed * DT * Math.sin(rad) * lngPerM,
        };
      }

      // ── Correct ───────────────────────────────────────────────────────
      // Small 8% pull toward GPS each tick — smooth, no jump
      const ALPHA = 0.08;
      next = {
        latitude:  next.latitude  + ALPHA * (gps.latitude  - next.latitude),
        longitude: next.longitude + ALPHA * (gps.longitude - next.longitude),
      };

      // Safety clamp: if drifted too far, snap harder toward GPS
      const distM = getDistanceKm(next.latitude, next.longitude, gps.latitude, gps.longitude) * 1000;
      if (distM > 40) {
        next = {
          latitude:  c.latitude  + 0.5 * (gps.latitude  - c.latitude),
          longitude: c.longitude + 0.5 * (gps.longitude - c.longitude),
        };
      }

      displayCoordsRef.current = next;
      // animateMarkerToCoordinate runs on the Android native thread at 60fps —
      // no React re-render, no JS bridge overhead, no visible jump.
      if (markerRef.current) {
        markerRef.current.animateMarkerToCoordinate(next, 100);
      } else {
        setMarkerCoords({ ...next });
      }
    }, 16);
    return () => clearInterval(id);
  }, []);

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
      if (locationRef.current) moveCamera(locationRef.current, headingRef.current, { pitch: NAV_TILT, speed: locationRef.current.speed, duration: 1500 });
    }
  };

  const handleArrived = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/arrived/${activeCall.id}`);
    if (ok) {
      setRouteInfo(null); setIsNavigating(false); setIsFollowing(true); showMsg(t.statusArrived);
      if (locationRef.current) moveCamera(locationRef.current, 0, { pitch: is3DRef.current ? 35 : 0, zoom: 15, duration: 1000 });
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
    if (resumeFollowTimerRef.current) { clearTimeout(resumeFollowTimerRef.current); resumeFollowTimerRef.current = null; }
    setIsFollowing(true); isFollowingRef.current = true; userInteractingRef.current = false;
    if (locationRef.current) {
      if (isNavigating) {
        moveCamera(locationRef.current, headingRef.current, { pitch: NAV_TILT, speed: locationRef.current.speed, duration: 1000 });
      } else {
        moveCamera(locationRef.current, 0, { pitch: is3DRef.current ? 35 : 0, zoom: 17, duration: 1000 });
      }
    }
  };

  const toggle3D = () => {
    const new3D = !is3D; setIs3D(new3D); is3DRef.current = new3D;
    if (mapRef.current && locationRef.current) {
      const navigatingNow = activeCallRef.current?.status === 'on_the_way';
      moveCamera(locationRef.current, headingRef.current, {
        pitch: new3D ? (navigatingNow ? NAV_TILT : 35) : 0,
        duration: 600,
      });
    }
  };

  // Only treat real user drags/zooms as "manual interaction" (onPanDrag),
  // not every touch. When idle (no active "on the way" call), manual
  // pan/zoom stays free indefinitely — tap "Markazga" to recenter, like
  // Google/Yandex driver apps. When navigating, auto-resume following
  // after a short pause.
  const handleMapInteraction = () => {
    userInteractingRef.current = true; setIsFollowing(false); isFollowingRef.current = false;
    if (resumeFollowTimerRef.current) clearTimeout(resumeFollowTimerRef.current);

    const navigatingNow = activeCallRef.current?.status === 'on_the_way';
    if (!navigatingNow) return;

    resumeFollowTimerRef.current = setTimeout(() => {
      userInteractingRef.current = false;
      setIsFollowing(true); isFollowingRef.current = true;
      if (locationRef.current) {
        moveCamera(locationRef.current, headingRef.current, {
          pitch: NAV_TILT,
          speed: locationRef.current.speed,
          duration: 1000,
        });
      }
    }, RESUME_FOLLOW_MS);
  };
  handleMapInteractionRef.current = handleMapInteraction;

  const statusInfo = activeCall ? (STATUS_LABELS[activeCall.status] || { label: activeCall.status, color: '#7f8c8d' }) : null;
  const distanceKm = activeCall && locationRef.current ? getDistanceKm(locationRef.current.latitude, locationRef.current.longitude, parseFloat(activeCall.latitude), parseFloat(activeCall.longitude)).toFixed(1) : null;
  const showRoute = activeCall?.status === 'on_the_way' && !!routeOrigin;
  const initialRegion = driverLocation ? { ...driverLocation, latitudeDelta: 0.05, longitudeDelta: 0.05 } : { latitude: 41.2995, longitude: 69.2401, latitudeDelta: 0.1, longitudeDelta: 0.1 };

  const onMapReady = () => {
    mapReadyRef.current = true;
    if (locationRef.current) {
      moveCamera(locationRef.current, 0, { pitch: 0, zoom: 17, duration: 0 });
    }
  };

  return (
    <View style={[s.safe, { paddingTop: insets.top }]}>

      {/* Completion Success Popup */}
      <Modal visible={completedPopup} transparent animationType="fade">
        <View style={s.cancelOverlay}>
          <View style={s.cancelCard}>
            <Text style={s.cancelIcon}>✅</Text>
            <Text style={[s.cancelTitle, { color: '#27ae60' }]}>{t.completedTitle || 'Muvaffaqiyatli yakunlandi!'}</Text>
            <Text style={s.cancelSub}>{t.completedMsg || 'Chaqiruv muvaffaqiyatli yakunlandi. Yangi chaqiruvlarni kuting.'}</Text>
            <TouchableOpacity
              style={[s.cancelBtn, { backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#f39c12', marginBottom: 8 }]}
              onPress={() => {
                setCompletedPopup(false);
                navigation.navigate('DriverFeedback', {
                  emergencyId: lastCompletedCallRef.current,
                  type: 'driver',
                  afterCall: true,
                  homeScreen: 'DriverHome',
                });
              }}
            >
              <Text style={[s.cancelBtnText, { color: '#f39c12' }]}>⭐ {t.rateCall || 'Chaqiruvni baholash'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.cancelBtn, { backgroundColor: '#27ae60' }]} onPress={() => setCompletedPopup(false)}>
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
          mapType={is3D ? 'hybrid' : 'standard'}
          showsUserLocation={false} showsMyLocationButton={false} showsCompass={true} showsTraffic={true} showsBuildings={true}
          rotateEnabled={true} pitchEnabled={true} onMapReady={onMapReady}
          onPanDrag={() => handleMapInteractionRef.current()} onRegionChangeComplete={() => {}}>
          {markerCoords && (
            <Marker ref={markerRef} coordinate={markerCoords} anchor={{ x: 0.5, y: 0.5 }} flat rotation={driverHeading}>
              {isNavigating
                ? <View style={[s.navArrow, { backgroundColor: accentColor }]}><Text style={s.navArrowText}>▲</Text></View>
                : <View style={[s.driverMarker, { borderColor: accentColor }]}><Text style={{ fontSize: 20 }}>{markerEmoji}</Text></View>}
            </Marker>
          )}
          {activeCall && <Marker coordinate={{ latitude: parseFloat(activeCall.latitude), longitude: parseFloat(activeCall.longitude) }} pinColor="red" />}
          {!activeCall && availableCalls.map((call) => (
            <Marker key={call.id} coordinate={{ latitude: parseFloat(call.latitude), longitude: parseFloat(call.longitude) }} pinColor="orange" onPress={() => setSelectedCall(call)} />
          ))}
          {showRoute && (
            <MapViewDirections key={`route-${activeCall?.id}`} origin={routeOrigin} destination={{ latitude: parseFloat(activeCall.latitude), longitude: parseFloat(activeCall.longitude) }}
              apikey={GOOGLE_KEY} strokeWidth={isNavigating ? 10 : 5} strokeColor="#e74c3c"
              resetOnChange={false}
              onReady={(r) => {
                setRouteInfo({ distance: r.distance.toFixed(1) + ' km', duration: Math.round(r.duration) + ' daqiqa' });
                routeCoordsRef.current = r.coordinates || [];
                offRouteStartRef.current = null;
              }}
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

        <TouchableOpacity style={[s.bellBtn, { backgroundColor: accentColor }]} onPress={() => navigation.navigate('DriverHistory')}>
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
          <TouchableOpacity style={s.locateBtn} onPress={handleReCenter}>
            <Text style={{ fontSize: 20 }}>📍</Text>
          </TouchableOpacity>
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
              <Text style={[s.availableTitle, { color: theme.text }]}>📋 {t.availableCalls || 'Mavjud chaqiruvlar'}</Text>
              <View style={[s.countBadge, { backgroundColor: accentColor }]}><Text style={s.countText}>{availableCalls.length}</Text></View>
            </View>
            {availableCalls.length === 0 ? (
              <View style={s.noCallsRow}><ActivityIndicator color={accentColor} size="small" style={{ marginRight: 8 }} /><Text style={[s.noCallsText, { color: theme.textSub }]}>{t.updating}</Text></View>
            ) : (
              <FlatList data={availableCalls} keyExtractor={(item) => String(item.id)} style={{ maxHeight: 180 }}
                renderItem={({ item }) => {
                  const dist = driverLocation ? getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(item.latitude), parseFloat(item.longitude)).toFixed(1) : null;
                  return (
                    <View style={[s.availableCard, { backgroundColor: theme.cardBg, borderColor: theme.cardBorder }]}>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => setSelectedCall(item)} activeOpacity={0.7}>
                        <View style={[s.availableCardIcon, { backgroundColor: '#e3f2fd' }]}><Text style={{ fontSize: 18 }}>{markerEmoji}</Text></View>
                        <View style={s.availableCardInfo}>
                          <Text style={[s.availableCardId, { color: theme.text }]}>Chaqiruv #{item.id}</Text>
                          <Text style={[s.availableCardDist, { color: theme.textSub }]}>{dist ? dist + ' km' : item.caller_phone}</Text>
                        </View>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.qabulBtn, { backgroundColor: accentColor }]} onPress={() => handleAccept(item.id)} disabled={loading}>
                        <Text style={s.qabulBtnText}>Qabul</Text>
                      </TouchableOpacity>
                    </View>
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

export default function DriverHomeScreen(props) {
  return <DriverScreen {...props} accentColor="#4fc3f7" markerColor="#4fc3f7" markerEmoji="🚑" />;
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
