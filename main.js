import * as THREE from "three";

const canvas = document.querySelector("#glow-scene");
const values = {
  hex: document.querySelector("#hex-value"),
  scaleMin: document.querySelector("#scale-min-value"),
  scaleMax: document.querySelector("#scale-max-value"),
  expected: document.querySelector("#expected-value"),
  rain: document.querySelector("#rain-value"),
  interval: document.querySelector("#interval-value"),
  nextUpdate: document.querySelector("#next-update-value"),
  location: document.querySelector("#location-value"),
};

const forecastRefreshIntervalMs = 5 * 60 * 1000;
const defaultLocation = {
  latitude: -33.9249,
  longitude: 18.4241,
  source: "default",
};
const locationSourceLabels = {
  browser: "Browser",
  ip: "Approximate",
  default: "Default: Cape Town",
};
let scaleMinimum = 0;
let scaleMaximum = 40;
let expectedTemperature = 20;
let rainProbability = null;
let browserLocation = null;
let nextForecastUpdateAt = null;
let forecastRefreshTimer = null;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x050609, 0.055);

const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0.08, 5.8);

const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  alpha: true,
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;
renderer.toneMappingExposure = 1;

const group = new THREE.Group();
scene.add(group);

const sphereGeometry = new THREE.SphereGeometry(1.35, 96, 96);
const sphereMaterial = new THREE.MeshStandardMaterial({
  color: 0x800080,
  emissive: 0x800080,
  emissiveIntensity: 1.45,
  metalness: 0.08,
  roughness: 0.28,
});
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.y = 0.95;
group.add(sphere);

const standMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xf7f8f5,
  roughness: 0.42,
  metalness: 0,
  clearcoat: 0.7,
  clearcoatRoughness: 0.28,
});

const base = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.34, 0.34, 96), standMaterial);
base.position.y = -0.78;
base.castShadow = true;
base.receiveShadow = true;
group.add(base);

const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.54, 1.08, 96), standMaterial);
stem.position.y = -0.18;
stem.castShadow = true;
stem.receiveShadow = true;
group.add(stem);

const cradle = new THREE.Mesh(new THREE.CylinderGeometry(0.74, 0.58, 0.22, 96), standMaterial);
cradle.position.y = 0.47;
cradle.castShadow = true;
cradle.receiveShadow = true;
group.add(cradle);

const coreLight = new THREE.PointLight(0x800080, 26, 9, 1.8);
coreLight.position.set(0, 0.95, 0.6);
scene.add(coreLight);

const keyLight = new THREE.DirectionalLight(0xffffff, 1.7);
keyLight.position.set(-3, 4, 5);
scene.add(keyLight);

const fillLight = new THREE.AmbientLight(0x516070, 0.46);
scene.add(fillLight);

