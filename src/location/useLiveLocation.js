import { useEffect, useRef, useState } from 'react';

// Wraps navigator.geolocation.watchPosition. Consumer phone GPS is only
// accurate to roughly 5-15m (docs/ARCHITECTURE.md), so this also exposes a
// manual override for when the walker drags their position on the map to
// correct for drift — that override wins over live GPS ticks until cleared.
export function useLiveLocation(enabled) {
  const [position, setPosition] = useState(null); // { lat, lng, accuracy, heading, manual }
  const [status, setStatus] = useState('idle'); // idle | locating | tracking | denied | unavailable | error
  const overrideRef = useRef(null);

  useEffect(() => {
    if (!enabled) {
      setStatus('idle');
      return;
    }
    if (!('geolocation' in navigator)) {
      setStatus('unavailable');
      return;
    }

    setStatus('locating');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        setStatus('tracking');
        if (overrideRef.current) return;
        setPosition({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          heading: Number.isFinite(pos.coords.heading) ? pos.coords.heading : null,
          manual: false,
        });
      },
      (err) => {
        setStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'error');
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [enabled]);

  function overridePosition(lat, lng) {
    overrideRef.current = { lat, lng };
    setPosition((prev) => ({ ...prev, lat, lng, accuracy: 0, heading: prev?.heading ?? null, manual: true }));
  }

  function resumeGps() {
    overrideRef.current = null;
  }

  return { position, status, overridePosition, resumeGps };
}
