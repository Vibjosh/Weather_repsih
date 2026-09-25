/*
 * page2.js — Weather Report Submission form.
 * Sends the form data (and any photo) to the backend, which owns every
 * check — plausibility, live cross-check, duplicate report, duplicate
 * file — and returns the real score. This page just displays it.
 */

async function submitReport() {
  const resultBox = document.getElementById("resultBox");

  const data = {
    reporterId: document.getElementById("reporter-id").value.trim(),
    location: document.getElementById("location").value.trim(),
    temperature: document.getElementById("temperature").value,
    humidity: document.getElementById("humidity").value,
    rainfall: document.getElementById("rainfall").value,
    wind: document.getElementById("wind").value,
    weather: document.getElementById("weather").value,
    description: document.getElementById("description").value.trim(),
  };

  const fileInput = document.getElementById("file");
  const file = fileInput && fileInput.files.length ? fileInput.files[0] : null;

  if (!data.location || data.temperature === "" || !data.weather) {
    showResult(
      {
        score: 0,
        verdict: "Incomplete",
        flags: ["Please fill in at least location, temperature and weather condition."],
      },
      resultBox
    );
    return;
  }

  resultBox.hidden = false;
  resultBox.className = "result-box pending";
  resultBox.innerHTML = "Checking against live weather data…";

  try {
    const result = await WeatherAPI.submitReport(data, file);
    showResult(result, resultBox);
  } catch (err) {
    resultBox.className = "result-box bad";
    resultBox.innerHTML =
      "Couldn't reach the verification server. Make sure the backend is running (see backend/README) and try again.";
    console.error(err);
  }
}

function showResult(result, box) {
  const cls =
    result.verdict === "Verified" ? "good" : result.verdict === "Needs review" ? "medium" : "bad";

  let html = `<h3>Credibility Score: ${result.score}%</h3><p class="verdict"><strong>${result.verdict}</strong></p>`;

  if (result.liveWeather) {
    const loc = result.resolvedLocation || "this location";
    html += `<p class="live-compare">Live data for ${loc}: ${result.liveWeather.temperature}°C, ${result.liveWeather.rain} mm rain, ${result.liveWeather.wind} km/h wind.</p>`;
  }

  if (result.flags && result.flags.length) {
    html += `<ul>${result.flags.map((f) => `<li>${f}</li>`).join("")}</ul>`;
  } else {
    html += `<p>No issues detected — this report matches live conditions.</p>`;
  }

  box.hidden = false;
  box.className = `result-box ${cls}`;
  box.innerHTML = html;
}
