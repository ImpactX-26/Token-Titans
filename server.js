const express = require('express');
const cors = require('cors');
const axios = require('axios');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { predict } = require('./ml/knn');

const app = express();
const PORT = process.env.PORT || 5000;
const TOMTOM_API_KEY = process.env.TOMTOM_API_KEY || '';

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const locations = {
  'Majestic': [12.9767, 77.5713],
  'Yeshwanthpur': [13.0285, 77.5400],
  'Hebbal': [13.0358, 77.5970],
  'Indiranagar': [12.9784, 77.6408],
  'Whitefield': [12.9698, 77.7499],
  'Electronic City': [12.8452, 77.6602],
  'Bommasandra': [12.8165, 77.6780],
  'Silk Board': [12.9170, 77.6237],
  'Koramangala': [12.9352, 77.6245],
  'BTM Layout': [12.9166, 77.6101],
  'Jayanagar': [12.9250, 77.5938],
  'JP Nagar': [12.9063, 77.5857],
  'Banashankari': [12.9255, 77.5468],
  'Kengeri': [12.9081, 77.4872],
  'Nagarbhavi': [12.9591, 77.5127],
  'Vijayanagar': [12.9719, 77.5329],
  'Rajajinagar': [12.9912, 77.5550],
  'Malleshwaram': [13.0031, 77.5700],
  'Peenya': [13.0326, 77.5260],
  'Dasarahalli': [13.0450, 77.5120],
  'Nagasandra': [13.0475, 77.5001],
  'Cubbon Park': [12.9763, 77.5929],
  'MG Road': [12.9756, 77.6061],
  'Trinity': [12.9720, 77.6180],
  'Baiyappanahalli': [12.9906, 77.6525],
  'Halasuru': [12.9858, 77.6260],
  'KR Puram': [13.0004, 77.6784],
  'Mahadevapura': [12.9917, 77.6975],
  'Marathahalli': [12.9591, 77.6974],
  'Kadugodi': [12.9980, 77.7600],
  'RV Road': [12.9210, 77.5800],
  'Lalbagh': [12.9507, 77.5848],
  'National College': [12.9517, 77.5747],
  'KR Market': [12.9621, 77.5770],
  'Chickpet': [12.9654, 77.5760],
  'Airport': [13.1986, 77.7066]
};

const safeNum = (v, fallback = 0) => Number.isFinite(Number(v)) ? Number(v) : fallback;
const safeText = (v, fallback = 'Not available') => (v === undefined || v === null || v === '' ? fallback : String(v));
const round = (v, d = 1) => Number(Number(v).toFixed(d));

