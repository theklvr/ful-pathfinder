// Open-Meteo: free, no API key, no billing (fits the free-tools-only rule).
// https://open-meteo.com/en/docs and https://open-meteo.com/en/docs/air-quality-api
const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';
const AIR_QUALITY_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

// WMO weather interpretation codes, condensed to what actually shows up in
// Lokoja's climate (tropical: sun, cloud, tropical downpours, occasional
// harmattan haze reads as "fog" to the API) rather than every code WMO
// defines (blizzards etc. that will never fire here).
const WEATHER_CODE_INFO = {
  0: { label: 'Clear sky', icon: 'sun' },
  1: { label: 'Mostly clear', icon: 'sun' },
  2: { label: 'Partly cloudy', icon: 'cloud-sun' },
  3: { label: 'Overcast', icon: 'cloud' },
  45: { label: 'Fog / haze', icon: 'fog' },
  48: { label: 'Fog / haze', icon: 'fog' },
  51: { label: 'Light drizzle', icon: 'rain' },
  53: { label: 'Drizzle', icon: 'rain' },
  55: { label: 'Dense drizzle', icon: 'rain' },
  61: { label: 'Light rain', icon: 'rain' },
  63: { label: 'Rain', icon: 'rain' },
  65: { label: 'Heavy rain', icon: 'rain' },
  80: { label: 'Rain showers', icon: 'rain' },
  81: { label: 'Rain showers', icon: 'rain' },
  82: { label: 'Violent showers', icon: 'rain' },
  95: { label: 'Thunderstorm', icon: 'storm' },
  96: { label: 'Thunderstorm, hail', icon: 'storm' },
  99: { label: 'Thunderstorm, hail', icon: 'storm' },
};

function weatherInfo(code) {
  return WEATHER_CODE_INFO[code] ?? { label: 'Unknown', icon: 'cloud' };
}

// US EPA AQI breakpoints -- more widely recognised than the raw index alone.
function aqiCategory(usAqi) {
  if (usAqi == null) return null;
  if (usAqi <= 50) return { label: 'Good', color: '#16a34a' };
  if (usAqi <= 100) return { label: 'Moderate', color: '#ca8a04' };
  if (usAqi <= 150) return { label: 'Unhealthy for sensitive groups', color: '#ea580c' };
  if (usAqi <= 200) return { label: 'Unhealthy', color: '#dc2626' };
  if (usAqi <= 300) return { label: 'Very unhealthy', color: '#9333ea' };
  return { label: 'Hazardous', color: '#7f1d1d' };
}

export async function fetchWeatherSummary(lat, lng) {
  const weatherReq = fetch(
    `${WEATHER_URL}?latitude=${lat}&longitude=${lng}&current=temperature_2m,relative_humidity_2m,apparent_temperature,weather_code,wind_speed_10m&timezone=auto`,
  ).then((res) => (res.ok ? res.json() : null));

  const airReq = fetch(`${AIR_QUALITY_URL}?latitude=${lat}&longitude=${lng}&current=us_aqi,pm2_5,pm10&timezone=auto`).then((res) =>
    res.ok ? res.json() : null,
  );

  const [weather, air] = await Promise.all([weatherReq, airReq]);
  if (!weather?.current) throw new Error('Weather data unavailable');

  const info = weatherInfo(weather.current.weather_code);
  const aqi = air?.current?.us_aqi ?? null;

  return {
    temperatureC: Math.round(weather.current.temperature_2m),
    feelsLikeC: Math.round(weather.current.apparent_temperature),
    humidity: Math.round(weather.current.relative_humidity_2m),
    windKmh: Math.round(weather.current.wind_speed_10m),
    conditionLabel: info.label,
    conditionIcon: info.icon,
    aqi,
    aqiCategory: aqiCategory(aqi),
    pm25: air?.current?.pm2_5 ?? null,
  };
}
