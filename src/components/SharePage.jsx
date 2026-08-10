import { useEffect, useRef, useState } from 'react';
import { Map as MaplibreMap, Marker } from 'maplibre-gl';
import { setupMapLibre } from '../map/setupMapLibre';
import { buildStyle } from '../map/style';
import { fetchShare } from '../data/locationShares';

setupMapLibre();

const POLL_INTERVAL_MS = 15000;

export default function SharePage({ shareId }) {
  const [share, setShare] = useState(undefined); // undefined = loading, null = not found
  const [error, setError] = useState(null);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const markerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    function load() {
      fetchShare(shareId)
        .then((data) => {
          if (!cancelled) setShare(data);
        })
        .catch((err) => {
          if (!cancelled) setError(err.message);
        });
    }
    load();
    const interval = setInterval(load, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [shareId]);

  useEffect(() => {
    if (!share || !containerRef.current) return;
    if (!mapRef.current) {
      mapRef.current = new MaplibreMap({
        container: containerRef.current,
        style: buildStyle('light'),
        center: [share.lng, share.lat],
        zoom: 16,
      });
    }
    const map = mapRef.current;
    if (markerRef.current) {
      markerRef.current.setLngLat([share.lng, share.lat]);
    } else {
      const el = document.createElement('div');
      el.className = 'user-puck';
      el.innerHTML = '<div class="user-puck-dot"></div>';
      markerRef.current = new Marker({ element: el, anchor: 'center' }).setLngLat([share.lng, share.lat]).addTo(map);
    }
    map.easeTo({ center: [share.lng, share.lat], duration: 600 });
  }, [share]);

  useEffect(() => {
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  function handleDirections() {
    const params = new URLSearchParams({
      destLat: String(share.lat),
      destLng: String(share.lng),
      destLabel: share.sharerName ? `${share.sharerName}'s location` : 'Shared location',
    });
    window.location.href = `/?${params.toString()}`;
  }

  if (share === undefined && !error) {
    return (
      <div className="share-page share-page-status">
        <p>Loading shared location…</p>
      </div>
    );
  }

  if (error || share === null || !share.active) {
    return (
      <div className="share-page share-page-status">
        <p>{error ? 'Could not load this link.' : "This location share has ended or doesn't exist."}</p>
        <a className="account-panel-submit share-page-back" href="/">
          Open FUL PathFinder
        </a>
      </div>
    );
  }

  const updatedLabel = new Date(share.updated_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  return (
    <div className="share-page">
      <div ref={containerRef} className="share-page-map" />
      <div className="share-page-card">
        <div className="share-page-header">
          {share.sharerAvatar ? (
            <img className="account-avatar" src={share.sharerAvatar} alt="" />
          ) : (
            <div className="account-avatar account-avatar-placeholder">{(share.sharerName || '?').charAt(0).toUpperCase()}</div>
          )}
          <div>
            <p className="share-page-name">{share.sharerName || 'A friend'} is sharing their location</p>
            <p className="share-page-updated">Updated {updatedLabel}</p>
          </div>
        </div>
        <button type="button" className="account-panel-submit" onClick={handleDirections}>
          Get directions
        </button>
      </div>
    </div>
  );
}
