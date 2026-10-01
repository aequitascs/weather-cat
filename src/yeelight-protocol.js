export const YEELIGHT_SERVICE = 0xfff0;
export const CONTROL_CHARACTERISTIC = 0xfff1;
export const EFFECT_CHARACTERISTIC = 0xfffc;
export const COMMAND_LENGTH = 18;

export function powerCommand(on, brightness = 100) {
  return asciiCommand(`,,,${on ? percentage(brightness) : 0}`);
}

export function colourCommand(red, green, blue, brightness = 100) {
  return asciiCommand(
    `${colourChannel(red)},${colourChannel(green)},${colourChannel(blue)},${percentage(brightness)}`,
  );
}

export function transitionCommand(gradual) {
  return Uint8Array.from(gradual ? "TS" : "TE", (character) => character.charCodeAt(0));
}

export function hexToRgb(hex) {
  const match = /^#?([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (!match) {
    throw new TypeError(`Invalid RGB colour: ${hex}`);
  }

  return match.slice(1).map((value) => Number.parseInt(value, 16));
}

function asciiCommand(fields) {
  const message = fields.padEnd(COMMAND_LENGTH, ",");
  if (message.length !== COMMAND_LENGTH) {
    throw new RangeError(`Yeelight command exceeds ${COMMAND_LENGTH} bytes: ${fields}`);
  }

  return Uint8Array.from(message, (character) => character.charCodeAt(0));
}

function colourChannel(value) {
  return clamp(Math.round(value), 0, 255);
}

function percentage(value) {
  return clamp(Math.round(value), 1, 100);
}

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}
