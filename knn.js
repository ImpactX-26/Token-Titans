// Lightweight K-Nearest Neighbours recommender.
// This is a genuine ML inference component: the current commute feature
// vector is compared with labelled historical-style training examples.

const TRAINING_DATA = [
  // [distanceKm, trafficPct, rainMm, construction, flooding, metroOpen,
  //  metroEta, busEta, roadEta, metroFare, busFare, autoFare]
  { x: [4, 10, 0, 0, 0, 1, 18, 28, 14, 30, 12, 56], y: 'Metro' },
  { x: [7, 20, 0, 0, 0, 1, 25, 34, 20, 40, 18, 110], y: 'Metro' },
  { x: [10, 35, 0, 0, 0, 1, 32, 42, 28, 50, 23, 164], y: 'Metro' },
  { x: [14, 55, 2, 0, 0, 1, 42, 54, 38, 60, 24, 236], y: 'Metro' },
  { x: [18, 70, 3, 1, 0, 1, 50, 66, 48, 70, 28, 308], y: 'Metro' },
  { x: [22, 80, 5, 1, 0, 1, 58, 78, 58, 80, 30, 380], y: 'Metro' },
  { x: [8, 45, 1, 0, 0, 1, 28, 35, 25, 50, 18, 128], y: 'Metro' },

  { x: [3, 20, 0, 0, 0, 1, 20, 22, 12, 20, 12, 56], y: 'Auto / Cab' },
  { x: [5, 35, 0, 0, 0, 1, 25, 30, 18, 30, 18, 92], y: 'Auto / Cab' },
  { x: [6, 55, 0, 0, 0, 1, 30, 38, 25, 40, 18, 110], y: 'Auto / Cab' },
  { x: [4, 65, 4, 0, 0, 1, 25, 34, 28, 30, 18, 92], y: 'Auto / Cab' },
  { x: [7, 80, 7, 1, 1, 1, 32, 48, 42, 40, 18, 128], y: 'Auto / Cab' },

  { x: [5, 15, 0, 0, 0, 1, 22, 26, 16, 30, 18, 92], y: 'BMTC Bus' },
  { x: [9, 30, 0, 0, 0, 1, 32, 38, 25, 50, 23, 146], y: 'BMTC Bus' },
  { x: [12, 45, 0, 0, 0, 1, 38, 48, 32, 60, 24, 200], y: 'BMTC Bus' },
  { x: [16, 50, 1, 0, 0, 1, 45, 58, 40, 70, 28, 272], y: 'BMTC Bus' },
  { x: [6, 30, 2, 0, 0, 0, 999, 36, 28, 0, 18, 110], y: 'BMTC Bus' },
  { x: [12, 55, 3, 1, 0, 0, 999, 52, 38, 0, 24, 200], y: 'BMTC Bus' }
];

function fit(data) {
  const dims = data[0].x.length;
  const min = Array(dims).fill(Infinity);
  const max = Array(dims).fill(-Infinity);
  for (const row of data) {
    row.x.forEach((v, i) => {
      min[i] = Math.min(min[i], v);
      max[i] = Math.max(max[i], v);
    });
  }
  return { min, max };
}

const scaler = fit(TRAINING_DATA);

function normalize(x) {
  return x.map((v, i) => {
    const range = scaler.max[i] - scaler.min[i];
    return range === 0 ? 0 : (v - scaler.min[i]) / range;
  });
}

function distance(a, b) {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += (a[i] - b[i]) ** 2;
  return Math.sqrt(sum);
}

function predict(features, k = 5) {
  const input = normalize(features);
  const neighbours = TRAINING_DATA.map(row => ({
    y: row.y,
    d: distance(input, normalize(row.x))
  })).sort((a, b) => a.d - b.d).slice(0, k);

  const scores = { 'Metro': 0, 'BMTC Bus': 0, 'Auto / Cab': 0 };
  for (const n of neighbours) scores[n.y] += 1 / (n.d + 0.001);

  const ranking = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const total = ranking.reduce((s, [, v]) => s + v, 0) || 1;
  const prediction = ranking[0][0];
  const confidence = Math.round((ranking[0][1] / total) * 100);

  return {
    prediction,
    confidence,
    scores: Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Number(value.toFixed(2))])),
    model: 'K-Nearest Neighbours (KNN)',
    neighboursUsed: k
  };
}

module.exports = { predict };
