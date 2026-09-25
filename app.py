"""
Weather Report backend — Flask + SQLite.

This replaces the browser-localStorage version of verify.js. Everything
that matters now happens server-side, in one shared database, so:

  - Every user sees the same reports (not just their own browser).
  - The fraud/duplicate/plausibility checks can't be bypassed by editing
    client-side JavaScript, because the client never computes the score —
    it only sends raw data and displays whatever the server decides.

Run it:
    pip install -r requirements.txt
    python app.py
Then it listens on http://localhost:5000
"""

import hashlib
import json
import os
import sqlite3
import time
from datetime import datetime, timezone

import requests
from flask import Flask, g, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "weather.db")
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "gif", "webp", "mp4", "mov", "webm"}
DUPLICATE_WINDOW_SECONDS = 24 * 60 * 60

# Physically plausible ranges (generous, India-wide bounds).
LIMITS = {
    "temperature": (-10, 55, "Temperature (°C)"),
    "humidity": (0, 100, "Humidity (%)"),
    "rainfall": (0, 500, "Rainfall (mm)"),
    "wind": (0, 250, "Wind speed (km/h)"),
}

# Sanity checks between a reported event type and live conditions.
EVENT_EXPECTATIONS = {
    "heatwave": lambda live: (
        f"Reported a heatwave, but live temperature here is only {live['temperature']}°C."
        if live.get("temperature") is not None and live["temperature"] < 30
        else None
    ),
    "flooding": lambda live: (
        "Reported flooding, but live data shows no rainfall at this location right now."
        if live.get("rain") is not None and live["rain"] == 0
        else None
    ),
    "rain": lambda live: (
        "Reported rain, but live data shows no rainfall at this location right now."
        if live.get("rain") is not None and live["rain"] == 0
        else None
    ),
    "thunderstorm": lambda live: (
        "Reported a thunderstorm, but live data shows no rainfall at this location right now."
        if live.get("rain") is not None and live["rain"] == 0
        else None
    ),
    "strong_wind": lambda live: (
        f"Reported strong wind, but live wind speed here is only {live['wind']} km/h."
        if live.get("wind") is not None and live["wind"] < 20
        else None
    ),
}

app = Flask(__name__)


# ---------------------------------------------------------------------------
# CORS (manual — avoids depending on flask-cors)
# ---------------------------------------------------------------------------
@app.after_request
def add_cors_headers(response):
    response.headers["Access-Control-Allow-Origin"] = "*"
    response.headers["Access-Control-Allow-Methods"] = "GET, POST, OPTIONS"
    response.headers["Access-Control-Allow-Headers"] = "Content-Type"
    return response


@app.route("/api/<path:_any>", methods=["OPTIONS"])
def cors_preflight(_any):
    return ("", 204)


# ---------------------------------------------------------------------------
# Database
# ---------------------------------------------------------------------------
def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
    return g.db


