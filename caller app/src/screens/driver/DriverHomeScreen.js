import React, { useState, useEffect, useRef, useCallback } from 'react';
import '../../styles/driver/DriverHomeScreen.css';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000';
const GOOGLE_KEY = process.env.REACT_APP_GOOGLE_MAPS_KEY;

function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const STATUS_LABELS = {
  assigned:   { label: 'Qabul qilindi', color: '#2980b9' },
  on_the_way: { label: "Yo'lda",        color: '#f39c12' },
  arrived:    { label: 'Keldi',          color: '#27ae60' },
  completed:  { label: 'Tugatildi',      color: '#9b59b6' },
};

// How long after a manual map interaction before auto-follow resumes
const RESUME_FOLLOW_MS = 4000;

function DriverScreen({ token, user, onLogout, onProfile, onNotifications, onFeedback, accentColor = '#4fc3f7', markerEmoji = '🚑' }) {
  const [activeCall, setActiveCall] = useState(null);
  const [availableCalls, setAvailableCalls] = useState([]);
  const [driverLocation, setDriverLocation] = useState(null);
  const [driverHeading, setDriverHeading] = useState(0);
  const [selectedCall, setSelectedCall] = useState(null);
  const [loading, setLoading] = useState(false);
  const [routeInfo, setRouteInfo] = useState(null);
  const [statusMsg, setStatusMsg] = useState('');
  const [isNavigating, setIsNavigating] = useState(false);
  const [isFollowing, setIsFollowing] = useState(true);
  const [is3D, setIs3D] = useState(true);
  const [driverName, setDriverName] = useState([user?.first_name, user?.last_name].filter(Boolean).join(' ') || '');
  const [cityName, setCityName] = useState('');
  const [completedPopup, setCompletedPopup] = useState(false);
  const [navModal, setNavModal] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  const mapDivRef = useRef(null);
  const gMapRef = useRef(null);
  const markerRef = useRef(null);
  const navArrowIconRef = useRef(null);
  const driverIconRef = useRef(null);
  const activeCallMarkerRef = useRef(null);
  const availableMarkersRef = useRef({});
  const directionsServiceRef = useRef(null);
  const directionsRendererRef = useRef(null);

  const locationRef = useRef(null);
  const pollRef = useRef(null);
  const activeCallRef = useRef(null);
  const lastCompletedCallRef = useRef(null);
  const isFollowingRef = useRef(true);
  const is3DRef = useRef(true);
  const headingRef = useRef(0);
  const userInteractingRef = useRef(false);
  const resumeFollowTimerRef = useRef(null);
  const handleMapInteractionRef = useRef(() => {});
  const prevStatusRef = useRef(null);
  const watchIdRef = useRef(null);
  const cityFetchedRef = useRef(false);

  useEffect(() => { isFollowingRef.current = isFollowing; }, [isFollowing]);
  useEffect(() => { is3DRef.current = is3D; }, [is3D]);
  useEffect(() => { headingRef.current = driverHeading; }, [driverHeading]);

  // Re-center the camera on the driver's last known position whenever the
  // app/tab becomes visible again (e.g. after closing and reopening
  // Telegram). Without this, the map can be left showing a stale view
  // while the driver marker itself keeps updating in the background.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (!gMapRef.current || !locationRef.current) return;
      const navigatingNow = activeCallRef.current?.status === 'on_the_way';
      moveCamera(locationRef.current, headingRef.current, {
        pitch: navigatingNow ? NAV_TILT : (is3DRef.current ? 35 : 0),
        zoom: navigatingNow ? undefined : 17,
        speed: navigatingNow ? locationRef.current.speed : undefined,
        instant: true,
      });
      if (navigatingNow) {
        setIsFollowing(true); isFollowingRef.current = true; userInteractingRef.current = false;
      }
    };
    document.addEventListener('visibilitychange', handleVisibility);
    window.addEventListener('focus', handleVisibility);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility);
      window.removeEventListener('focus', handleVisibility);
    };
  }, []);

  // Fetch driver's own profile name
  useEffect(() => {
    fetch(`${API_URL}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => { if (data.first_name) setDriverName([data.first_name, data.last_name].filter(Boolean).join(' ')); })
      .catch(() => {});
  }, [token]);

  // ── Google Maps script loader ──────────────────────────────────
  useEffect(() => {
    if (window.google?.maps) { initMap(); return; }
    if (document.querySelector('script[src*="maps.googleapis.com"]')) {
      const wait = setInterval(() => { if (window.google?.maps) { clearInterval(wait); initMap(); } }, 100);
      return () => clearInterval(wait);
    }
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_KEY}&language=uz&libraries=geometry`;
    script.async = true;
    script.onload = initMap;
    document.head.appendChild(script);
  }, []);

  const initMap = () => {
    if (!mapDivRef.current || gMapRef.current) return;
    const map = new window.google.maps.Map(mapDivRef.current, {
      center: { lat: 41.2995, lng: 69.2401 },
      zoom: 17,
      tilt: is3DRef.current ? 45 : 0,
      heading: 0,
      mapId: 'f12f7e536f33ab1d4a3fa19d',
      disableDefaultUI: true,
      gestureHandling: 'greedy',
      mapTypeControl: false,
    });
    gMapRef.current = map;

    // Detect manual user interaction via direct touch/mouse listeners on
    // the map container. This fires immediately on touch-start, before
    // Google Maps' internal drag detection — and avoids stale-closure
    // issues with map.addListener('dragstart', ...) which can fail to
    // fire reliably once moveCamera() is being called frequently from
    // the GPS watch loop (e.g. during active navigation).
    const interactionHandler = () => handleMapInteractionRef.current();
    mapDivRef.current.addEventListener('mousedown', interactionHandler, { passive: true });
    mapDivRef.current.addEventListener('touchstart', interactionHandler, { passive: true });

    directionsServiceRef.current = new window.google.maps.DirectionsService();

    setMapReady(true);

    if (locationRef.current) {
      moveCamera(locationRef.current, headingRef.current, { instant: true, zoom: 17 });
    }
  };

  // ── Camera control ──────────────────────────────────────────────
  // Google-Maps-navigator-style camera: center always tracks GPS position,
  // heading follows direction of travel (not device compass), tilt is a
  // fixed ~60° during active navigation, zoom eases based on speed, and
  // everything is interpolated smoothly via requestAnimationFrame instead
  // of jumping on each ~1s GPS update.
  const cameraAnimRef = useRef(null);
  const cameraStateRef = useRef({ lat: 41.2995, lng: 69.2401, heading: 0, tilt: 0, zoom: 17 });

  const NAV_TILT = 60;
  const NAV_ZOOM_SLOW = 18.5;   // when stopped / very slow
  const NAV_ZOOM_FAST = 16.5;   // at higher speed, zoom out a bit
  const SPEED_FAST_MS = 12;     // m/s (~43 km/h) considered "fast"

  const speedToZoom = (speedMs) => {
    if (speedMs === null || speedMs === undefined || isNaN(speedMs)) return NAV_ZOOM_SLOW;
    const clamped = Math.max(0, Math.min(speedMs, SPEED_FAST_MS));
    const t = clamped / SPEED_FAST_MS;
    return NAV_ZOOM_SLOW + (NAV_ZOOM_FAST - NAV_ZOOM_SLOW) * t;
  };

  const moveCamera = (coords, heading, opts = {}) => {
    if (!gMapRef.current) return;
    const { pitch, zoom, instant = false, speed } = opts;
    // 2D mode always wins — even when navigation passes explicit pitch
    const targetTilt = !is3DRef.current ? 0 : (pitch !== undefined ? pitch : 45);
    const targetZoom = zoom !== undefined ? zoom : speedToZoom(speed);
    const targetHeading = ((heading || 0) % 360 + 360) % 360;

    if (instant) {
      if (cameraAnimRef.current) { cancelAnimationFrame(cameraAnimRef.current); cameraAnimRef.current = null; }
      cameraStateRef.current = { lat: coords.latitude, lng: coords.longitude, heading: targetHeading, tilt: targetTilt, zoom: targetZoom };
      gMapRef.current.moveCamera({
        center: { lat: coords.latitude, lng: coords.longitude },
        zoom: targetZoom, heading: targetHeading, tilt: targetTilt,
      });
      return;
    }

    const start = { ...cameraStateRef.current };
    let headingDelta = targetHeading - start.heading;
    if (headingDelta > 180) headingDelta -= 360;
    if (headingDelta < -180) headingDelta += 360;

    const target = {
      lat: coords.latitude,
      lng: coords.longitude,
      heading: start.heading + headingDelta,
      tilt: targetTilt,
      zoom: targetZoom,
    };

    if (cameraAnimRef.current) cancelAnimationFrame(cameraAnimRef.current);

    const DURATION_MS = 900; // matches ~1s GPS update interval for continuous smooth motion
    const startTime = performance.now();
    const from = { ...start };

    const tick = (now) => {
      const t = Math.min(1, (now - startTime) / DURATION_MS);
      const ease = t; // linear — keeps pace with steady GPS updates
      const lat = from.lat + (target.lat - from.lat) * ease;
      const lng = from.lng + (target.lng - from.lng) * ease;
      const tilt = from.tilt + (target.tilt - from.tilt) * ease;
      const zm = from.zoom + (target.zoom - from.zoom) * ease;
      const hd = ((from.heading + (target.heading - from.heading) * ease) % 360 + 360) % 360;

      cameraStateRef.current = { lat, lng, heading: hd, tilt, zoom: zm };
      gMapRef.current.moveCamera({ center: { lat, lng }, zoom: zm, heading: hd, tilt });

      if (t < 1) {
        cameraAnimRef.current = requestAnimationFrame(tick);
      } else {
        cameraAnimRef.current = null;
        cameraStateRef.current = { lat: target.lat, lng: target.lng, heading: ((target.heading % 360) + 360) % 360, tilt: target.tilt, zoom: target.zoom };
      }
    };
    cameraAnimRef.current = requestAnimationFrame(tick);
  };

  // ── Driver marker (with rotation for nav arrow) ──────────────────
  const updateDriverMarker = (coords, heading) => {
    if (!gMapRef.current || !window.google) return;
    const navigatingNow = activeCallRef.current?.status === 'on_the_way';
    const pos = { lat: coords.latitude, lng: coords.longitude };

    // The camera itself rotates to match the driver's heading (Google-Maps-
    // navigator style), so the nav arrow icon should always point straight
    // up on screen — rotating the icon image too would double-apply the
    // rotation and desync it from the camera's smooth animation.
    const iconSvg = navigatingNow
      ? `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="44" viewBox="0 0 44 44">
           <circle cx="22" cy="22" r="20" fill="${accentColor}" stroke="#fff" stroke-width="3"/>
           <path d="M22 8 L30 30 L22 25 L14 30 Z" fill="#fff"/>
         </svg>`
      : `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40">
           <circle cx="20" cy="20" r="18" fill="#fff" stroke="${accentColor}" stroke-width="2"/>
           <text x="20" y="27" text-anchor="middle" font-size="18">${markerEmoji}</text>
         </svg>`;

    const icon = {
      url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(iconSvg),
      scaledSize: new window.google.maps.Size(navigatingNow ? 44 : 40, navigatingNow ? 44 : 40),
      anchor: new window.google.maps.Point(navigatingNow ? 22 : 20, navigatingNow ? 22 : 20),
    };

    if (markerRef.current) {
      markerRef.current.setPosition(pos);
      markerRef.current.setIcon(icon);
    } else {
      markerRef.current = new window.google.maps.Marker({
        position: pos, map: gMapRef.current, icon, zIndex: 999,
      });
    }
  };

  // ── Live GPS tracking via watchPosition ──────────────────────────
  useEffect(() => {
    if (!navigator.geolocation) return;

    // Get an initial fix immediately so the map centers correctly on first load
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const heading = pos.coords.heading || 0;
        setDriverLocation(coords);
        setDriverHeading(heading);
        locationRef.current = { ...coords, speed: 0 };
        headingRef.current = heading;
        if (gMapRef.current) {
          updateDriverMarker(coords, heading);
          moveCamera(coords, heading, { instant: true, zoom: 17 });
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
        const rawHeading = pos.coords.heading;
        const heading = (rawHeading !== null && rawHeading !== undefined && !isNaN(rawHeading)) ? rawHeading : headingRef.current;
        const speed = (pos.coords.speed !== null && pos.coords.speed !== undefined && !isNaN(pos.coords.speed)) ? pos.coords.speed : 0;

        setDriverLocation(coords);
        setDriverHeading(heading);
        locationRef.current = { ...coords, speed };
        headingRef.current = heading;

        if (gMapRef.current) updateDriverMarker(coords, heading);

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

        // Only auto-follow the driver's position while actively navigating
        // to a call ("on_the_way"). When idle, the map behaves like a normal
        // free map — no camera snapping — matching Google/Yandex driver apps.
        const navigatingNow = activeCallRef.current?.status === 'on_the_way';
        if (navigatingNow && isFollowingRef.current && !userInteractingRef.current) {
          // Fixed ~60° tilt and speed-based zoom during active navigation —
          // matches Google Maps navigator camera behavior.
          moveCamera(coords, heading, { pitch: NAV_TILT, speed });
        }
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 10000 }
    );

    return () => {
      if (watchIdRef.current !== null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  // ── Poll active/available calls ──────────────────────────────────
  const fetchData = useCallback(async () => {
    try {
      const [assignedRes, availableRes] = await Promise.all([
        fetch(`${API_URL}/api/driver/assigned-call`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_URL}/api/driver/available-calls`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const assignedData = await assignedRes.json();
      const availableData = await availableRes.json();
      const call = assignedData.call || null;

      const prev = prevStatusRef.current;
      if (prev === 'arrived' && (!call || call.status === 'completed')) {
        setCompletedPopup(true);
        lastCompletedCallRef.current = activeCallRef.current?.id || null;
      }
      // Track completed separately to avoid showing cancelled popup
      // when driver finishes a call and it disappears from assigned list
      prevStatusRef.current = call?.status || null;

      setActiveCall(call);
      activeCallRef.current = call;
      setAvailableCalls(availableData.calls || []);

      if (!call) { setRouteInfo(null); setIsNavigating(false); }
      if (call?.status === 'on_the_way') {
        setIsNavigating(true);
        if (isFollowingRef.current && locationRef.current && !userInteractingRef.current) {
          moveCamera(locationRef.current, headingRef.current, { pitch: NAV_TILT, speed: locationRef.current.speed });
        }
      } else if (!call || call.status !== 'on_the_way') {
        setIsNavigating(false);
      }
    } catch {}
  }, [token]);

  useEffect(() => {
    fetchData();
    pollRef.current = setInterval(fetchData, 3000);
    return () => clearInterval(pollRef.current);
  }, [fetchData]);

  useEffect(() => {
    return () => {
      if (resumeFollowTimerRef.current) clearTimeout(resumeFollowTimerRef.current);
      if (cameraAnimRef.current) cancelAnimationFrame(cameraAnimRef.current);
    };
  }, []);

  // ── Map interaction handling (manual pan/zoom pauses follow mode) ─
  const handleMapInteraction = () => {
    userInteractingRef.current = true;
    setIsFollowing(false); isFollowingRef.current = false;
    if (resumeFollowTimerRef.current) clearTimeout(resumeFollowTimerRef.current);

    // Only auto-resume following if actively navigating to a call.
    // When idle, manual pan/zoom stays free indefinitely — tap
    // "Markazga" to recenter manually, like Google/Yandex driver apps.
    const navigatingNow = activeCallRef.current?.status === 'on_the_way';
    if (!navigatingNow) return;

    resumeFollowTimerRef.current = setTimeout(() => {
      userInteractingRef.current = false;
      setIsFollowing(true); isFollowingRef.current = true;
      if (locationRef.current) {
        moveCamera(locationRef.current, headingRef.current, {
          pitch: NAV_TILT,
          speed: locationRef.current.speed,
        });
      }
    }, RESUME_FOLLOW_MS);
  };
  handleMapInteractionRef.current = handleMapInteraction;

  const handleReCenter = () => {
    if (resumeFollowTimerRef.current) { clearTimeout(resumeFollowTimerRef.current); resumeFollowTimerRef.current = null; }
    setIsFollowing(true); isFollowingRef.current = true; userInteractingRef.current = false;
    if (locationRef.current) {
      moveCamera(locationRef.current, isNavigating ? headingRef.current : 0, {
        pitch: isNavigating ? NAV_TILT : (is3DRef.current ? 35 : 0),
        zoom: isNavigating ? undefined : 17,
        speed: isNavigating ? locationRef.current.speed : undefined,
        instant: true,
      });
    }
  };

  const toggle3D = () => {
    const new3D = !is3D;
    setIs3D(new3D);
    is3DRef.current = new3D;
    if (gMapRef.current && locationRef.current) {
      const navigatingNow = activeCallRef.current?.status === 'on_the_way';
      moveCamera(locationRef.current, headingRef.current, {
        pitch: new3D ? (navigatingNow ? NAV_TILT : 35) : 0,
        instant: true,
      });
    }
  };

  // ── Immediately redraw driver icon when status changes (on_the_way ↔ other) ──
  useEffect(() => {
    if (!locationRef.current || !mapReady) return;
    updateDriverMarker(locationRef.current, headingRef.current);
  }, [activeCall?.status, mapReady]);

  // ── Active call marker + route ────────────────────────────────────
  useEffect(() => {
    if (!gMapRef.current || !window.google) return;

    if (activeCall) {
      const pos = { lat: parseFloat(activeCall.latitude), lng: parseFloat(activeCall.longitude) };
      if (activeCallMarkerRef.current) {
        activeCallMarkerRef.current.setPosition(pos);
      } else {
        activeCallMarkerRef.current = new window.google.maps.Marker({
          position: pos, map: gMapRef.current,
          icon: { url: 'http://maps.google.com/mapfiles/ms/icons/red-dot.png' },
        });
      }
      // Clear available-call markers when there's an active call
      Object.values(availableMarkersRef.current).forEach(m => m.setMap(null));
      availableMarkersRef.current = {};
    } else {
      if (activeCallMarkerRef.current) { activeCallMarkerRef.current.setMap(null); activeCallMarkerRef.current = null; }
      if (directionsRendererRef.current) { directionsRendererRef.current.setMap(null); directionsRendererRef.current = null; }
      // Draw available-call markers
      const currentIds = new Set(availableCalls.map(c => String(c.id)));
      Object.keys(availableMarkersRef.current).forEach(id => {
        if (!currentIds.has(id)) { availableMarkersRef.current[id].setMap(null); delete availableMarkersRef.current[id]; }
      });
      availableCalls.forEach(call => {
        const pos = { lat: parseFloat(call.latitude), lng: parseFloat(call.longitude) };
        const id = String(call.id);
        if (availableMarkersRef.current[id]) {
          availableMarkersRef.current[id].setPosition(pos);
        } else {
          const marker = new window.google.maps.Marker({
            position: pos, map: gMapRef.current,
            icon: { url: 'http://maps.google.com/mapfiles/ms/icons/orange-dot.png' },
          });
          marker.addListener('click', () => setSelectedCall(call));
          availableMarkersRef.current[id] = marker;
        }
      });
    }
  }, [activeCall, availableCalls, mapReady]);

  // ── Route to active call when on_the_way ─────────────────────────
  useEffect(() => {
    if (!gMapRef.current || !directionsServiceRef.current || !window.google) return;
    const showRoute = activeCall?.status === 'on_the_way' && driverLocation;

    // Clear existing route polyline
    if (directionsRendererRef.current) {
      directionsRendererRef.current.setMap(null);
      directionsRendererRef.current = null;
    }

    if (!showRoute) return;

    let stale = false;

    directionsServiceRef.current.route({
      origin: { lat: driverLocation.latitude, lng: driverLocation.longitude },
      destination: { lat: parseFloat(activeCall.latitude), lng: parseFloat(activeCall.longitude) },
      travelMode: window.google.maps.TravelMode.DRIVING,
    }, (result, status) => {
      if (stale || status !== 'OK') return;
      const leg = result.routes[0].legs[0];
      setRouteInfo({ distance: leg.distance.text, duration: leg.duration.text });

      const path = window.google.maps.geometry
        ? window.google.maps.geometry.encoding.decodePath(result.routes[0].overview_polyline)
        : result.routes[0].legs.flatMap(l => l.steps.flatMap(s => [s.start_location, s.end_location]));

      const polyline = new window.google.maps.Polyline({
        path,
        map: gMapRef.current,
        strokeColor: isNavigating ? accentColor : '#e74c3c',
        strokeWeight: isNavigating ? 8 : 5,
        strokeOpacity: 0.85,
      });
      directionsRendererRef.current = polyline;
    });

    return () => {
      stale = true;
      if (directionsRendererRef.current) {
        directionsRendererRef.current.setMap(null);
        directionsRendererRef.current = null;
      }
    };
  }, [activeCall?.status, driverLocation, isNavigating]);

  // ── Action API calls ──────────────────────────────────────────────
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
    } catch (err) { window.alert('Xato: ' + err.message); return false; }
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
      showMsg('Qabul qilindi');
      await fetchData();
    } catch (err) { window.alert('Xato: ' + err.message); }
    finally { setLoading(false); }
  };

  const handleStart = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/start/${activeCall.id}`);
    if (ok) {
      showMsg("Yo'lda"); setIsNavigating(true); setIsFollowing(true); isFollowingRef.current = true;
      if (locationRef.current) moveCamera(locationRef.current, headingRef.current, { pitch: NAV_TILT, speed: locationRef.current.speed, instant: true });
    }
  };

  const handleArrived = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/arrived/${activeCall.id}`);
    if (ok) {
      setRouteInfo(null); setIsNavigating(false); setIsFollowing(true); showMsg('Keldi');
      if (locationRef.current) moveCamera(locationRef.current, 0, { pitch: is3DRef.current ? 35 : 0, zoom: 15 });
    }
  };

  const handleComplete = async () => {
    const ok = await apiAction(`${API_URL}/api/driver/complete/${activeCall.id}`);
    if (ok) { setRouteInfo(null); setIsNavigating(false); showMsg('Tugatildi'); }
  };

  const handleCancel = () => {
    if (!window.confirm("Chaqiruvni bekor qilmoqchimisiz?")) return;
    apiAction(`${API_URL}/api/driver/cancel/${activeCall.id}`).then(ok => {
      if (ok) { setRouteInfo(null); setIsNavigating(false); showMsg('Bekor qilindi'); }
    });
  };

  // ── External navigation handoff ──────────────────────────────────
  const openNavigation = (app) => {
    if (!activeCall) return;
    const lat = parseFloat(activeCall.latitude);
    const lng = parseFloat(activeCall.longitude);
    const url = app === 'google'
      ? `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving`
      : `https://yandex.com/maps/?rtext=~${lat},${lng}&rtt=auto`;
    window.open(url, '_blank');
    setNavModal(false);
  };

  const statusInfo = activeCall ? (STATUS_LABELS[activeCall.status] || { label: activeCall.status, color: '#7f8c8d' }) : null;
  const distanceKm = activeCall && driverLocation
    ? getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(activeCall.latitude), parseFloat(activeCall.longitude)).toFixed(1)
    : null;

  return (
    <div className="dh-safe">
      {/* Cancellation popup */}

      {/* Completion success popup */}
      {completedPopup && (
        <div className="dh-cancel-overlay">
          <div className="dh-cancel-card">
            <div className="dh-cancel-icon">✅</div>
            <h2 className="dh-cancel-title" style={{ color: '#27ae60' }}>Muvaffaqiyatli yakunlandi!</h2>
            <p className="dh-cancel-sub">Chaqiruv muvaffaqiyatli yakunlandi. Yangi chaqiruvlarni kuting.</p>
            <button className="dh-cancel-btn" style={{ background: '#fff', border: '1.5px solid #f39c12', color: '#f39c12', marginBottom: 8 }} onClick={() => { setCompletedPopup(false); onFeedback && onFeedback(lastCompletedCallRef.current); }}>⭐ Baholash</button>
            <button className="dh-cancel-btn" style={{ background: '#27ae60' }} onClick={() => setCompletedPopup(false)}>OK</button>
          </div>
        </div>
      )}

      {/* Navigation app modal */}
      {navModal && (
        <div className="dh-modal-overlay" onClick={() => setNavModal(false)}>
          <div className="dh-modal-card" onClick={e => e.stopPropagation()}>
            <h3 className="dh-modal-title">🗺️ Navigatsiya ilovasini tanlang</h3>
            <button className="dh-nav-app-btn" onClick={() => openNavigation('google')}>
              <span style={{ fontSize: 24 }}>🌍</span>
              <span className="dh-nav-app-text">Google Maps</span>
            </button>
            <button className="dh-nav-app-btn yellow" onClick={() => openNavigation('yandex')}>
              <span style={{ fontSize: 24 }}>🟡</span>
              <span className="dh-nav-app-text">Yandex Maps</span>
            </button>
            <button className="dh-modal-btn-ghost" onClick={() => setNavModal(false)}>Bekor</button>
          </div>
        </div>
      )}

      {/* Map */}
      <div className="dh-map-container">
        <div ref={mapDivRef} className="dh-map" />

        {activeCall && (routeInfo || distanceKm) && (
          <div className="dh-header-pill-wrapper">
            <div className="dh-eta-pill">
              <span>⏱ {routeInfo?.duration || '—'}</span>
              <span className="dh-eta-sep">•</span>
              <span>📍 {routeInfo?.distance || (distanceKm + ' km')}</span>
            </div>
          </div>
        )}

        {!activeCall && (
          <div className="dh-header-pill-wrapper">
            <div className="dh-header-pill">
              {driverName && <p className="dh-header-pill-text">Salom, {driverName}</p>}
              <p className="dh-header-pill-sub">📍 {cityName ? `${cityName}, O'zbekiston` : "O'zbekiston"}</p>
            </div>
          </div>
        )}

        <button className="dh-bell-btn" style={{ background: accentColor }} onClick={onNotifications}>
          🔔
          {availableCalls.length > 0 && <div className="dh-bell-dot" />}
        </button>

        {activeCall && (
          <button className="dh-nav-ext-btn" onClick={() => setNavModal(true)}>🗺️</button>
        )}

        {!isFollowing && (
          <div className="dh-left-buttons">
            <button className="dh-recenter-btn" style={{ color: accentColor }} onClick={handleReCenter}>
              <span className="dh-recenter-icon">▲</span>
              <span>Markazga</span>
            </button>
          </div>
        )}

        <div className="dh-right-buttons">
          <button className="dh-toggle-btn" onClick={toggle3D}>{is3D ? '2D' : '3D'}</button>
          <button className="dh-locate-btn" onClick={handleReCenter}>📍</button>
        </div>

        {!driverLocation && (
          <div className="dh-gps-overlay">
            <div className="dh-spinner" style={{ borderTopColor: accentColor }} />
            <p className="dh-gps-text">GPS aniqlanmoqda...</p>
          </div>
        )}
      </div>

      {/* Bottom panel */}
      <div className="dh-bottom-panel">
        <div className="dh-sheet-handle" />
        {statusMsg && <p className="dh-success-msg">{statusMsg}</p>}

        {activeCall && (
          <>
            <div className="dh-call-info-card" style={{ background: accentColor }}>
              <div className="dh-call-info-top">
                <span className="dh-call-info-id">Chaqiruv #{activeCall.id}</span>
                <span className="dh-status-badge">{statusInfo?.label}</span>
              </div>
              <a className="dh-call-info-phone" href={`tel:${activeCall.caller_phone}`}>
                📞 {activeCall.caller_phone || '—'}
              </a>
            </div>

            {activeCall.status === 'assigned' && (
              <button className="dh-btn-primary" style={{ background: accentColor }} onClick={handleStart} disabled={loading}>
                {loading ? <span className="dh-btn-spinner" /> : '🚗 Boshlash'}
              </button>
            )}
            {activeCall.status === 'on_the_way' && (
              <button className="dh-btn-primary" style={{ background: '#27ae60' }} onClick={handleArrived} disabled={loading}>
                {loading ? <span className="dh-btn-spinner" /> : '✅ Keldi'}
              </button>
            )}
            {activeCall.status === 'arrived' && (
              <button className="dh-btn-primary" style={{ background: '#9b59b6' }} onClick={handleComplete} disabled={loading}>
                {loading ? <span className="dh-btn-spinner" /> : '🏁 Tugatildi'}
              </button>
            )}
            {['assigned', 'on_the_way'].includes(activeCall.status) && (
              <button className="dh-btn-cancel" onClick={handleCancel} disabled={loading}>
                Chaqiruvni bekor qilish
              </button>
            )}
          </>
        )}

        {!activeCall && (
          <>
            <div className="dh-available-header">
              <p className="dh-available-title">📋 Mavjud chaqiruvlar</p>
              <span className="dh-count-badge" style={{ background: accentColor }}>{availableCalls.length}</span>
            </div>
            {availableCalls.length === 0 ? (
              <div className="dh-no-calls-row">
                <span className="dh-spinner-small" style={{ borderTopColor: accentColor }} />
                <span className="dh-no-calls-text">Yangilanmoqda...</span>
              </div>
            ) : (
              <div className="dh-available-list">
                {availableCalls.map((item) => {
                  const dist = driverLocation
                    ? getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(item.latitude), parseFloat(item.longitude)).toFixed(1)
                    : null;
                  return (
                    <button key={item.id} className="dh-available-card" onClick={() => setSelectedCall(item)}>
                      <div className="dh-available-card-icon">{markerEmoji}</div>
                      <div className="dh-available-card-info">
                        <p className="dh-available-card-id">Chaqiruv #{item.id}</p>
                        <p className="dh-available-card-dist">{dist ? dist + ' km' : item.caller_phone}</p>
                      </div>
                      <span
                        className="dh-qabul-btn"
                        style={{ background: accentColor }}
                        onClick={(e) => { e.stopPropagation(); handleAccept(item.id); }}
                      >
                        Qabul
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}

        <div className="dh-bottom-nav">
          <button className="dh-nav-btn">
            <span className="dh-nav-icon">🏠</span>
            <span className="dh-nav-label active" style={{ color: accentColor }}>Asosiy</span>
          </button>
          <button className="dh-nav-btn" onClick={onProfile}>
            <span className="dh-nav-icon">👤</span>
            <span className="dh-nav-label">Profil</span>
          </button>
        </div>
      </div>

      {/* Selected call modal */}
      {selectedCall && (
        <div className="dh-modal-overlay" onClick={() => setSelectedCall(null)}>
          <div className="dh-modal-card" onClick={e => e.stopPropagation()}>
            <div className="dh-modal-header">
              <h3 className="dh-modal-title" style={{ marginBottom: 0 }}>🚨 Chaqiruv #{selectedCall.id}</h3>
              <button className="dh-modal-close" onClick={() => setSelectedCall(null)}>×</button>
            </div>
            <div className="dh-modal-row">
              <span className="dh-modal-label">📞 Telefon</span>
              <a className="dh-modal-value link" href={`tel:${selectedCall.caller_phone}`}>{selectedCall.caller_phone}</a>
            </div>
            {driverLocation && (
              <div className="dh-modal-row">
                <span className="dh-modal-label">📏 Masofa</span>
                <span className="dh-modal-value">
                  {getDistanceKm(driverLocation.latitude, driverLocation.longitude, parseFloat(selectedCall.latitude), parseFloat(selectedCall.longitude)).toFixed(2)} km
                </span>
              </div>
            )}
            {selectedCall.description && (
              <div className="dh-modal-row">
                <span className="dh-modal-label">📝 Izoh</span>
                <span className="dh-modal-value">{selectedCall.description}</span>
              </div>
            )}
            <button className="dh-accept-full" style={{ background: accentColor }} onClick={() => handleAccept(selectedCall.id)} disabled={loading}>
              {loading ? <span className="dh-btn-spinner" /> : '✅ Davom etish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DriverHomeScreen(props) {
  return <DriverScreen {...props} accentColor="#4fc3f7" markerEmoji="🚑" />;
}