const starGeometry = new THREE.BufferGeometry();
const starCount = 700;
const starPositions = new Float32Array(starCount * 3);
for (let i = 0; i < starCount; i += 1) {
  const radius = 14 + Math.random() * 24;
  const theta = Math.random() * Math.PI * 2;
  const phi = Math.acos(THREE.MathUtils.randFloatSpread(2));
  starPositions[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
  starPositions[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
  starPositions[i * 3 + 2] = radius * Math.cos(phi);
}
starGeometry.setAttribute("position", new THREE.BufferAttribute(starPositions, 3));
const stars = new THREE.Points(
  starGeometry,
  new THREE.PointsMaterial({
    color: 0xe8f6ff,
    size: 0.035,
    transparent: true,
    opacity: 0.62,
    depthWrite: false,
  }),
);
scene.add(stars);

function updateGlowColour() {
  const level = expectedTemperature;
  const normalizedLevel = THREE.MathUtils.clamp(level, scaleMinimum, scaleMaximum);
  const scaleRange = scaleMaximum - scaleMinimum || 1;
  const temperatureLevel = (normalizedLevel - scaleMinimum) / scaleRange;
  const color = new THREE.Color(
    Math.min(temperatureLevel * 2, 1),
    Math.min((1 - temperatureLevel) * 2, 1),
    0,
  );
  const hex = `#${color.getHexString()}`;

  sphereMaterial.emissive.copy(color);
  sphereMaterial.color.copy(color);
  coreLight.color.copy(color);

  values.hex.value = hex;
  values.scaleMin.textContent = formatTemperatureWithUnit(scaleMinimum);
  values.scaleMax.textContent = formatTemperatureWithUnit(scaleMaximum);
  values.expected.textContent = formatTemperatureWithUnit(expectedTemperature);
  values.rain.textContent = formatPercent(rainProbability);
  document.documentElement.style.setProperty("--accent", hex);
}

function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", resizeRenderer);
updateGlowColour();
setInitialTemperatureLevel();
setInterval(updateRefreshCountdown, 1000);

async function setInitialTemperatureLevel() {
  try {
    await refreshWeatherFromCurrentLocation();
    scheduleForecastRefresh();
  } catch (error) {
    values.location.textContent = getLocationErrorMessage(error);
    console.warn("Could not load local temperature scale from Open-Meteo.", error);
  }
}

async function refreshWeatherFromCurrentLocation() {
  const currentLocation = await getCurrentLocation();
  const locationChanged = !browserLocation || !locationsMatch(browserLocation, currentLocation);
  browserLocation = currentLocation;
  values.location.textContent = formatLocation(browserLocation);

  if (locationChanged) {
    const historicalRange = await fetchTemperatureRange(browserLocation);
    scaleMinimum = historicalRange.minimum;
    scaleMaximum = historicalRange.maximum;
  }

  await refreshForecast(browserLocation);
}

async function refreshForecast(location) {
  const forecast = await fetchJson(getHourlyForecastUrl(location));
  const prediction = getTemperatureOneHourFromNow(forecast);
  if (typeof prediction?.temperature !== "number") {
    throw new Error("Open-Meteo response did not include an hourly temperature forecast");
  }

  expectedTemperature = THREE.MathUtils.clamp(
    prediction.temperature,
    scaleMinimum,
    scaleMaximum,
  );
  rainProbability = prediction.rainProbability;
  values.interval.textContent = prediction.interval;
  nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
  updateGlowColour();
  updateRefreshCountdown();
}

function scheduleForecastRefresh() {
  clearInterval(forecastRefreshTimer);
  forecastRefreshTimer = setInterval(async () => {
    try {
      await refreshWeatherFromCurrentLocation();
    } catch (error) {
      nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
      updateRefreshCountdown();
      console.warn("Could not refresh local temperature forecast from Open-Meteo.", error);
    }
  }, forecastRefreshIntervalMs);
}

async function fetchTemperatureRange(location) {
  const { startDate, endDate } = getLastTwelveMonthDateRange();
  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${location.latitude}&longitude=${location.longitude}&start_date=${startDate}&end_date=${endDate}&daily=temperature_2m_min,temperature_2m_max&temperature_unit=celsius&timezone=auto`;
  const historicalWeather = await fetchJson(archiveUrl);
  const dailyMinimums = historicalWeather.daily?.temperature_2m_min ?? [];
  const dailyMaximums = historicalWeather.daily?.temperature_2m_max ?? [];
  const validMinimums = dailyMinimums.filter(isNumber);
  const validMaximums = dailyMaximums.filter(isNumber);

  if (validMinimums.length === 0) {
    throw new Error("Open-Meteo archive response did not include daily.temperature_2m_min values");
  }
  if (validMaximums.length === 0) {
    throw new Error("Open-Meteo archive response did not include daily.temperature_2m_max values");
  }

  return {
    minimum: Math.min(...validMinimums),
    maximum: Math.max(...validMaximums),
  };
}

function getHourlyForecastUrl(location) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=temperature_2m,precipitation_probability&forecast_hours=6&temperature_unit=celsius&timezone=auto`;
}

function getTemperatureOneHourFromNow(forecast) {
  const times = forecast.hourly?.time ?? [];
  const temperatures = forecast.hourly?.temperature_2m ?? [];
  const rainProbabilities = forecast.hourly?.precipitation_probability ?? [];
  const utcOffsetSeconds = forecast.utc_offset_seconds ?? 0;
  const targetTime = Date.now() + 60 * 60 * 1000;

  let closestTemperature = null;
  let closestRainProbability = null;
  let closestTime = null;
  let closestDistance = Infinity;

  times.forEach((time, index) => {
    const forecastTime = Date.parse(`${time}:00Z`) - utcOffsetSeconds * 1000;
    const distance = Math.abs(forecastTime - targetTime);

    if (distance < closestDistance && typeof temperatures[index] === "number") {
      closestDistance = distance;
      closestTemperature = temperatures[index];
      closestRainProbability = rainProbabilities[index];
      closestTime = time;
    }
  });

  if (closestTemperature === null || closestTime === null) {
    return null;
  }

  return {
    temperature: closestTemperature,
    rainProbability: closestRainProbability,
    interval: formatPredictionInterval(closestTime, forecast.timezone_abbreviation),
  };
}

function getBrowserLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(new Error("Geolocation requires HTTPS or localhost"));
      return;
    }

    if (!navigator.geolocation) {
      reject(new Error("Browser geolocation is not available"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: Number(position.coords.latitude.toFixed(4)),
          longitude: Number(position.coords.longitude.toFixed(4)),
          source: "browser",
        });
      },
      (error) => reject(error),
      {
        enableHighAccuracy: false,
        maximumAge: 0,
        timeout: 10000,
      },
    );
  });
}

