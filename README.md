# Namma Commuter AI

A fresh, self-contained Bengaluru commute planner with a K-Nearest Neighbours (KNN) machine-learning recommendation engine.

## Run

1. Open a terminal in this folder.
2. Run `npm install`.
3. Copy `.env.example` to `.env`.
4. Optionally add `TOMTOM_API_KEY` for live traffic and incident data.
5. Run `npm start`.
6. Open `http://localhost:5000`.

## AI

The backend contains a KNN model in `backend/ml/knn.js`. It compares the current commute feature vector against labelled training examples using normalized Euclidean distance and inverse-distance voting.

Features include route distance, traffic level, rainfall, construction, waterlogging, Metro availability, ETAs and fares.

The application clearly identifies the model as KNN and shows the predicted mode and confidence.

## Data sources

- Open-Meteo: weather
- OSRM: route distance and road-duration estimate
- TomTom Traffic API: optional live traffic and incidents
- Overpass/OpenStreetMap: nearby bus-stop lookup
- Embedded labelled training examples: KNN recommendation model

The Metro component estimates current service-window/frequency behavior; it does not claim live train GPS positions.
