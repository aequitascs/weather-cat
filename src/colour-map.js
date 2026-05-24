import { getGlowColourChannels, getTemperatureLevel } from "./glow-colour.js";
import { getCurrentLocation } from "./location.js";
import { defaultTemperatureRange, fetchTemperatureRange } from "./weather.js";

const browserLocationTimeoutMs = 10000;

export function createColourMapController({
  colourMap,
  scaleMin,
  scaleMid,
  scaleMax,
}) {
  const context = colourMap.getContext("2d");
  const { width, height } = colourMap;
  const image = context.createImageData(width, height);
  let hasUpdatedScale = false;

  function renderColourMap(temperatureRange) {
    const temperatureScaleRange = temperatureRange.maximum - temperatureRange.minimum || 1;

    for (let y = 0; y < height; y += 1) {
      const rainLevel = 1 - y / (height - 1);

      for (let x = 0; x < width; x += 1) {
        const temperature = temperatureRange.minimum +
          (x / (width - 1)) * temperatureScaleRange;
        const temperatureLevel = getTemperatureLevel(
          temperature,
          temperatureRange.minimum,
          temperatureRange.maximum,
        );
        const colorChannels = getGlowColourChannels({ temperatureLevel, rainLevel });
        const index = (y * width + x) * 4;

        image.data[index] = Math.round(colorChannels.red * 255);
        image.data[index + 1] = Math.round(colorChannels.green * 255);
        image.data[index + 2] = Math.round(colorChannels.blue * 255);
        image.data[index + 3] = 255;
      }
    }

    context.putImageData(image, 0, 0);
  }

  function updateScaleLabels(temperatureRange) {
    const middleTemperature = (temperatureRange.minimum + temperatureRange.maximum) / 2;
    scaleMin.textContent = formatTemperatureWithUnit(temperatureRange.minimum);
    scaleMid.textContent = formatTemperatureWithUnit(middleTemperature);
    scaleMax.textContent = formatTemperatureWithUnit(temperatureRange.maximum);
    colourMap.setAttribute(
      "aria-label",
      `Calculated colour map: apparent temperature from ${formatTemperatureWithUnit(temperatureRange.minimum)} to ${formatTemperatureWithUnit(temperatureRange.maximum)} on the horizontal axis and rain probability from 0% to 100% on the vertical axis`,
    );
  }

  async function updateColourMapScale() {
    try {
      const currentLocation = await getCurrentLocation({
        browserLocationTimeoutMs,
        onLocationUpdate: updateColourMapForLocation,
      });
      await updateColourMapForLocation(currentLocation);
    } catch (error) {
      console.warn("Could not load colour map temperature scale from Open-Meteo.", error);
    }
  }

  async function updateColourMapForLocation(location) {
    const temperatureRange = await fetchTemperatureRange(location);
    renderColourMap(temperatureRange);
    updateScaleLabels(temperatureRange);
  }

  function initialize() {
    renderColourMap(defaultTemperatureRange);
    updateScaleLabels(defaultTemperatureRange);
  }

  function updateScaleOnce() {
    if (hasUpdatedScale) {
      return;
    }

    hasUpdatedScale = true;
    updateColourMapScale();
  }

  return {
    initialize,
    updateScaleOnce,
  };
}

function formatTemperature(temperature) {
  return Number.isInteger(temperature) ? String(temperature) : temperature.toFixed(1);
}

function formatTemperatureWithUnit(temperature) {
  return `${formatTemperature(temperature)}°C`;
}
