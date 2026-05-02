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
import { createForecastCycle } from "./forecast-cycle.js";
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
import { createWeatherScene } from "./scene.js";
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
const offGlowState = {
  color: new THREE.Color(offSphereColour),
  emissiveIntensity: 0,
  lightIntensity: 0,
};
const offGlowHex = `#${new THREE.Color(offSphereColour).getHexString()}`;
const weatherState = {
  scaleMinimum: 0,
  scaleMaximum: 40,
  expectedTemperature: 20,
  rainProbability: null,
  currentLocation: null,
  nextForecastUpdateAt: null,
};
let forecastRefreshTimer = null;

const weatherScene = createWeatherScene(canvas, {
  offSphereColour,
  glowFadeDurationMs,
});
const forecastCycle = createForecastCycle({
  sequence: forecastCycleSequence,
  intervalMs: forecastCycleIntervalMs,
  onPrediction: applyForecastPrediction,
});

window.addEventListener("resize", weatherScene.resize);
initializeOffGlowState();
initializeWeather();
setInterval(updateRefreshCountdown, 1000);
weatherScene.animate();

function initializeOffGlowState() {
  weatherScene.applyGlowState(offGlowState);
  const hex = weatherScene.getRenderedHex();
  resetPanelGlow(hex);
  document.documentElement.style.setProperty("--accent", hex);
}

async function initializeWeather() {
  try {
    await refreshWeatherFromCurrentLocation({
      browserLocationTimeoutMs: initialBrowserLocationTimeoutMs,
    });
  } catch (error) {
    deactivateForecastGlow({ fade: false });
    weatherState.nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
    updateRefreshCountdown();
    updatePanelLocationMessage(getLocationErrorMessage(error));
    console.warn("Could not load local temperature scale from Open-Meteo.", error);
  } finally {
    scheduleForecastRefresh();
  }
}

async function refreshWeatherFromCurrentLocation({ browserLocationTimeoutMs } = {}) {
  const refreshedLocation = await getCurrentLocation({ browserLocationTimeoutMs });
  const locationChanged = !weatherState.currentLocation ||
    !locationsMatch(weatherState.currentLocation, refreshedLocation);
  weatherState.currentLocation = refreshedLocation;
  updatePanelLocation(weatherState.currentLocation);

  if (locationChanged) {
    const historicalRange = await fetchTemperatureRange(weatherState.currentLocation);
    weatherState.scaleMinimum = historicalRange.minimum;
    weatherState.scaleMaximum = historicalRange.maximum;
  }

  await refreshForecast(weatherState.currentLocation);
}

async function refreshForecast(location) {
  const predictions = await fetchForecastPredictions(location, forecastCycleOffsets);
  if (predictions.length === 0) {
    throw new Error("Open-Meteo response did not include an hourly temperature forecast");
  }

  forecastCycle.setPredictions(predictions);
  applyForecastPrediction(forecastCycle.getCurrentPrediction());
  forecastCycle.start();
  weatherState.nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
  updateRefreshCountdown();
}

function applyForecastPrediction(prediction) {
  weatherState.expectedTemperature = clampTemperatureToScale(
    prediction.temperature,
    weatherState.scaleMinimum,
    weatherState.scaleMaximum,
  );
  weatherState.rainProbability = prediction.rainProbability;
  updatePanelForecastTime(prediction.forecastTime);
  updateGlowColour();
}

function updateGlowColour() {
  const glowState = getWeatherGlowState();
  const hex = `#${glowState.color.getHexString()}`;

  weatherScene.startGlowTransition(glowState);

  updatePanelGlow({
    hex,
    scaleMinimum: weatherState.scaleMinimum,
    scaleMaximum: weatherState.scaleMaximum,
    expectedTemperature: weatherState.expectedTemperature,
    rainProbability: weatherState.rainProbability,
  });
  document.documentElement.style.setProperty("--accent", hex);
}

function getWeatherGlowState() {
  const temperatureLevel = getTemperatureLevel(
    weatherState.expectedTemperature,
    weatherState.scaleMinimum,
    weatherState.scaleMaximum,
  );
  const rainLevel = getRainLevel(
    weatherState.rainProbability,
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

function deactivateForecastGlow({ fade = true } = {}) {
  forecastCycle.reset();
  weatherState.expectedTemperature = 20;
  weatherState.rainProbability = null;
  resetPanelGlow(offGlowHex);
  document.documentElement.style.setProperty("--accent", offGlowHex);

  if (fade) {
    weatherScene.startGlowTransition(offGlowState);
    return;
  }

  weatherScene.clearGlowTransition();
  weatherScene.applyGlowState(offGlowState);
}

function scheduleForecastRefresh() {
  clearInterval(forecastRefreshTimer);
  forecastRefreshTimer = setInterval(async () => {
    try {
      await refreshWeatherFromCurrentLocation({
        browserLocationTimeoutMs,
      });
    } catch (error) {
      if (error instanceof LocationUnavailableError) {
        deactivateForecastGlow();
        updatePanelLocationMessage(getLocationErrorMessage(error));
      }
      weatherState.nextForecastUpdateAt = Date.now() + forecastRefreshIntervalMs;
      updateRefreshCountdown();
      console.warn("Could not refresh local temperature forecast from Open-Meteo.", error);
    }
  }, forecastRefreshIntervalMs);
}

function updateRefreshCountdown() {
  updatePanelNextRefresh(weatherState.nextForecastUpdateAt);
}
