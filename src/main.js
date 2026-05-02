import * as THREE from "three";
import {
  resetPanelGlow,
  setDebugPanelVisible,
  updatePanelForecastTime,
  updatePanelGlow,
  updatePanelLocation,
  updatePanelLocationMessage,
  updatePanelNextRefresh,
} from "./debug-panel.js";
import {
  getGlowColourChannels,
  getRainLevel,
  getTemperatureLevel,
} from "./glow-colour.js";
import {
  getCurrentLocation,
  getLocationErrorMessage,
  LocationUnavailableError,
  locationsMatch,
} from "./location.js";
import {
  clampTemperatureToScale,
  fetchForecastPredictions,
  fetchTemperatureRange,
} from "./weather.js";

const canvas = document.querySelector("#glow-scene");
const isDebugMode = new URLSearchParams(window.location.search).get("mode") === "debug";
setDebugPanelVisible(isDebugMode);

const forecastRefreshIntervalMs = 5 * 60 * 1000;
const initialBrowserLocationTimeoutMs = 10000;
const browserLocationTimeoutMs = 10000;
const rainProbabilityMinimum = 0;
const rainProbabilityMaximum = 100;
const offSphereColour = 0x666a73;
const activeSphereEmissiveIntensity = 1.45;
const activeCoreLightIntensity = 26;
const glowFadeDurationMs = 5000;
const forecastCycleOffsets = [1, 2, 3];
const forecastCycleSequence = [0, 1, 2, 1];
const forecastCycleIntervalMs = glowFadeDurationMs;
let scaleMinimum = 0;
let scaleMaximum = 40;
let expectedTemperature = 20;
let rainProbability = null;
let currentLocation = null;
let nextForecastUpdateAt = null;
let forecastRefreshTimer = null;
let forecastCycleTimer = null;
let forecastCycleSequenceIndex = 0;
let forecastPredictions = [];
let glowTransition = null;
const renderedGlowState = {
  color: new THREE.Color(offSphereColour),
  emissiveIntensity: 0,
  lightIntensity: 0,
};

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
  color: offSphereColour,
  emissive: offSphereColour,
  emissiveIntensity: 0,
  metalness: 0.08,
  roughness: 0.28,
});
const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
sphere.position.y = 0.79;
group.add(sphere);

const standMaterial = new THREE.MeshPhysicalMaterial({
  color: 0xf7f8f5,
  roughness: 0.18,
  metalness: 0,
  clearcoat: 0.92,
  clearcoatRoughness: 0.14,
});

const concaveStandMaterial = standMaterial.clone();
concaveStandMaterial.side = THREE.BackSide;

const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.92, 0.5, 128, 1, true), standMaterial);
pedestal.position.y = -0.62;
pedestal.castShadow = true;
pedestal.receiveShadow = true;
group.add(pedestal);

const pedestalBase = new THREE.Mesh(new THREE.CircleGeometry(0.92, 128), standMaterial);
pedestalBase.rotation.x = -Math.PI / 2;
pedestalBase.position.y = -0.87;
pedestalBase.castShadow = true;
pedestalBase.receiveShadow = true;
group.add(pedestalBase);

const pedestalBowl = new THREE.Mesh(
  new THREE.SphereGeometry(1.35, 128, 24, 0, Math.PI * 2, Math.PI - 0.53, 0.53),
  concaveStandMaterial,
);
pedestalBowl.position.y = 0.79;
pedestalBowl.castShadow = true;
pedestalBowl.receiveShadow = true;
group.add(pedestalBowl);

const coreLight = new THREE.PointLight(offSphereColour, 0, 9, 1.8);
coreLight.position.set(0, 0.79, 0.6);
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

function getWeatherGlowState() {
  const temperatureLevel = getTemperatureLevel(
    expectedTemperature,
    scaleMinimum,
    scaleMaximum,
  );
  const rainLevel = getRainLevel(
    rainProbability,
    rainProbabilityMinimum,
    rainProbabilityMaximum,
  );
  const colorChannels = getGlowColourChannels({ temperatureLevel, rainLevel });
  const color = new THREE.Color(
    colorChannels.red,
    colorChannels.green,
    colorChannels.blue,
  );

  return {
    color,
    emissiveIntensity: activeSphereEmissiveIntensity,
    lightIntensity: activeCoreLightIntensity,
  };
}

function updateGlowColour() {
  const glowState = getWeatherGlowState();
  const color = glowState.color;
  const hex = `#${color.getHexString()}`;

  startGlowTransition(glowState);

  updatePanelGlow({
    hex,
    scaleMinimum,
    scaleMaximum,
    expectedTemperature,
    rainProbability,
  });
  document.documentElement.style.setProperty("--accent", hex);
}

function deactivateForecastGlow({ fade = true } = {}) {
  clearInterval(forecastCycleTimer);
  forecastPredictions = [];
  forecastCycleSequenceIndex = 0;
  expectedTemperature = 20;
  rainProbability = null;
  const hex = `#${new THREE.Color(offSphereColour).getHexString()}`;
  resetPanelGlow(hex);
  document.documentElement.style.setProperty("--accent", hex);

  const offState = {
    color: new THREE.Color(offSphereColour),
    emissiveIntensity: 0,
    lightIntensity: 0,
  };

  if (fade) {
    startGlowTransition(offState);
    return;
  }

  glowTransition = null;
  applyGlowState(offState);
}

function startGlowTransition(targetState) {
  glowTransition = {
    startedAt: performance.now(),
    duration: glowFadeDurationMs,
    from: {
      color: renderedGlowState.color.clone(),
      emissiveIntensity: renderedGlowState.emissiveIntensity,
      lightIntensity: renderedGlowState.lightIntensity,
    },
    to: {
      color: targetState.color.clone(),
      emissiveIntensity: targetState.emissiveIntensity,
      lightIntensity: targetState.lightIntensity,
    },
  };
}

