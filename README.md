# Weather Report — National Weather Big Data Analytics Platform

Citizen weather-reporting prototype for SIH26069 (Ministry of Earth Sciences,
Disaster Management theme).

## Architecture

- **Frontend** — plain HTML/CSS/JS, no build step (`index.html`, `page1.html`,
  `page2.html`, `page5.html`, `sources.html`, `test.html`)
- **Backend** — Flask + SQLite (`backend/app.py`), owns every fraud and
  duplicate check and is the single shared source of truth for all reports

The fraud/duplicate/plausibility checks run **server-side only**. The
browser never computes a score — it sends the raw report to the backend and
displays whatever the server decides. This matters: a check that ran in the
browser could be bypassed by anyone who opened dev tools and edited the
page's JavaScript. A server-side check can't be, and it also means every
user sees the same shared reports instead of only their own device's.

## Run it

**1. Start the backend** (does the real work — do this first):

```
cd backend
pip install -r requirements.txt
python app.py
```

This starts a server at `http://localhost:5000` and creates `weather.db`
(SQLite) and an `uploads/` folder on first run.

**2. Open the frontend:**

```
python3 -m http.server 8000
```

then visit `http://localhost:8000`. (Opening `index.html` directly, without
a local server, also works for the static pages, but serving it avoids
occasional browser quirks with file:// pages.)

`api.js` points the frontend at `http://localhost:5000` by default — change
`API_BASE` there once you deploy the backend somewhere else (Render,
Railway, PythonAnywhere, etc. all have free tiers that work for a Flask app
like this).

## Pages

- `index.html` — home
- `page1.html` — quick citizen report (event type + photo + location)
- `page2.html` — detailed weather report (temperature/humidity/rainfall/wind)
- `page5.html` — dashboard, reads real submitted reports from the backend
- `sources.html` — compares live data from Open-Meteo (and optionally
  WeatherAPI.com, if you add a free key in `sources.js`) for a location
- `test.html` — interactive map of India

## What the backend checks (`backend/app.py`)

For every submitted report:

1. **Plausibility** — rejects physically impossible values (e.g. 150%
   humidity, 999°C).
2. **Live cross-check** — geocodes the location (Open-Meteo Geocoding API)
   and compares the report against real current conditions there, producing
   a 0–100 credibility score. Also sanity-checks the reported event type
   against live conditions (e.g. "heatwave" reported where it's currently
   15°C gets flagged).
3. **Duplicate report detection** — fingerprints each submission (reporter
   + location + values + day) so the same report can't be resubmitted as
   new.
4. **Duplicate file detection** — hashes the actual bytes of any uploaded
   photo/video server-side (SHA-256), so the same file can't be reused
   across multiple "new" reports — even under a different reporter name or
   location.

Everything is stored in `backend/weather.db` (SQLite) with photos in
`backend/uploads/`, and the dashboard, recent-reports list, and photo
gallery all read from there — this is real shared data now, not a
per-browser demo.

## Not built yet (per the original design notes)

- District/state-level dashboard views (the backend already stores `state`
  and `district` per report from geocoding, so filtering `/api/reports` by
  those is mostly wiring, not new logic)
- SMS-based reporting channel for low-network areas
- Volunteer-reporter verification network

## Deploying for real

For the actual SIH demo/judging, `python app.py` on your laptop only works
while your laptop is on and everyone's on the same network. For something
judges can hit from their own devices, deploy `backend/` to a small free
host (Render, Railway, PythonAnywhere) and point `api.js`'s `API_BASE` at
that URL, then host the frontend files anywhere static (GitHub Pages,
Netlify, or the same host).
