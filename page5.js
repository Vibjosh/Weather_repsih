/*
 * page5.js — National Weather Analytics dashboard.
 * Pulls real aggregated stats and recent reports from the backend, which
 * every submission (from page1.html and page2.html) writes to.
 */

(function () {
  function fmt(n, digits = 1) {
    return n === null || n === undefined || isNaN(n) ? "--" : Number(n).toFixed(digits);
  }

  function verdictClass(verdict) {
    return verdict === "Verified" ? "good" : verdict === "Needs review" ? "medium" : "bad";
  }

  function renderDashboard(stats) {
    document.getElementById("statTemp").textContent =
      stats.avgTemperature !== null ? `${fmt(stats.avgTemperature)}°C` : "No data yet";
    document.getElementById("statHumidity").textContent =
      stats.avgHumidity !== null ? `${fmt(stats.avgHumidity)}%` : "No data yet";
    document.getElementById("statRainfall").textContent =
      stats.avgRainfall !== null ? `${fmt(stats.avgRainfall)} mm` : "No data yet";
    document.getElementById("statFlood").textContent = stats.floodRisk;
  }

  function renderRecent(reports) {
    const list = document.getElementById("recentReports");
    if (!reports.length) {
      list.innerHTML =
        "<p class='empty'>No reports submitted yet. Submit one from the Report page to see it here.</p>";
      return;
    }

    list.innerHTML = reports
      .map((r) => {
        const cls = verdictClass(r.verdict);
        const flagsHtml =
          r.flags && r.flags.length ? `<ul>${r.flags.map((f) => `<li>${f}</li>`).join("")}</ul>` : "";
        const photoHtml = r.photoUrl
          ? `<img class="report-photo" src="${WeatherAPI.photoUrl(r.photoUrl)}" alt="Photo attached to this report">`
          : "";
        return `
        <div class="report-item ${cls}">
          <div class="report-item-head">
            <strong>${r.resolved_location || r.location || "Unknown location"}</strong>
            <span class="pill ${cls}">${r.score}% · ${r.verdict}</span>
          </div>
          <p class="report-meta">${r.weather || ""} · ${r.temperature !== null ? r.temperature + "°C" : "--"} · ${
          r.rainfall !== null ? r.rainfall + "mm rain" : "no rainfall data"
        } · ${new Date(r.timestamp).toLocaleString()}</p>
          ${photoHtml}
          ${flagsHtml}
        </div>`;
      })
      .join("");
  }

  async function load() {
    const recentReports = document.getElementById("recentReports");
    try {
      const [stats, reports] = await Promise.all([
        WeatherAPI.getDashboard(),
        WeatherAPI.getRecentReports(8),
      ]);
      renderDashboard(stats);
      renderRecent(reports);
    } catch (err) {
      recentReports.innerHTML =
        "<p class='empty'>Couldn't reach the backend server. Make sure it's running (see backend/README) and refresh this page.</p>";
      console.error(err);
    }
  }

  load();
})();
