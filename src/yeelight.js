import {
  colourCommand,
  CONTROL_CHARACTERISTIC,
  EFFECT_CHARACTERISTIC,
  hexToRgb,
  powerCommand,
  transitionCommand,
  YEELIGHT_SERVICE,
} from "./yeelight-protocol.js";

const minimumWriteGapMs = 400;
const brightness = 10;

export function createYeelightController({ onStatusChange }) {
  let device = null;
  let controlCharacteristic = null;
  let effectCharacteristic = null;
  let writeQueue = Promise.resolve();
  let lastWriteFinishedAt = 0;
  let desiredHex = null;
  let shouldBeOn = false;

  async function initialize() {
    if (!("bluetooth" in navigator)) {
      updateStatus("unsupported", "Yeelight unavailable", false);
      return;
    }

    if (!window.isSecureContext) {
      updateStatus("unsupported", "Yeelight needs HTTPS", false);
      return;
    }

    updateStatus("disconnected", "No Yeelight paired", true);
    if (typeof navigator.bluetooth.getDevices !== "function") {
      return;
    }

    try {
      const pairedDevices = await navigator.bluetooth.getDevices();
      const pairedYeelight = pairedDevices.find(hasYeelightService);
      if (pairedYeelight) {
        await connect(pairedYeelight);
      }
    } catch (error) {
      console.warn("Could not reconnect to the paired Yeelight.", error);
      updateStatus("disconnected", "Yeelight paired, not connected", true);
    }
  }

  async function togglePairing() {
    if (device?.gatt?.connected) {
      device.gatt.disconnect();
      return;
    }

    try {
      updateStatus("connecting", "Choosing Yeelight…", false);
      const selectedDevice = await navigator.bluetooth.requestDevice({
        filters: [{ services: [YEELIGHT_SERVICE] }],
      });
      await connect(selectedDevice);
    } catch (error) {
      if (error.name !== "NotFoundError") {
        console.warn("Could not pair with the Yeelight.", error);
      }
      updateStatus("disconnected", "No Yeelight connected", true);
    }
  }

  function mirrorColour(hex) {
    desiredHex = hex;
    shouldBeOn = true;
    if (!controlCharacteristic || !device?.gatt?.connected) {
      return;
    }

    queueWrite(controlCharacteristic, colourCommand(...hexToRgb(hex), brightness))
      .catch(handleWriteError);
  }

  function turnOff() {
    shouldBeOn = false;
    if (!controlCharacteristic || !device?.gatt?.connected) {
      return;
    }

    queueWrite(controlCharacteristic, powerCommand(false, brightness))
      .catch(handleWriteError);
  }

  async function connect(selectedDevice) {
    device = selectedDevice;
    device.removeEventListener("gattserverdisconnected", handleDisconnect);
    device.addEventListener("gattserverdisconnected", handleDisconnect);
    updateStatus("connecting", `Connecting to ${device.name || "Yeelight"}…`, false);

    const server = await device.gatt.connect();
    const service = await server.getPrimaryService(YEELIGHT_SERVICE);
    controlCharacteristic = await service.getCharacteristic(CONTROL_CHARACTERISTIC);
    effectCharacteristic = await service.getCharacteristic(EFFECT_CHARACTERISTIC);

    await queueWrite(effectCharacteristic, transitionCommand(false));
    if (shouldBeOn && desiredHex) {
      await queueWrite(
        controlCharacteristic,
        colourCommand(...hexToRgb(desiredHex), brightness),
      );
    } else {
      await queueWrite(controlCharacteristic, powerCommand(false, brightness));
    }

    updateStatus("connected", device.name || "Yeelight connected", true);
  }

  function queueWrite(characteristic, bytes) {
    writeQueue = writeQueue.catch(() => {}).then(async () => {
      const delayMs = minimumWriteGapMs - (Date.now() - lastWriteFinishedAt);
      if (delayMs > 0) {
        await delay(delayMs);
      }
      await characteristic.writeValueWithResponse(bytes);
      lastWriteFinishedAt = Date.now();
    });
    return writeQueue;
  }

  function handleDisconnect() {
    controlCharacteristic = null;
    effectCharacteristic = null;
    updateStatus("disconnected", "Yeelight disconnected", true);
  }

  function handleWriteError(error) {
    console.warn("Could not update the Yeelight.", error);
    if (!device?.gatt?.connected) {
      handleDisconnect();
    }
  }

  function updateStatus(state, message, pairingEnabled) {
    onStatusChange({
      state,
      message,
      pairingEnabled,
      connected: state === "connected",
    });
  }

  return { initialize, mirrorColour, togglePairing, turnOff };
}

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function hasYeelightService(device) {
  return device.uuids?.some((uuid) =>
    uuid === YEELIGHT_SERVICE || String(uuid).toLowerCase().startsWith("0000fff0-"));
}
