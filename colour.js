const colourMap = document.querySelector("#colour-map");
const context = colourMap.getContext("2d");
const { width, height } = colourMap;
const image = context.createImageData(width, height);

for (let y = 0; y < height; y += 1) {
  const verticalLevel = (1 - y / (height - 1)) ** 2;

  for (let x = 0; x < width; x += 1) {
    const temperatureLevel = x / (width - 1);
    const baseRed = Math.min(temperatureLevel * 2, 1) * 255;
    const baseGreen = Math.min((1 - temperatureLevel) * 2, 1) * 255;
    const index = (y * width + x) * 4;

    image.data[index] = Math.round(baseRed * (1 - verticalLevel));
    image.data[index + 1] = Math.round(baseGreen * (1 - verticalLevel));
    image.data[index + 2] = Math.round(verticalLevel * 255);
    image.data[index + 3] = 255;
  }
}

context.putImageData(image, 0, 0);
