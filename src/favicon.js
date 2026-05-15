export function createSphereFaviconController(linkSelector = "#dynamic-favicon") {
  const faviconLink = document.querySelector(linkSelector);
  const defaultHref = faviconLink?.getAttribute("href") ?? "./favicon.ico";
  const catHref = "./apple-touch-icon.png";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const size = 64;
  const backgroundTolerance = 42;
  const catImage = new Image();
  let activeHex = null;
  let renderedHref = defaultHref;
  let isCatImageLoaded = false;

  canvas.width = size;
  canvas.height = size;
  catImage.addEventListener("load", () => {
    isCatImageLoaded = true;
    syncFavicon();
  });
  catImage.src = catHref;

  function setActiveColour(hex) {
    activeHex = hex;
    syncFavicon();
  }

  function clearActiveColour() {
    activeHex = null;
    syncFavicon();
  }

  function syncFavicon() {
    if (activeHex) {
      renderCatFavicon(activeHex);
      return;
    }

    renderDefaultFavicon();
  }

  function renderCatFavicon(hex) {
    if (!faviconLink || !context || renderedHref === hex) {
      return;
    }

    if (!isCatImageLoaded) {
      return;
    }

    context.clearRect(0, 0, size, size);
    context.drawImage(catImage, 0, 0, size, size);
    recolourCatBackground(hex);

    faviconLink.href = canvas.toDataURL("image/png");
    renderedHref = hex;
  }

  function recolourCatBackground(hex) {
    const imageData = context.getImageData(0, 0, size, size);
    const { data } = imageData;
    const target = hexToRgb(hex);
    const background = sampleBackgroundColour(data);
    const visited = new Uint8Array(size * size);
    const queue = [];

    for (let x = 0; x < size; x += 1) {
      queueBackgroundPixel(queue, visited, data, background, x, 0);
      queueBackgroundPixel(queue, visited, data, background, x, size - 1);
    }

    for (let y = 1; y < size - 1; y += 1) {
      queueBackgroundPixel(queue, visited, data, background, 0, y);
      queueBackgroundPixel(queue, visited, data, background, size - 1, y);
    }

    while (queue.length > 0) {
      const pixelIndex = queue.pop();
      const dataIndex = pixelIndex * 4;
      const x = pixelIndex % size;
      const y = Math.floor(pixelIndex / size);

      data[dataIndex] = target.red;
      data[dataIndex + 1] = target.green;
      data[dataIndex + 2] = target.blue;

      if (x > 0) {
        queueBackgroundPixel(queue, visited, data, background, x - 1, y);
      }
      if (x < size - 1) {
        queueBackgroundPixel(queue, visited, data, background, x + 1, y);
      }
      if (y > 0) {
        queueBackgroundPixel(queue, visited, data, background, x, y - 1);
      }
      if (y < size - 1) {
        queueBackgroundPixel(queue, visited, data, background, x, y + 1);
      }
    }

    context.putImageData(imageData, 0, 0);
  }

  function queueBackgroundPixel(queue, visited, data, background, x, y) {
    const pixelIndex = y * size + x;

    if (visited[pixelIndex]) {
      return;
    }

    visited[pixelIndex] = 1;

    if (!isBackgroundPixel(data, background, pixelIndex)) {
      return;
    }

    queue.push(pixelIndex);
  }

  function isBackgroundPixel(data, background, pixelIndex) {
    const dataIndex = pixelIndex * 4;

    if (data[dataIndex + 3] === 0) {
      return false;
    }

    const redDelta = data[dataIndex] - background.red;
    const greenDelta = data[dataIndex + 1] - background.green;
    const blueDelta = data[dataIndex + 2] - background.blue;

    return Math.hypot(redDelta, greenDelta, blueDelta) <= backgroundTolerance;
  }

  function sampleBackgroundColour(data) {
    const topCentreIndex = Math.floor(size / 2) * 4;

    return {
      red: data[topCentreIndex],
      green: data[topCentreIndex + 1],
      blue: data[topCentreIndex + 2],
    };
  }

  function hexToRgb(hex) {
    const channels = Number.parseInt(hex.slice(1), 16);

    return {
      red: (channels >> 16) & 255,
      green: (channels >> 8) & 255,
      blue: channels & 255,
    };
  }

  function renderDefaultFavicon() {
    if (!faviconLink || renderedHref === defaultHref) {
      return;
    }

    faviconLink.href = defaultHref;
    renderedHref = defaultHref;
  }

  return {
    clearActiveColour,
    setActiveColour,
  };
}