async function getCurrentLocation() {
  try {
    return await getBrowserLocation();
  } catch (error) {
    logGeolocationProblem("browser", error);
  }

  try {
    return await getIpLocation();
  } catch (error) {
    logGeolocationProblem("ip", error);
  }

  return { ...defaultLocation };
}

async function getIpLocation() {
  const ipLocation = await fetchJson("https://ipapi.co/json/", "IP geolocation");
  const latitude = Number(ipLocation.latitude);
  const longitude = Number(ipLocation.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    throw new Error("IP geolocation response did not include latitude and longitude");
  }

  return {
    latitude: Number(latitude.toFixed(4)),
    longitude: Number(longitude.toFixed(4)),
    source: "ip",
  };
}

async function fetchJson(url, serviceName = "Open-Meteo") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${serviceName} returned ${response.status}`);
  }

  return response.json();
}

function getLastTwelveMonthDateRange() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatTemperature(temperature) {
  return Number.isInteger(temperature) ? String(temperature) : temperature.toFixed(1);
}

function formatTemperatureWithUnit(temperature) {
  return `${formatTemperature(temperature)}°C`;
}

function formatPercent(value) {
  return typeof value === "number" ? `${Math.round(value)}%` : "--";
}

function formatPredictionInterval(startTime, timezoneAbbreviation) {
  const start = new Date(`${startTime}:00`);
  const end = new Date(start);
  end.setHours(end.getHours() + 1);
  const formatter = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timezone = timezoneAbbreviation ? ` ${timezoneAbbreviation}` : "";

  return `${formatter.format(start)}-${formatter.format(end)}${timezone}`;
}

function formatLocation(location) {
  const latitudeDirection = location.latitude >= 0 ? "N" : "S";
  const longitudeDirection = location.longitude >= 0 ? "E" : "W";
  const sourceLabel = locationSourceLabels[location.source] ?? "Location";
  return `${sourceLabel}: ${Math.abs(location.latitude).toFixed(4)}°${latitudeDirection}, ${Math.abs(location.longitude).toFixed(4)}°${longitudeDirection}`;
}

function locationsMatch(firstLocation, secondLocation) {
  return (
    firstLocation.latitude === secondLocation.latitude &&
    firstLocation.longitude === secondLocation.longitude
  );
}

function logGeolocationProblem(method, error) {
  const message = getLocationErrorMessage(error);
  console.warn(`Geolocation ${method} failed: ${message}`);
}

function updateRefreshCountdown() {
  if (!nextForecastUpdateAt) {
    values.nextUpdate.textContent = "--";
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((nextForecastUpdateAt - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  values.nextUpdate.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function getLocationErrorMessage(error) {
  if (error?.code === 1) {
    return "Location permission denied";
  }
  if (error?.code === 2) {
    return "Location unavailable";
  }
  if (error?.code === 3) {
    return "Location timed out";
  }

  return error?.message ?? "Location unavailable";
}

function isNumber(value) {
  return typeof value === "number";
}

function animate(time = 0) {
  const seconds = time * 0.001;
  group.rotation.y = seconds * 0.24;
  group.rotation.x = Math.sin(seconds * 0.45) * 0.06;
  stars.rotation.y = seconds * 0.015;
  stars.rotation.x = seconds * 0.006;

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