function updateGlowTransition(time) {
  if (!glowTransition) {
    return;
  }

  const progress = THREE.MathUtils.clamp(
    (time - glowTransition.startedAt) / glowTransition.duration,
    0,
    1,
  );
  const easedProgress = progress * progress * (3 - 2 * progress);
  const color = new THREE.Color().lerpColors(
    glowTransition.from.color,
    glowTransition.to.color,
    easedProgress,
  );

  applyGlowState({
    color,
    emissiveIntensity: THREE.MathUtils.lerp(
      glowTransition.from.emissiveIntensity,
      glowTransition.to.emissiveIntensity,
      easedProgress,
    ),
    lightIntensity: THREE.MathUtils.lerp(
      glowTransition.from.lightIntensity,
      glowTransition.to.lightIntensity,
      easedProgress,
    ),
  });

  if (progress === 1) {
    glowTransition = null;
  }
}

function applyGlowState(glowState) {
  renderedGlowState.color.copy(glowState.color);
  renderedGlowState.emissiveIntensity = glowState.emissiveIntensity;
  renderedGlowState.lightIntensity = glowState.lightIntensity;

  sphereMaterial.color.copy(glowState.color);
  sphereMaterial.emissive.copy(glowState.color);
  sphereMaterial.emissiveIntensity = glowState.emissiveIntensity;
  coreLight.color.copy(glowState.color);
  coreLight.intensity = glowState.lightIntensity;
}

function resizeRenderer() {
  const width = window.innerWidth;
  const height = window.innerHeight;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

window.addEventListener("resize", resizeRenderer);
initializeOffGlowState();
setInitialTemperatureLevel();
setInterval(updateRefreshCountdown, 1000);

function initializeOffGlowState() {
  applyGlowState(renderedGlowState);
  const hex = `#${renderedGlowState.color.getHexString()}`;
  resetPanelGlow(hex);
  document.documentElement.style.setProperty("--accent", hex);
}

async function setInitialTemperatureLevel() {
  try {
    await refreshWeatherFromCurrentLocation({
      browserLocationTimeoutMs: initialBrowserLocationTimeoutMs,
    });
  } catch (error) {
    deactivateForecastGlow({ fade: false });
    nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
    updateRefreshCountdown();
    updatePanelLocationMessage(getLocationErrorMessage(error));
    console.warn("Could not load local temperature scale from Open-Meteo.", error);
  } finally {
    scheduleForecastRefresh();
  }
}

async function refreshWeatherFromCurrentLocation({ browserLocationTimeoutMs } = {}) {
  const refreshedLocation = await getCurrentLocation({ browserLocationTimeoutMs });
  const locationChanged = !currentLocation || !locationsMatch(currentLocation, refreshedLocation);
  currentLocation = refreshedLocation;
  updatePanelLocation(currentLocation);

  if (locationChanged) {
    const historicalRange = await fetchTemperatureRange(currentLocation);
    scaleMinimum = historicalRange.minimum;
    scaleMaximum = historicalRange.maximum;
  }

  await refreshForecast(currentLocation);
}

async function refreshForecast(location) {
  const predictions = await fetchForecastPredictions(location, forecastCycleOffsets);
  if (predictions.length === 0) {
    throw new Error("Open-Meteo response did not include an hourly temperature forecast");
  }

  forecastPredictions = predictions;
  forecastCycleSequenceIndex %= forecastCycleSequence.length;
  applyForecastPrediction(getCurrentForecastPrediction());
  scheduleForecastCycle();
  nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
  updateRefreshCountdown();
}

function applyForecastPrediction(prediction) {
  expectedTemperature = clampTemperatureToScale(
    prediction.temperature,
    scaleMinimum,
    scaleMaximum,
  );
  rainProbability = prediction.rainProbability;
  updatePanelForecastTime(prediction.forecastTime);
  updateGlowColour();
}

function scheduleForecastCycle() {
  clearInterval(forecastCycleTimer);
  forecastCycleTimer = setInterval(showNextForecastPrediction, forecastCycleIntervalMs);
}

function showNextForecastPrediction() {
  if (forecastPredictions.length === 0) {
    return;
  }

  forecastCycleSequenceIndex = (forecastCycleSequenceIndex + 1) % forecastCycleSequence.length;
  applyForecastPrediction(getCurrentForecastPrediction());
}

function getCurrentForecastPrediction() {
  const predictionIndex = forecastCycleSequence[forecastCycleSequenceIndex];
  return forecastPredictions[predictionIndex] ?? forecastPredictions[0];
}

function scheduleForecastRefresh() {
  clearInterval(forecastRefreshTimer);
  forecastRefreshTimer = setInterval(async () => {
    try {
      await refreshWeatherFromCurrentLocation();
    } catch (error) {
      if (error instanceof LocationUnavailableError) {
        deactivateForecastGlow();
        updatePanelLocationMessage(getLocationErrorMessage(error));
      }
      nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
      updateRefreshCountdown();
      console.warn("Could not refresh local temperature forecast from Open-Meteo.", error);
    }
  }, forecastRefreshIntervalMs);
}

function updateRefreshCountdown() {
  updatePanelNextRefresh(nextForecastUpdateAt);
}

function animate(time = 0) {
  const seconds = time * 0.001;
  group.rotation.y = seconds * 0.24;
  group.rotation.x = Math.sin(seconds * 0.45) * 0.06;
  stars.rotation.y = seconds * 0.015;
  stars.rotation.x = seconds * 0.006;
  updateGlowTransition(time);

  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
