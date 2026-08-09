import { useEffect, useState } from 'react';
import { fetchWeatherSummary } from '../data/weather';

// Felele campus centre -- same coordinate src/map/MapView.jsx centres the
// map on (Wikipedia/Wikidata sourced, not yet survey-verified).
const CAMPUS_LAT = 7.85944;
const CAMPUS_LNG = 6.68361;

const WEATHER_ICON_PATH = {
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  'cloud-sun':
    '<path d="M8 15a4 4 0 1 1 .9-7.9 5 5 0 0 1 9.6 2A3.5 3.5 0 0 1 18 16H8a3 3 0 0 1 0-6"/><path d="M12 2v1.5M6 4l1 1"/>',
  cloud: '<path d="M18 16a3.5 3.5 0 0 0-1.5-6.65A5 5 0 0 0 7 8.5 4 4 0 0 0 8 16h10z"/>',
  fog: '<path d="M3 8h18M5 12h14M3 16h18M7 20h10"/>',
  rain: '<path d="M18 12.5a3.5 3.5 0 0 0-1.5-6.65A5 5 0 0 0 7 7.5 4 4 0 0 0 8 15h10z"/><path d="M8 19l-1 2M12 19l-1 2M16 19l-1 2"/>',
  storm: '<path d="M18 10.5a3.5 3.5 0 0 0-1.5-6.65A5 5 0 0 0 7 5.5 4 4 0 0 0 8 13h10z"/><path d="M13 13l-3 5h3l-2 4"/>',
};

export default function WeatherWidget() {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchWeatherSummary(CAMPUS_LAT, CAMPUS_LNG)
      .then(setData)
      .catch(() => setError('Could not load weather.'));
  }, []);

  return (
    <div className="weather-widget">
      <button
        type="button"
        className="weather-button"
        aria-label="Weather and air quality"
        data-active={open}
        onClick={() => setOpen((v) => !v)}
      >
        {data ? (
          <>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
              dangerouslySetInnerHTML={{ __html: WEATHER_ICON_PATH[data.conditionIcon] ?? WEATHER_ICON_PATH.cloud }} />
            <span>{data.temperatureC}°C</span>
          </>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            dangerouslySetInnerHTML={{ __html: WEATHER_ICON_PATH.cloud }} />
        )}
      </button>
      {open && (
        <div className="weather-panel">
          {error && <p className="weather-panel-error">{error}</p>}
          {data && (
            <>
              <div className="weather-panel-main">
                <svg
                  className="weather-panel-icon"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  dangerouslySetInnerHTML={{ __html: WEATHER_ICON_PATH[data.conditionIcon] ?? WEATHER_ICON_PATH.cloud }}
                />
                <div>
                  <div className="weather-panel-temp">{data.temperatureC}°C</div>
                  <div className="weather-panel-condition">{data.conditionLabel}</div>
                </div>
              </div>
              <dl className="weather-panel-stats">
                <div>
                  <dt>Feels like</dt>
                  <dd>{data.feelsLikeC}°C</dd>
                </div>
                <div>
                  <dt>Humidity</dt>
                  <dd>{data.humidity}%</dd>
                </div>
                <div>
                  <dt>Wind</dt>
                  <dd>{data.windKmh} km/h</dd>
                </div>
              </dl>
              <div className="weather-panel-aqi">
                <span>Air quality</span>
                {data.aqiCategory ? (
                  <span className="weather-panel-aqi-badge" style={{ '--aqi-color': data.aqiCategory.color }}>
                    {data.aqi} · {data.aqiCategory.label}
                  </span>
                ) : (
                  <span className="weather-panel-aqi-badge weather-panel-aqi-unknown">Unavailable</span>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
