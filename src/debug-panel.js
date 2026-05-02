const locationSourceLabels = {
  browser: "Browser",
  ip: "Approximate",
};

const elements = {
  controls: document.querySelector(".controls"),
  hex: document.querySelector("#hex-value"),
  scaleMin: document.querySelector("#scale-min-value"),
  scaleMax: document.querySelector("#scale-max-value"),
  expected: document.querySelector("#expected-value"),
  rain: document.querySelector("#rain-value"),
  forecastTime: document.querySelector("#forecast-time-value"),
  nextUpdate: document.querySelector("#next-update-value"),
  location: document.querySelector("#location-value"),
};

export function setDebugPanelVisible(isVisible) {
  elements.controls.hidden = !isVisible;
}

export function updatePanelGlow({ hex, scaleMinimum, scaleMaximum, expectedTemperature, rainProbability }) {
  elements.hex.value = hex;
  elements.scaleMin.textContent = formatTemperatureWithUnit(scaleMinimum);
  elements.scaleMax.textContent = formatTemperatureWithUnit(scaleMaximum);
  elements.expected.textContent = formatTemperatureWithUnit(expectedTemperature);
  elements.rain.textContent = formatPercent(rainProbability);
}

export function resetPanelGlow(hex) {
  elements.hex.value = hex;
  elements.scaleMin.textContent = "--";
  elements.scaleMax.textContent = "--";
  elements.expected.textContent = "--";
  elements.rain.textContent = "--";
  elements.forecastTime.textContent = "--";
}

export function updatePanelForecastTime(forecastTime) {
  elements.forecastTime.textContent = forecastTime;
}

export function updatePanelLocation(location) {
  elements.location.textContent = formatLocation(location);
}

export function updatePanelLocationMessage(message) {
  elements.location.textContent = message;
}

export function updatePanelNextRefresh(nextForecastUpdateAt) {
  if (!nextForecastUpdateAt) {
    elements.nextUpdate.textContent = "--";
    return;
  }

  const remainingSeconds = Math.max(0, Math.ceil((nextForecastUpdateAt - Date.now()) / 1000));
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;
  elements.nextUpdate.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
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

function formatLocation(location) {
  const latitudeDirection = location.latitude >= 0 ? "N" : "S";
  const longitudeDirection = location.longitude >= 0 ? "E" : "W";
  const sourceLabel = locationSourceLabels[location.source] ?? "Location";
  return `${sourceLabel}: ${Math.abs(location.latitude).toFixed(4)}°${latitudeDirection}, ${Math.abs(location.longitude).toFixed(4)}°${longitudeDirection}`;
}
