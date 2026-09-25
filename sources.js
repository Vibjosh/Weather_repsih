async function getWeather() {

    const locationInput = document.getElementById("location").value.trim();

    if (locationInput === "") {
        alert("Please enter a location");
        return;
    }

    document.getElementById("openStatus").textContent = "Looking up location...";
    document.getElementById("apiStatus").textContent = "Looking up location...";

    // -------------------------
    // GEOCODE the entered location (free, keyless — Open-Meteo)
    // -------------------------

    let latitude, longitude, resolvedName;

    try {

        const geoURL =
            `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(locationInput)}&count=1&language=en&format=json`;

        const geoResponse = await fetch(geoURL);
        const geoData = await geoResponse.json();

        if (!geoData.results || !geoData.results.length) {
            document.getElementById("openStatus").textContent = "✕ Location not found";
            document.getElementById("apiStatus").textContent = "✕ Location not found";
            alert("Could not find that location — try a nearby larger city or check the spelling.");
            return;
        }

        latitude = geoData.results[0].latitude;
        longitude = geoData.results[0].longitude;
        resolvedName = [geoData.results[0].name, geoData.results[0].admin1, geoData.results[0].country]
            .filter(Boolean)
            .join(", ");

    } catch (error) {
        document.getElementById("openStatus").textContent = "✕ Could not look up location";
        document.getElementById("apiStatus").textContent = "✕ Could not look up location";
        console.log(error);
        return;
    }


    // -------------------------
    // OPEN-METEO
    // -------------------------

    try {

        const openURL =
            `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,rain,wind_speed_10m`;

        const response = await fetch(openURL);

        const data = await response.json();

        document.getElementById("openTemp").textContent =
            data.current.temperature_2m;

        document.getElementById("openHumidity").textContent =
            data.current.relative_humidity_2m;

        document.getElementById("openRain").textContent =
            data.current.rain;

        document.getElementById("openWind").textContent =
            data.current.wind_speed_10m;

        document.getElementById("openStatus").textContent =
            `✓ Data received (${resolvedName})`;

    }

    catch (error) {

        document.getElementById("openStatus").textContent =
            "✕ Unable to fetch data";

        console.log(error);
    }


    // -------------------------
    // WEATHER API (optional second source)
    // -------------------------

    // Get a free key at https://www.weatherapi.com/ and paste it below to
    // enable true two-source cross-verification. Without a key this source
    // is skipped instead of silently failing.
    const API_KEY = "YOUR_API_KEY";

    if (!API_KEY || API_KEY === "YOUR_API_KEY") {
        document.getElementById("apiStatus").textContent =
            "Add a free WeatherAPI.com key in sources.js to enable this source";
        document.getElementById("verificationResult").textContent =
            "Only one live source is active right now — add a WeatherAPI key above for full cross-verification.";
        return;
    }

    try {

        const apiURL =
            `https://api.weatherapi.com/v1/current.json?key=${API_KEY}&q=${latitude},${longitude}`;

        const response = await fetch(apiURL);

        const data = await response.json();

        document.getElementById("apiTemp").textContent =
            data.current.temp_c;

        document.getElementById("apiHumidity").textContent =
            data.current.humidity;

        document.getElementById("apiRain").textContent =
            data.current.precip_mm;

        document.getElementById("apiWind").textContent =
            data.current.wind_kph;

        document.getElementById("apiStatus").textContent =
            "✓ Data received";


        // -------------------------
        // COMPARE RESULTS
        // -------------------------

        const openTemp =
            parseFloat(document.getElementById("openTemp").textContent);

        const apiTemp =
            parseFloat(data.current.temp_c);

        const openRain =
            parseFloat(document.getElementById("openRain").textContent);

        const apiRain =
            parseFloat(data.current.precip_mm);


        const tempDifference =
            Math.abs(openTemp - apiTemp);

        const rainDifference =
            Math.abs(openRain - apiRain);


        document.getElementById("temperatureDifference").textContent =
            `Temperature difference: ${tempDifference.toFixed(1)} °C`;

        document.getElementById("rainDifference").textContent =
            `Rainfall difference: ${rainDifference.toFixed(1)} mm`;


        if (tempDifference < 2 && rainDifference < 5) {

            document.getElementById("verificationResult").textContent =
                "✓ Sources generally agree — high consistency";

        } else {

            document.getElementById("verificationResult").textContent =
                "⚠️ Sources show significant differences — review required";
        }

    }

    catch (error) {

        document.getElementById("apiStatus").textContent =
            "✕ Unable to fetch data";

        console.log(error);
    }
}
