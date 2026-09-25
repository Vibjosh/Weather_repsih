/*
 * page1.js — "Report a weather update" quick-report form.
 * Wires up the event grid, dropzone, locate button, and recent list, and
 * submits reports to the backend (see api.js), which owns the fraud and
 * duplicate-report/file checks.
 */

(function () {
  const grid = document.getElementById("eventGrid");
  const eventError = document.getElementById("eventError");
  let selectedEvent = null;

  grid.addEventListener("click", (e) => {
    const btn = e.target.closest(".event-btn");
    if (!btn) return;
    grid.querySelectorAll(".event-btn").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedEvent = btn.dataset.value;
    eventError.hidden = true;
  });

  // ---- Photo/video dropzone preview ----
  const photoInput = document.getElementById("photo");
  const thumb = document.getElementById("thumb");
  const dropzoneText = document.getElementById("dropzoneText");

  photoInput.addEventListener("change", () => {
    const file = photoInput.files[0];
    if (!file) return;
    dropzoneText.textContent = file.name;
    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = (e) => {
        thumb.src = e.target.result;
        thumb.hidden = false;
      };
      reader.readAsDataURL(file);
    } else {
      thumb.hidden = true;
    }
  });

  // ---- "Use my current location" ----
  const locateBtn = document.getElementById("locateBtn");
  const locateDot = document.getElementById("locateDot");
  const coordsText = document.getElementById("coordsText");
  const cityInput = document.getElementById("city");
  const stateInput = document.getElementById("state");

  locateBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      coordsText.textContent = "Location isn't supported on this device — type it in instead.";
      return;
    }
    locateDot.classList.add("pulsing");
    coordsText.textContent = "Finding your location…";

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        locateDot.classList.remove("pulsing");
        try {
          const res = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=en`
          );
          const place = await res.json();
          const city = place.city || place.locality || "";
          const state = place.principalSubdivision || "";
          if (city) cityInput.value = city;
          if (state) stateInput.value = state;
          coordsText.textContent = `Location added: ${city || lat.toFixed(3)}${state ? ", " + state : ""}`;
        } catch {
          coordsText.textContent = `Location added (${lat.toFixed(3)}, ${lon.toFixed(3)})`;
        }
      },
      () => {
        locateDot.classList.remove("pulsing");
        coordsText.textContent = "Couldn't get your location — you can type it in instead.";
      }
    );
  });

  // ---- Submit ----
  const form = document.getElementById("reportForm");
  const successMsg = document.getElementById("successMsg");
  const recentSection = document.getElementById("recentSection");
  const recentList = document.getElementById("recentList");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!selectedEvent) {
      eventError.hidden = false;
      return;
    }
    const city = cityInput.value.trim();
    const state = stateInput.value.trim();
    if (!city) {
      cityInput.classList.add("invalid");
      cityInput.focus();
      return;
    }
    cityInput.classList.remove("invalid");

    const selectedBtn = grid.querySelector(".event-btn.selected");
    const icon = selectedBtn ? selectedBtn.querySelector("span").textContent : "📍";

    const data = {
      reporterId: document.getElementById("phone").value.trim() || "anonymous",
      location: [city, state].filter(Boolean).join(", "),
      eventType: selectedEvent,
      weather: selectedEvent,
      description: document.getElementById("description").value.trim(),
      temperature: "",
      humidity: "",
      rainfall: "",
      wind: "",
    };
    const file = photoInput.files[0] || null;

    successMsg.hidden = false;
    successMsg.style.color = "";
    successMsg.textContent = "Checking your report…";

    let result;
    try {
      result = await WeatherAPI.submitReport(data, file);
    } catch (err) {
      successMsg.style.color = "var(--severe)";
      successMsg.textContent =
        "Couldn't reach the verification server. Make sure the backend is running and try again.";
      console.error(err);
      return;
    }

    const isDuplicate = result.flags.some((f) => f.includes("Duplicate"));
    const pillClass = isDuplicate ? "low" : file ? "high" : "medium";
    const pillLabel = isDuplicate ? "Possible duplicate" : result.verdict;

    successMsg.style.color = isDuplicate ? "var(--severe)" : "var(--ok)";
    successMsg.textContent = isDuplicate
      ? "This looks like a report we've already logged for this spot today."
      : "Report logged — thanks for helping verify conditions on the ground.";

    recentSection.hidden = false;
    const li = document.createElement("li");
    li.className = "recent-item";
    li.innerHTML = `
      <span class="recent-icon">${icon}</span>
      <div class="recent-body">
        <p class="recent-title">${data.location}</p>
        <p class="recent-sub">${data.description || selectedEvent}</p>
        <p class="recent-time">${new Date().toLocaleTimeString()}</p>
      </div>
      <span class="pill ${pillClass}">${pillLabel}</span>
    `;
    recentList.prepend(li);

    if (!isDuplicate) {
      form.reset();
      grid.querySelectorAll(".event-btn").forEach((b) => b.classList.remove("selected"));
      selectedEvent = null;
      thumb.hidden = true;
      dropzoneText.textContent = "Tap to choose a file";
      coordsText.textContent = "Location not added yet.";
    }
  });
})();