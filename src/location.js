import { fetchJson } from "./weather.js";

const cachedLocationStorageKey = "weather-cat-location";
const browserLocationMaximumAgeMs = 5 * 60 * 1000;

export class LocationUnavailableError extends Error {
  constructor() {
    super("Location unavailable");
    this.name = "LocationUnavailableError";
  }
}

export async function getCurrentLocation({
  browserLocationTimeoutMs,
  onLocationUpdate,
} = {}) {
  const cachedLocation = getCachedLocation();

  if (cachedLocation) {
    logGeolocationSuccess("cache", cachedLocation);
    getLoggedBrowserLocation({ timeout: browserLocationTimeoutMs })
      .then((browserLocation) => {
        if (locationsDiffer(cachedLocation, browserLocation)) {
          notifyLocationUpdate(onLocationUpdate, browserLocation);
        }
      })
      .catch(() => {});

    if (cachedLocation.source !== "browser") {
      getLoggedIpLocation()
        .then((ipLocation) => {
          if (locationsDiffer(cachedLocation, ipLocation)) {
            notifyLocationUpdate(onLocationUpdate, ipLocation);
          }
        })
        .catch(() => {});
    }

    return cachedLocation;
  }

  const browserLocationPromise = getLoggedBrowserLocation({
    timeout: browserLocationTimeoutMs,
  });
  const ipLocationPromise = getLoggedIpLocation();

  try {
    const firstLocation = await getFirstSuccessfulLocation([
      browserLocationPromise,
      ipLocationPromise,
    ]);

    if (firstLocation.source === "ip") {
      browserLocationPromise
        .then((browserLocation) => {
          if (locationsDiffer(firstLocation, browserLocation)) {
            notifyLocationUpdate(onLocationUpdate, browserLocation);
          }
        })
        .catch(() => {});
    }

    return firstLocation;
  } catch {
    throw new LocationUnavailableError();
  }
}

function getFirstSuccessfulLocation(locationPromises) {
  return new Promise((resolve, reject) => {
    let failureCount = 0;

    locationPromises.forEach((locationPromise) => {
      locationPromise
        .then(resolve)
        .catch(() => {
          failureCount += 1;

          if (failureCount === locationPromises.length) {
            reject(new LocationUnavailableError());
          }
        });
    });
  });
}

export function locationsMatch(firstLocation, secondLocation) {
  return (
    firstLocation.latitude === secondLocation.latitude &&
    firstLocation.longitude === secondLocation.longitude
  );
}

function locationsDiffer(firstLocation, secondLocation) {
  return !locationsMatch(firstLocation, secondLocation) ||
    firstLocation.source !== secondLocation.source;
}

function notifyLocationUpdate(onLocationUpdate, location) {
  if (!onLocationUpdate) {
    return;
  }

  Promise.resolve(onLocationUpdate(location)).catch((error) => {
    console.warn("Could not refresh after updated geolocation.", error);
  });
}

export function getLocationErrorMessage(error) {
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

async function getLoggedBrowserLocation({ timeout } = {}) {
  try {
    const location = await getBrowserLocation({ timeout });
    saveCachedLocation(location);
    logGeolocationSuccess("browser", location);
    return location;
  } catch (error) {
    logGeolocationProblem("browser", error);
    throw error;
  }
}

async function getLoggedIpLocation() {
  try {
    const location = await getIpLocation();
    saveCachedLocation(location);
    logGeolocationSuccess("ip", location);
    return location;
  } catch (error) {
    logGeolocationProblem("ip", error);
    throw error;
  }
}

function getBrowserLocation({ timeout } = {}) {
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
        maximumAge: browserLocationMaximumAgeMs,
        timeout,
      },
    );
  });
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

function logGeolocationProblem(method, error) {
  const message = getLocationErrorMessage(error);
  console.warn(`Geolocation ${method} failed: ${message}`);
}

function logGeolocationSuccess(method, location) {
  console.info(
    `Geolocation ${method} succeeded: ${location.latitude.toFixed(4)}, ${location.longitude.toFixed(4)}`,
  );
}

function getCachedLocation() {
  try {
    const cachedLocation = JSON.parse(localStorage.getItem(cachedLocationStorageKey));
    if (
      !cachedLocation ||
      !Number.isFinite(cachedLocation.latitude) ||
      !Number.isFinite(cachedLocation.longitude)
    ) {
      return null;
    }

    return {
      latitude: cachedLocation.latitude,
      longitude: cachedLocation.longitude,
      source: cachedLocation.source === "browser" ? "browser" : "ip",
    };
  } catch {
    return null;
  }
}

function saveCachedLocation(location) {
  try {
    localStorage.setItem(
      cachedLocationStorageKey,
      JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        source: location.source,
        savedAt: Date.now(),
      }),
    );
  } catch {
    // Ignore storage failures; geolocation can still proceed for this session.
  }
}
