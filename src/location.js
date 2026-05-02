import { fetchJson } from "./weather.js";

export class LocationUnavailableError extends Error {
  constructor() {
    super("Location unavailable");
    this.name = "LocationUnavailableError";
  }
}

export async function getCurrentLocation({ browserLocationTimeoutMs } = {}) {
  try {
    return await getBrowserLocation({ timeout: browserLocationTimeoutMs });
  } catch (error) {
    logGeolocationProblem("browser", error);
  }

  try {
    return await getIpLocation();
  } catch (error) {
    logGeolocationProblem("ip", error);
  }

  throw new LocationUnavailableError();
}

export function locationsMatch(firstLocation, secondLocation) {
  return (
    firstLocation.latitude === secondLocation.latitude &&
    firstLocation.longitude === secondLocation.longitude
  );
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
        maximumAge: 0,
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
