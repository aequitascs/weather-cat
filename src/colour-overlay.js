import { createColourMapController } from "./colour-map.js";

export function initializeColourOverlay() {
  const colourMapOverlay = document.querySelector("#colour-map-overlay");
  const showColourMapControl = document.querySelector("#show-colour-map-control");
  const hideColourMapControl = document.querySelector("#hide-colour-map-control");
  const colourMap = createColourMapController({
    colourMap: document.querySelector("#colour-map"),
    scaleMin: document.querySelector("#colour-scale-min"),
    scaleMid: document.querySelector("#colour-scale-mid"),
    scaleMax: document.querySelector("#colour-scale-max"),
    marker: document.querySelector("#colour-map-marker"),
  });

  colourMap.initialize();

  showColourMapControl.addEventListener("click", () => {
    colourMapOverlay.hidden = false;
  });
  hideColourMapControl.addEventListener("click", () => {
    colourMapOverlay.hidden = true;
  });

  return {
    updateMarker: colourMap.updateMarker,
    updateTemperatureRange: colourMap.updateTemperatureRange,
  };
}