@app.teardown_appcontext
def close_db(_exc):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS reports (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp INTEGER NOT NULL,
            reporter_id TEXT,
            location TEXT,
            resolved_location TEXT,
            state TEXT,
            district TEXT,
            latitude REAL,
            longitude REAL,
            temperature REAL,
            humidity REAL,
            rainfall REAL,
            wind REAL,
            weather TEXT,
            event_type TEXT,
            description TEXT,
            photo_path TEXT,
            fingerprint TEXT,
            file_hash TEXT,
            score INTEGER,
            verdict TEXT,
            flags TEXT
        )
        """
    )
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def to_float_or_none(value):
    if value is None or value == "":
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def check_plausibility(data):
    issues = []
    for key, (lo, hi, label) in LIMITS.items():
        val = to_float_or_none(data.get(key))
        if val is None:
            continue
        if val < lo or val > hi:
            issues.append(f"{label} of {val} is outside the physically plausible range ({lo}–{hi}).")
    return issues


def make_fingerprint(data):
    def round_or_blank(v):
        f = to_float_or_none(v)
        return "" if f is None else str(round(f))

    day_bucket = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    raw = "|".join(
        [
            (data.get("reporterId") or "").strip().lower(),
            (data.get("location") or "").strip().lower(),
            data.get("weather") or "",
            round_or_blank(data.get("temperature")),
            round_or_blank(data.get("humidity")),
            round_or_blank(data.get("rainfall")),
            round_or_blank(data.get("wind")),
            day_bucket,
        ]
    )
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def find_duplicate_report(db, fingerprint):
    cutoff = int(time.time() * 1000) - DUPLICATE_WINDOW_SECONDS * 1000
    row = db.execute(
        "SELECT * FROM reports WHERE fingerprint = ? AND timestamp > ? ORDER BY timestamp DESC LIMIT 1",
        (fingerprint, cutoff),
    ).fetchone()
    return row


def find_duplicate_file(db, file_hash):
    if not file_hash:
        return None
    return db.execute(
        "SELECT * FROM reports WHERE file_hash = ? ORDER BY timestamp DESC LIMIT 1", (file_hash,)
    ).fetchone()


def geocode_location(name):
    query = (name or "").split(",")[0].strip()
    if not query:
        return None
    try:
        resp = requests.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={"name": query, "count": 1, "language": "en", "format": "json"},
            timeout=6,
        )
        resp.raise_for_status()
        data = resp.json()
    except requests.RequestException:
        return None
    results = data.get("results") or []
    if not results:
        return None
    r = results[0]
    label = ", ".join(filter(None, [r.get("name"), r.get("admin1"), r.get("country")]))
    return {
        "lat": r.get("latitude"),
        "lon": r.get("longitude"),
        "label": label,
        "state": r.get("admin1"),
        "district": r.get("admin2"),
    }


def fetch_live_weather(lat, lon):
    try:
        resp = requests.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": lat,
                "longitude": lon,
                "current": "temperature_2m,relative_humidity_2m,rain,wind_speed_10m",
            },
            timeout=6,
        )
        resp.raise_for_status()
        cur = resp.json().get("current", {})
    except requests.RequestException:
        return None
    return {
        "temperature": cur.get("temperature_2m"),
        "humidity": cur.get("relative_humidity_2m"),
        "rain": cur.get("rain"),
        "wind": cur.get("wind_speed_10m"),
    }


def score_deviation(reported, live_val, tolerance):
    reported = to_float_or_none(reported)
    if reported is None or live_val is None:
        return None
    diff = abs(reported - live_val)
    if diff <= tolerance:
        return 100.0
    score = 100.0 - ((diff - tolerance) / (tolerance * 3)) * 100.0
    return max(0.0, min(100.0, score))


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------
@app.route("/api/reports", methods=["POST"])
def create_report():
    db = get_db()

    # Accept either multipart/form-data (with an optional photo) or plain JSON.
    if request.content_type and "multipart/form-data" in request.content_type:
        data = {k: request.form.get(k) for k in request.form}
        photo = request.files.get("photo")
    else:
        data = request.get_json(silent=True) or {}
        photo = None

    if not data.get("location") or not data.get("weather"):
        return jsonify({"error": "location and weather are required"}), 400

    flags = []

    # 1. Plausibility
    plausibility_issues = check_plausibility(data)
    flags.extend(f"⚠ {i}" for i in plausibility_issues)

    # 2. Duplicate report
    fingerprint = make_fingerprint(data)
    dup_report = find_duplicate_report(db, fingerprint)
    if dup_report:
        flags.append("🚫 Duplicate report — this matches a report already submitted for this location today.")

    # 3. Duplicate file (server hashes the actual uploaded bytes — can't be spoofed)
    file_hash = None
    photo_rel_path = None
    dup_file = None
    if photo and photo.filename and allowed_file(photo.filename):
        file_bytes = photo.read()
        file_hash = hashlib.sha256(file_bytes).hexdigest()
        dup_file = find_duplicate_file(db, file_hash)
        if dup_file:
            flags.append("🚫 Duplicate file — this exact photo/video has already been submitted.")
        ext = photo.filename.rsplit(".", 1)[1].lower()
        photo_rel_path = f"{file_hash}.{ext}"
        save_path = os.path.join(UPLOAD_DIR, photo_rel_path)
        if not os.path.exists(save_path):
            with open(save_path, "wb") as fh:
                fh.write(file_bytes)

    # 4. Live cross-check
    live_score = None
    live_weather = None
    location_info = None
    loc = geocode_location(data.get("location"))
    if loc:
        location_info = loc
        live_weather = fetch_live_weather(loc["lat"], loc["lon"])
        if live_weather:
            scores = [
                s
                for s in [
                    score_deviation(data.get("temperature"), live_weather.get("temperature"), 3),
                    score_deviation(data.get("rainfall"), live_weather.get("rain"), 5),
                    score_deviation(data.get("wind"), live_weather.get("wind"), 15),
                ]
                if s is not None
            ]
            if scores:
                live_score = sum(scores) / len(scores)

            event_type = data.get("eventType")
            if event_type and event_type in EVENT_EXPECTATIONS:
                msg = EVENT_EXPECTATIONS[event_type](live_weather)
                if msg:
                    flags.append(f"⚠ {msg}")
                    live_score = max(0, live_score - 25) if live_score is not None else 50
        else:
            flags.append("Live weather cross-check unavailable right now (network issue).")
    else:
        flags.append("Location could not be matched to live weather data — double-check the spelling.")

    # 5. Combine into a final score
    score = live_score if live_score is not None else 60.0
    if plausibility_issues:
        score = min(score, 10)
    if dup_report:
        score = min(score, 5)
    if dup_file:
        score = min(score, 5)
    score = round(score)

    if score >= 70:
        verdict = "Verified"
    elif score >= 40:
        verdict = "Needs review"
    else:
        verdict = "Suspicious"

    timestamp_ms = int(time.time() * 1000)
    db.execute(
        """
        INSERT INTO reports (
            timestamp, reporter_id, location, resolved_location, state, district,
            latitude, longitude, temperature, humidity, rainfall, wind, weather,
            event_type, description, photo_path, fingerprint, file_hash, score,
            verdict, flags
        ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
        """,
        (
            timestamp_ms,
            data.get("reporterId") or "",
            data.get("location") or "",
            location_info["label"] if location_info else None,
            location_info["state"] if location_info else None,
            location_info["district"] if location_info else None,
            location_info["lat"] if location_info else None,
            location_info["lon"] if location_info else None,
            to_float_or_none(data.get("temperature")),
            to_float_or_none(data.get("humidity")),
            to_float_or_none(data.get("rainfall")),
            to_float_or_none(data.get("wind")),
            data.get("weather") or "",
            data.get("eventType") or "",
            data.get("description") or "",
            photo_rel_path,
            fingerprint,
            file_hash,
            score,
            verdict,
            json.dumps(flags),
        ),
    )
    db.commit()

    return jsonify(
        {
            "score": score,
            "verdict": verdict,
            "flags": flags,
            "liveWeather": live_weather,
            "resolvedLocation": location_info["label"] if location_info else None,
            "photoUrl": f"/uploads/{photo_rel_path}" if photo_rel_path else None,
        }
    )


def row_to_dict(row):
    d = dict(row)
    d["flags"] = json.loads(d.get("flags") or "[]")
    if d.get("photo_path"):
        d["photoUrl"] = f"/uploads/{d['photo_path']}"
    else:
        d["photoUrl"] = None
    return d


@app.route("/api/reports", methods=["GET"])
def list_reports():
    db = get_db()
    limit = min(int(request.args.get("limit", 20)), 200)
    state = request.args.get("state")
    district = request.args.get("district")

    query = "SELECT * FROM reports"
    conditions = []
    params = []
    if state:
        conditions.append("state = ?")
        params.append(state)
    if district:
        conditions.append("district = ?")
        params.append(district)
    if conditions:
        query += " WHERE " + " AND ".join(conditions)
    query += " ORDER BY timestamp DESC LIMIT ?"
    params.append(limit)

    rows = db.execute(query, params).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route("/api/dashboard", methods=["GET"])
def dashboard():
    db = get_db()
    trusted = db.execute("SELECT * FROM reports WHERE verdict != 'Suspicious'").fetchall()

    def avg(field):
        vals = [r[field] for r in trusted if r[field] is not None]
        return round(sum(vals) / len(vals), 1) if vals else None

    rainfall_avg = avg("rainfall")
    if rainfall_avg is None:
        flood_risk = "Unknown"
    elif rainfall_avg >= 50:
        flood_risk = "High"
    elif rainfall_avg >= 15:
        flood_risk = "Moderate"
    else:
        flood_risk = "Low"

    total = db.execute("SELECT COUNT(*) AS c FROM reports").fetchone()["c"]
    by_verdict = db.execute("SELECT verdict, COUNT(*) AS c FROM reports GROUP BY verdict").fetchall()

    return jsonify(
        {
            "avgTemperature": avg("temperature"),
            "avgHumidity": avg("humidity"),
            "avgRainfall": rainfall_avg,
            "floodRisk": flood_risk,
            "totalReports": total,
            "byVerdict": {r["verdict"]: r["c"] for r in by_verdict},
        }
    )


@app.route("/uploads/<path:filename>")
def serve_upload(filename):
    return send_from_directory(UPLOAD_DIR, filename)


@app.route("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    init_db()
    app.run(host="0.0.0.0", port=5000, debug=True)
