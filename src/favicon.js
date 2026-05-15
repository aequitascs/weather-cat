export function createSphereFaviconController(linkSelector = "#dynamic-favicon") {
  const faviconLink = document.querySelector(linkSelector);
  const defaultHref = faviconLink?.getAttribute("href") ?? "./favicon.ico";
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  const size = 64;
  let activeHex = null;
  let renderedHref = defaultHref;

  canvas.width = size;
  canvas.height = size;

  document.addEventListener("visibilitychange", syncFavicon);

  function setActiveColour(hex) {
    activeHex = hex;
    syncFavicon();
  }

  function clearActiveColour() {
    activeHex = null;
    syncFavicon();
  }

  function syncFavicon() {
    if (activeHex && document.hidden) {
      renderSphereFavicon(activeHex);
      return;
    }

    renderDefaultFavicon();
  }

  function renderSphereFavicon(hex) {
    if (!faviconLink || !context || renderedHref === hex) {
      return;
    }

    context.clearRect(0, 0, size, size);
    context.fillStyle = hex;
    context.beginPath();
    context.arc(size / 2, size / 2, 31, 0, Math.PI * 2);
    context.fill();

    faviconLink.href = canvas.toDataURL("image/png");
    renderedHref = hex;
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
