/*
 * api.js — talks to the Flask backend (see /backend). Replaces the old
 * verify.js, which did fraud/duplicate checks in the browser — meaning
 * anyone could bypass them by editing the page's JavaScript, and every
 * user only ever saw their own device's reports (localStorage).
 *
 * Now the browser only collects the form data; the server decides the
 * score, verdict and flags, and every user reads from the same database.
 *
 * Change API_BASE once you deploy the backend somewhere other than your
 * own machine (Render, Railway, PythonAnywhere, etc).
 */

const API_BASE = "http://localhost:5000";

const WeatherAPI = {
  async submitReport(data, file) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => formData.append(key, value ?? ""));
    if (file) formData.append("photo", file);

    const res = await fetch(`${API_BASE}/api/reports`, { method: "POST", body: formData });
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return res.json();
  },

  async getRecentReports(limit = 8) {
    const res = await fetch(`${API_BASE}/api/reports?limit=${limit}`);
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return res.json();
  },

  async getDashboard() {
    const res = await fetch(`${API_BASE}/api/dashboard`);
    if (!res.ok) throw new Error(`Server responded with ${res.status}`);
    return res.json();
  },

  photoUrl(path) {
    return path ? `${API_BASE}${path}` : null;
  },
};
