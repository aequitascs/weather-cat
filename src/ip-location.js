import { fetchJson } from "./weather.js";

const ipLocationCacheDurationMs = 60 * 60 * 1000;
const ipLocationCacheKey = "weatherCat.ipLocation";
const ipLocationProviders = [
  {
    name: "GeoJS",
    url: "https://get.geojs.io/v1/ip/geo.json",
    getCoordinates: (ipLocation) => ({
      latitude: Number(ipLocation.latitude),
      longitude: Number(ipLocation.longitude),
    }),
  },
  {
    name: "Kamero",
    url: "https://geo.kamero.ai/api/geo",
    getCoordinates: (ipLocation) => ({
      latitude: Number(ipLocation.latitude),
      longitude: Number(ipLocation.longitude),
    }),
  },
  {
    name: "IP geolocation",
    url: "https://ipapi.co/json/",
    getCoordinates: (ipLocation) => ({
      latitude: Number(ipLocation.latitude),
      longitude: Number(ipLocation.longitude),
    }),
  },
];

export async function getIpLocation() {
  const cachedLocation = getCachedIpLocation();
  if (cachedLocation) {
    return cachedLocation;
  }

  const errors = [];

  for (const provider of ipLocationProviders) {
    try {
      const ipLocation = await fetchJson(provider.url, provider.name);
      const { latitude, longitude } = provider.getCoordinates(ipLocation);

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        throw new Error(`${provider.name} response did not include latitude and longitude`);
      }

      const location = {
        latitude: Number(latitude.toFixed(4)),
        longitude: Number(longitude.toFixed(4)),
        source: "ip",
        lookupSource: provider.name,
      };
      storeCachedIpLocation(location);
      return location;
    } catch (error) {
      errors.push(`${provider.name}: ${error?.message ?? "Location unavailable"}`);
    }
  }

  throw new Error(`IP geolocation unavailable (${errors.join("; ")})`);
}

function getCachedIpLocation() {
  try {
    const cachedLocation = JSON.parse(localStorage.getItem(ipLocationCacheKey) ?? "null");

    if (
      Number.isFinite(cachedLocation?.latitude) &&
      Number.isFinite(cachedLocation?.longitude) &&
      Number.isFinite(cachedLocation?.cachedAt) &&
      Date.now() - cachedLocation.cachedAt < ipLocationCacheDurationMs
    ) {
      return {
        latitude: cachedLocation.latitude,
        longitude: cachedLocation.longitude,
        source: "ip",
        lookupSource: "cache",
      };
    }
  } catch {
    try {
      localStorage.removeItem(ipLocationCacheKey);
    } catch {}
  }

  return null;
}

function storeCachedIpLocation(location) {
  try {
    localStorage.setItem(
      ipLocationCacheKey,
      JSON.stringify({
        latitude: location.latitude,
        longitude: location.longitude,
        cachedAt: Date.now(),
      }),
    );
  } catch {}
}
