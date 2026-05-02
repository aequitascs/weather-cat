import { getGlowColourChannels } from "./glow-colour.js";

const colourMap = document.querySelector("#colour-map");
const context = colourMap.getContext("2d");
const { width, height } = colourMap;
const image = context.createImageData(width, height);

for (let y = 0; y < height; y += 1) {
  const rainLevel = 1 - y / (height - 1);

  for (let x = 0; x < width; x += 1) {
    const temperatureLevel = x / (width - 1);
    const colorChannels = getGlowColourChannels({ temperatureLevel, rainLevel });
    const index = (y * width + x) * 4;

    image.data[index] = Math.round(colorChannels.red * 255);
    image.data[index + 1] = Math.round(colorChannels.green * 255);
    image.data[index + 2] = Math.round(colorChannels.blue * 255);
    image.data[index + 3] = 255;
  }
}

context.putImageData(image, 0, 0);
