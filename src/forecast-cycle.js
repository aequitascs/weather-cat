export function createForecastCycle({ hourSequence, intervalMs, onPrediction }) {
  let timer = null;
  let sequenceIndex = 0;
  let predictions = [];
  let predictionsByHour = new Map();

  function setPredictions(nextPredictions) {
    predictions = nextPredictions;
    predictionsByHour = new Map(
      predictions.map((prediction) => [prediction.offsetHours, prediction]),
    );
    sequenceIndex %= hourSequence.length;
  }

  function getCurrentPrediction() {
    const offsetHours = hourSequence[sequenceIndex];
    return predictionsByHour.get(offsetHours) ?? predictions[0];
  }

  function start() {
    clear();
    timer = setInterval(showNextPrediction, intervalMs);
  }

  function clear() {
    clearInterval(timer);
    timer = null;
  }

  function reset() {
    clear();
    predictions = [];
    predictionsByHour = new Map();
    sequenceIndex = 0;
  }

  function showNextPrediction() {
    if (predictions.length === 0) {
      return;
    }

    sequenceIndex = (sequenceIndex + 1) % hourSequence.length;
    onPrediction(getCurrentPrediction());
  }

  return {
    getCurrentPrediction,
    reset,
    setPredictions,
    start,
  };
}
