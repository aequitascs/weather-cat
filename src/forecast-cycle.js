export function createForecastCycle({ sequence, intervalMs, onPrediction }) {
  let timer = null;
  let sequenceIndex = 0;
  let predictions = [];

  function setPredictions(nextPredictions) {
    predictions = nextPredictions;
    sequenceIndex %= sequence.length;
  }

  function getCurrentPrediction() {
    const predictionIndex = sequence[sequenceIndex];
    return predictions[predictionIndex] ?? predictions[0];
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
    sequenceIndex = 0;
  }

  function showNextPrediction() {
    if (predictions.length === 0) {
      return;
    }

    sequenceIndex = (sequenceIndex + 1) % sequence.length;
    onPrediction(getCurrentPrediction());
  }

  return {
    getCurrentPrediction,
    reset,
    setPredictions,
    start,
  };
}
