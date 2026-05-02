const outlierStandardDeviationLimit = 2;
const apparentTemperatureHourlyField = "apparent_temperature";
const apparentTemperatureDailyMinimumField = "apparent_temperature_min";
const apparentTemperatureDailyMaximumField = "apparent_temperature_max";

export async function fetchTemperatureRange(location) {
  const { startDate, endDate } = getLastTwelveMonthDateRange();
  const archiveUrl =
    `https://archive-api.open-meteo.com/v1/archive?latitude=${location.latitude}&longitude=${location.longitude}&start_date=${startDate}&end_date=${endDate}&daily=${apparentTemperatureDailyMinimumField},${apparentTemperatureDailyMaximumField}&temperature_unit=celsius&timezone=auto`;
  const historicalWeather = await fetchJson(archiveUrl);
  const dailyMinimums = historicalWeather.daily?.[apparentTemperatureDailyMinimumField] ?? [];
  const dailyMaximums = historicalWeather.daily?.[apparentTemperatureDailyMaximumField] ?? [];
  const validMinimums = dailyMinimums.filter(isNumber);
  const validMaximums = dailyMaximums.filter(isNumber);

  if (validMinimums.length === 0) {
    throw new Error(`Open-Meteo archive response did not include daily.${apparentTemperatureDailyMinimumField} values`);
  }
  if (validMaximums.length === 0) {
    throw new Error(`Open-Meteo archive response did not include daily.${apparentTemperatureDailyMaximumField} values`);
  }

  const filteredMinimums = removeStatisticalOutliers(validMinimums);
  const filteredMaximums = removeStatisticalOutliers(validMaximums);

  return {
    minimum: Math.min(...filteredMinimums),
    maximum: Math.max(...filteredMaximums),
  };
}

export async function fetchForecastPredictions(location, hourOffsets) {
  const forecast = await fetchJson(getHourlyForecastUrl(location));
  return getForecastPredictions(forecast, hourOffsets);
}

export function clampTemperatureToScale(temperature, scaleMinimum, scaleMaximum) {
  return Math.min(Math.max(temperature, scaleMinimum), scaleMaximum);
}

export async function fetchJson(url, serviceName = "Open-Meteo") {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${serviceName} returned ${response.status}`);
  }

  return response.json();
}

function getHourlyForecastUrl(location) {
  return `https://api.open-meteo.com/v1/forecast?latitude=${location.latitude}&longitude=${location.longitude}&hourly=${apparentTemperatureHourlyField},precipitation_probability&forecast_hours=6&temperature_unit=celsius&timezone=auto`;
}

function getForecastPredictions(forecast, hourOffsets) {
  return hourOffsets
    .map((hourOffset) => getTemperatureHoursFromNow(forecast, hourOffset))
    .filter(Boolean);
}

function getTemperatureHoursFromNow(forecast, hourOffset) {
  const times = forecast.hourly?.time ?? [];
  const temperatures = forecast.hourly?.[apparentTemperatureHourlyField] ?? [];
  const rainProbabilities = forecast.hourly?.precipitation_probability ?? [];
  const utcOffsetSeconds = forecast.utc_offset_seconds ?? 0;
  const targetTime = Date.now() + hourOffset * 60 * 60 * 1000;

  let closestTemperature = null;
  let closestRainProbability = null;
  let closestTime = null;
  let closestDistance = Infinity;

  times.forEach((time, index) => {
    const forecastTime = Date.parse(`${time}:00Z`) - utcOffsetSeconds * 1000;
    const distance = Math.abs(forecastTime - targetTime);

    if (distance < closestDistance && typeof temperatures[index] === "number") {
      closestDistance = distance;
      closestTemperature = temperatures[index];
      closestRainProbability = rainProbabilities[index];
      closestTime = time;
    }
  });

  if (closestTemperature === null || closestTime === null) {
    return null;
  }

  return {
    offsetHours: hourOffset,
    temperature: closestTemperature,
    rainProbability: closestRainProbability,
    forecastTime: formatPredictionTime(closestTime, forecast.timezone_abbreviation),
  };
}

function getLastTwelveMonthDateRange() {
  const end = new Date();
  end.setDate(end.getDate() - 1);
  const start = new Date(end);
  start.setFullYear(start.getFullYear() - 1);
  start.setDate(start.getDate() + 1);

  return {
    startDate: formatDate(start),
    endDate: formatDate(end),
  };
}

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function formatPredictionTime(startTime, timezoneAbbreviation) {
  const forecastTime = new Date(`${startTime}:00`);
  const formatter = new Intl.DateTimeFormat([], {
    hour: "2-digit",
    minute: "2-digit",
  });
  const timezone = timezoneAbbreviation ? ` ${timezoneAbbreviation}` : "";

  return `${formatter.format(forecastTime)}${timezone}`;
}

function removeStatisticalOutliers(values) {
  if (values.length < 4) {
    return values;
  }

  const average = values.reduce((total, value) => total + value, 0) / values.length;
  const variance = values.reduce(
    (total, value) => total + (value - average) ** 2,
    0,
  ) / values.length;
  const standardDeviation = Math.sqrt(variance);

  if (standardDeviation === 0) {
    return values;
  }

  const lowerFence = average - standardDeviation * outlierStandardDeviationLimit;
  const upperFence = average + standardDeviation * outlierStandardDeviationLimit;
  const filteredValues = values.filter(
    (value) => value >= lowerFence && value <= upperFence,
  );

  return filteredValues.length > 0 ? filteredValues : values;
}

function isNumber(value) {
  return typeof value === "number";
}
