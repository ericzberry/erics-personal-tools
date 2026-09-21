import {forecastFrom} from '../../chrome-sidebar/src/weather-data.js';

// Today's forecast for where the device is. Not a store: nothing here is
// written anywhere, and each device asks once a day (`chrome-sidebar/src/weather.js`).
//
// The device sends its position rounded to about a kilometre. When it could not
// or would not say, Cloudflare's own reading of the connection stands in: the
// city its address belongs to, which is right on a home or office network and
// can be a city away on a phone's, so the place is always named on screen.
//
// Open-Meteo answers the forecast and OpenStreetMap's Nominatim names the
// place. Both are free and keyless, and Nominatim asks to be told who is
// calling. A name that cannot be had is left off; a forecast that cannot be
// had is the one failure.
const FORECAST = 'https://api.open-meteo.com/v1/forecast';
const REVERSE = 'https://nominatim.openstreetmap.org/reverse';
const AGENT = 'erics-personal-tools/1.0 (+https://tools.ezberry.net)';
const HOURLY = 'temperature_2m,apparent_temperature,precipitation_probability,rain,showers,snowfall';

const coordinate = (value, limit) => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && Math.abs(number) <= limit ? Math.round(number * 100) / 100 : null;
};

async function placeName({lat, lon}, fetcher) {
  try {
    const response = await fetcher(`${REVERSE}?lat=${lat}&lon=${lon}&format=jsonv2&zoom=10&accept-language=en`, {
      headers: {'User-Agent': AGENT, Accept: 'application/json'}, redirect: 'manual', signal: AbortSignal.timeout(4000)
    });
    if (!response.ok) return '';
    const {name} = await response.json();
    return typeof name === 'string' ? name : '';
  } catch { return ''; }
}

// Kilometres between two points, near enough at the scale of a city.
const apart = (a, b) => {
  const radians = Math.PI / 180, x = (b.lon - a.lon) * radians * Math.cos((a.lat + b.lat) / 2 * radians);
  return Math.hypot(x, (b.lat - a.lat) * radians) * 6371;
};

export async function weather(request, env, json, {fetcher = fetch, now = Date.now} = {}) {
  if (request.method !== 'GET') return json({error: 'Method not allowed.'}, 405);
  const url = new URL(request.url);
  const lat = coordinate(url.searchParams.get('lat'), 90), lon = coordinate(url.searchParams.get('lon'), 180);
  const connection = {lat: coordinate(request.cf?.latitude, 90), lon: coordinate(request.cf?.longitude, 180)};
  const device = lat !== null && lon !== null;
  const here = device ? {lat, lon} : connection;
  if (here.lat === null || here.lon === null) return json({error: 'Could not tell where this device is.'}, 422);
  const query = new URLSearchParams({latitude: here.lat, longitude: here.lon, hourly: HOURLY,
    daily: 'temperature_2m_max,temperature_2m_min', temperature_unit: 'fahrenheit', timezone: 'auto', forecast_days: '1'});
  const [forecast, place] = await Promise.all([
    (async () => {
      try {
        const response = await fetcher(`${FORECAST}?${query}`, {
          headers: {'User-Agent': AGENT, Accept: 'application/json'}, redirect: 'manual', signal: AbortSignal.timeout(8000)
        });
        return response.ok ? await response.json() : null;
      } catch { return null; }
    })(),
    device ? placeName(here, fetcher) : Promise.resolve('')
  ]);
  // Cloudflare's city names the device's place too when Nominatim would not,
  // as long as the connection is plainly in the same place as the device.
  const city = typeof request.cf?.city === 'string' ? request.cf.city : '';
  const named = place || (city && connection.lat !== null && connection.lon !== null && (!device || apart(here, connection) <= 30) ? city : '');
  if (!forecast) return json({error: 'The forecast is unavailable. Try again later.'}, 502);
  try { return json(forecastFrom(forecast, {place: named, now: now()})); }
  catch (error) { return json({error: error.message}, 502); }
}