function haversine(a, b) {
  const R = 6371;
  const dLat = (b[0] - a[0]) * Math.PI / 180;
  const dLon = (b[1] - a[1]) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * Math.PI / 180) * Math.cos(b[0] * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

async function roadRoute(from, to) {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${from[1]},${from[0]};${to[1]},${to[0]}`;
    const { data } = await axios.get(url, { params: { overview: false }, timeout: 10000 });
    const route = data.routes?.[0];
    if (!route) throw new Error('No route');
    return { distanceKm: route.distance / 1000, durationMin: route.duration / 60 };
  } catch {
    const d = haversine(from, to) * 1.25;
    return { distanceKm: d, durationMin: d * 3.2 };
  }
}

function weatherText(code) {
  const m = { 0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Fog', 51: 'Drizzle', 53: 'Drizzle', 55: 'Drizzle', 61: 'Rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Snow', 80: 'Rain showers', 81: 'Rain showers', 82: 'Heavy rain showers', 95: 'Thunderstorm', 96: 'Thunderstorm', 99: 'Thunderstorm' };
  return m[code] || 'Current weather';
}

async function getWeather(lat, lon) {
  try {
    const { data } = await axios.get('https://api.open-meteo.com/v1/forecast', {
      params: {
        latitude: lat,
        longitude: lon,
        current: 'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
        timezone: 'Asia/Kolkata'
      },
      timeout: 10000
    });
    const c = data.current || {};
    return {
      available: true,
      temperature: safeNum(c.temperature_2m),
      humidity: safeNum(c.relative_humidity_2m),
      precipitation: safeNum(c.precipitation),
      windSpeed: safeNum(c.wind_speed_10m),
      weatherCode: safeNum(c.weather_code),
      description: weatherText(safeNum(c.weather_code)),
      updated: new Date().toISOString()
    };
  } catch {
    return { available: false, temperature: null, humidity: null, precipitation: 0, windSpeed: null, description: 'Weather temporarily unavailable', updated: new Date().toISOString() };
  }
}

function metroStatus() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(now);
  const h = Number(parts.find(p => p.type === 'hour')?.value || 0);
  const m = Number(parts.find(p => p.type === 'minute')?.value || 0);
  const mins = h * 60 + m;
  const operating = mins >= 300 && mins < 1380;
  let frequency = 'Not operating';
  if (operating) frequency = (mins >= 420 && mins < 600) || (mins >= 1020 && mins < 1200) ? 'Approx. 5–8 min' : 'Approx. 8–12 min';
  return { operating, frequency, currentTime: `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`, serviceWindow: 'Approx. 05:00–23:00' };
}

function metroFare(d) {
  if (d <= 2) return 10; if (d <= 4) return 20; if (d <= 6) return 30; if (d <= 8) return 40; if (d <= 10) return 50; if (d <= 15) return 60; if (d <= 20) return 70; if (d <= 25) return 80; return 90;
}

function busFare(d) {
  if (d <= 2) return 6; if (d <= 4) return 12; if (d <= 6) return 18; if (d <= 10) return 23; if (d <= 14) return 24; if (d <= 18) return 28; if (d <= 40) return 30; return 32;
}

function autoFare(d) {
  let fare = 36 + Math.max(0, d - 2) * 18 + 10;
  const hour = Number(new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', hour12: false }).format(new Date()));
  if (hour >= 22 || hour < 5) fare *= 1.5;
  return Math.round(fare);
}

async function getTraffic(lat, lon) {
  if (!TOMTOM_API_KEY) return { available: false, status: 'Live traffic key not configured', currentSpeed: 0, freeFlowSpeed: 0 };
  try {
    const { data } = await axios.get('https://api.tomtom.com/traffic/services/4/flowSegmentData/absolute/10/json', { params: { point: `${lat},${lon}`, unit: 'KMPH', key: TOMTOM_API_KEY }, timeout: 10000 });
    const f = data.flowSegmentData || {};
    const currentSpeed = safeNum(f.currentSpeed);
    const freeFlowSpeed = safeNum(f.freeFlowSpeed);
    const ratio = freeFlowSpeed ? currentSpeed / freeFlowSpeed : 1;
    const status = ratio < 0.4 ? 'Heavy traffic' : ratio < 0.7 ? 'Moderate traffic' : 'Traffic moving normally';
    return { available: true, status, currentSpeed, freeFlowSpeed };
  } catch {
    return { available: false, status: 'Traffic feed temporarily unavailable', currentSpeed: 0, freeFlowSpeed: 0 };
  }
}

async function getIncidents(lat, lon) {
  if (!TOMTOM_API_KEY) return { available: false, incidents: [] };
  try {
    const delta = 0.06;
    const bbox = `${lon - delta},${lat - delta},${lon + delta},${lat + delta}`;
    const { data } = await axios.get('https://api.tomtom.com/traffic/services/5/incidentDetails', {
      params: { bbox, language: 'en-GB', timeValidityFilter: 'present', key: TOMTOM_API_KEY }, timeout: 10000
    });
    const incidents = (data.incidents || []).map(item => {
      const p = item.properties || {};
      const cat = safeNum(p.iconCategory);
      const type = cat === 1 ? 'Accident' : cat === 6 ? 'Traffic jam' : cat === 7 ? 'Lane closure' : cat === 8 ? 'Road closure' : cat === 9 ? 'Road works / Construction' : cat === 11 ? 'Flooding / Waterlogging' : cat === 14 ? 'Broken-down vehicle' : 'Traffic incident';
      const description = p.events?.[0]?.description || type;
      return { type, description };
    });
    return { available: true, incidents };
  } catch {
    return { available: false, incidents: [] };
  }
}

async function nearestBusStop(lat, lon) {
  try {
    const query = `[out:json][timeout:10];node(around:3000,${lat},${lon})["highway"="bus_stop"];out body 15;`;
    const { data } = await axios.post('https://overpass-api.de/api/interpreter', query, { headers: { 'Content-Type': 'text/plain' }, timeout: 15000 });
    let best = null;
    for (const e of data.elements || []) {
      if (!e.lat || !e.lon) continue;
      const d = haversine([lat, lon], [e.lat, e.lon]);
      if (!best || d < best.distanceKm) best = { name: e.tags?.name || 'Nearby BMTC stop', distanceKm: d };
    }
    return best || { name: 'Nearby BMTC stop', distanceKm: 0 };
  } catch {
    return { name: 'Nearby BMTC stop', distanceKm: 0 };
  }
}

async function liveData(from, to) {
  const mid = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const [weather, traffic, incidentData] = await Promise.all([getWeather(...mid), getTraffic(...mid), getIncidents(...mid)]);
  const incidents = incidentData.incidents || [];
  const construction = incidents.filter(x => x.type === 'Road works / Construction');
  const flooding = incidents.filter(x => x.type === 'Flooding / Waterlogging');
  return {
    weather,
    traffic,
    roadWorks: { problem: construction.length > 0, count: construction.length, incidents: construction },
    waterlogging: { problem: flooding.length > 0, count: flooding.length, incidents: flooding },
    metro: metroStatus(),
    updated: new Date().toISOString()
  };
}

function aiFeatures({ distance, traffic, weather, construction, flooding, metro, metroEta, busEta, autoEta, metroFareValue, busFareValue, autoFareValue }) {
  let trafficPct = 0;
  if (traffic.freeFlowSpeed > 0) trafficPct = Math.max(0, Math.min(100, 100 - (traffic.currentSpeed / traffic.freeFlowSpeed) * 100));
  return [distance, trafficPct, weather.precipitation || 0, construction ? 1 : 0, flooding ? 1 : 0, metro.operating ? 1 : 0, metroEta, busEta, autoEta, metroFareValue, busFareValue, autoFareValue];
}

app.get('/api/health', (req, res) => res.json({ success: true, service: 'Namma Commuter AI Backend', aiModel: 'KNN', tomtomConfigured: Boolean(TOMTOM_API_KEY), time: new Date().toISOString() }));
app.get('/api/locations', (req, res) => res.json({ success: true, locations }));
app.get('/api/weather', async (req, res) => res.json(await getWeather(safeNum(req.query.lat, 12.9716), safeNum(req.query.lon, 77.5946))));

app.get('/api/commute', async (req, res) => {
  try {
    const fromName = safeText(req.query.from, 'Majestic');
    const toName = safeText(req.query.to, 'Indiranagar');
    if (!locations[fromName] || !locations[toName]) return res.status(400).json({ success: false, error: 'Please select valid Bengaluru locations.' });
    if (fromName === toName) return res.status(400).json({ success: false, error: 'Starting point and destination cannot be the same.' });

    const from = locations[fromName];
    const to = locations[toName];
    const route = await roadRoute(from, to);
    const distance = Math.max(0.5, route.distanceKm);
    const metro = metroStatus();
    const metroEta = metro.operating ? Math.max(12, Math.round(distance * 3.1 + 8)) : 999;
    const busEta = Math.max(18, Math.round(distance * 4.0 + 12));
    const autoEta = Math.max(8, Math.round(route.durationMin));
    const metroFareValue = metro.operating ? metroFare(distance) : 0;
    const busFareValue = busFare(distance);
    const autoFareValue = autoFare(distance);
    const [live, stop] = await Promise.all([liveData(from, to), nearestBusStop(from[0], from[1])]);

    const features = aiFeatures({
      distance,
      traffic: live.traffic,
      weather: live.weather,
      construction: live.roadWorks.problem,
      flooding: live.waterlogging.problem,
      metro,
      metroEta,
      busEta,
      autoEta,
      metroFareValue,
      busFareValue,
      autoFareValue
    });

    const ai = predict(features);
    if (!metro.operating && ai.prediction === 'Metro') {
      ai.prediction = busEta <= autoEta ? 'BMTC Bus' : 'Auto / Cab';
      ai.confidence = Math.max(ai.confidence, 80);
      ai.reason = 'Metro is currently outside its service window.';
    }

    const explanation = ai.reason || `The model selected ${ai.prediction} from the current route, cost, ETA, traffic, weather and disruption features.`;

    res.json({
      success: true,
      route: { from: fromName, to: toName, distanceKm: round(distance, 1) },
      aiRecommendation: { ...ai, explanation, features: { distanceKm: round(distance, 1), traffic: live.traffic.status, rainMm: live.weather.precipitation, construction: live.roadWorks.problem, waterlogging: live.waterlogging.problem } },
      planA: { name: 'Metro', available: metro.operating, status: metro.operating ? 'Operating' : 'Not operating now', frequency: metro.frequency, serviceWindow: metro.serviceWindow, etaMinutes: metro.operating ? metroEta : null, fare: metro.operating ? metroFareValue : null },
      planB: { name: 'BMTC Bus', available: true, etaMinutes: busEta, fare: busFareValue, nearestStop: stop.name, nearestStopDistance: round(stop.distanceKm, 2) },
      planC: { name: 'Auto / Cab', available: true, etaMinutes: autoEta, fare: autoFareValue },
      live,
      updated: new Date().toISOString()
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, error: 'Unable to calculate commute right now.' });
  }
});

app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`Namma Commuter AI running at http://localhost:${PORT}`);
  console.log(`AI model: K-Nearest Neighbours (KNN)`);
  console.log(`TomTom live traffic: ${TOMTOM_API_KEY ? 'ENABLED' : 'NOT CONFIGURED'}`);
});
