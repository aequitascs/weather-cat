export function getGlowColourChannels({ temperatureLevel, rainLevel }) {
  const fadeLevel = rainLevel ** 2;
  const baseRed = Math.min(temperatureLevel * 2, 1);
  const baseGreen = Math.min((1 - temperatureLevel) * 2, 1);

  return {
    red: baseRed * (1 - fadeLevel),
    green: baseGreen * (1 - fadeLevel),
    blue: rainLevel,
  };
}

export function getTemperatureLevel(temperature, scaleMinimum, scaleMaximum) {
  const normalizedTemperature = clamp(temperature, scaleMinimum, scaleMaximum);
  const scaleRange = scaleMaximum - scaleMinimum || 1;
  return (normalizedTemperature - scaleMinimum) / scaleRange;
}

export function getRainLevel(
  probability,
  probabilityMinimum = 0,
  probabilityMaximum = 100,
) {
  if (typeof probability !== "number") {
    return 0;
  }

  const clampedProbability = clamp(probability, probabilityMinimum, probabilityMaximum);
  return (clampedProbability - probabilityMinimum) /
    (probabilityMaximum - probabilityMinimum);
}

function clamp(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}
