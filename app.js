// ---------------------------------------------------------------------------
// GridDrum — app.js
// ---------------------------------------------------------------------------

const DEFAULT_SAMPLES = [
  { name: "crash", url: "samples/crash.wav" },
  { name: "ride", url: "samples/ride.wav" },
  { name: "hihat", url: "samples/hihat.wav" },
  { name: "tom-1", url: "samples/tom-1.wav" },
  { name: "tom-3", url: "samples/tom-3.wav" },
  { name: "x-stick", url: "samples/x-stick.wav" },
  { name: "snare", url: "samples/snare.wav" },
  { name: "kick", url: "samples/kick.wav" },
  { name: "hh-pedal", url: "samples/hh-pedal.wav" },
];

// ---- State ----------------------------------------------------------------

const state = {
  numBeats: 16,
  numSamples: DEFAULT_SAMPLES.length,
  bpm: 120,
  swing: 0,
  isPlaying: false,
  currentBeat: 0,
  grid: [],        // [row][col] booleans
  sampleBuffers: [],  // AudioBuffer per row (or null)
  sampleNames: [],    // display name per row
};

let audioCtx = null;
let timerId = null;

// ---- Audio Engine ---------------------------------------------------------

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
}

async function loadSample(url) {
  ensureAudioContext();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuffer);
}

function playSample(rowIndex) {
  if (!state.sampleBuffers[rowIndex]) return;
  ensureAudioContext();
  const source = audioCtx.createBufferSource();
  source.buffer = state.sampleBuffers[rowIndex];
  source.connect(audioCtx.destination);
  source.start(0);
}

async function loadSampleFromFile(file, rowIndex) {
  ensureAudioContext();
  const arrayBuffer = await file.arrayBuffer();
  state.sampleBuffers[rowIndex] = await audioCtx.decodeAudioData(arrayBuffer);
  // Auto-set name from filename (strip extension)
  const name = file.name.replace(/\.[^.]+$/, "");
  state.sampleNames[rowIndex] = name;
  // Update the name input in the UI without a full re-render
  const nameInput = gridContainer.querySelector(`.row-label[data-row="${rowIndex}"] input[type="text"]`);
  if (nameInput) nameInput.value = name;
}

// ---- Grid State -----------------------------------------------------------

function initGrid() {
  state.grid = [];
  for (let r = 0; r < state.numSamples; r++) {
    state.grid[r] = state.grid[r] || [];
    // Ensure correct length
    const row = state.grid[r];
    while (row.length < state.numBeats) row.push(false);
    row.length = state.numBeats;
  }
  state.grid.length = state.numSamples;

  while (state.sampleBuffers.length < state.numSamples) state.sampleBuffers.push(null);
  state.sampleBuffers.length = state.numSamples;

  while (state.sampleNames.length < state.numSamples) state.sampleNames.push("");
  state.sampleNames.length = state.numSamples;
}

// ---- Row Add/Remove -------------------------------------------------------

function addRowAfter(rowIndex) {
  state.numSamples++;
  const insertAt = rowIndex + 1;
  state.grid.splice(insertAt, 0, new Array(state.numBeats).fill(false));
  state.sampleBuffers.splice(insertAt, 0, null);
  state.sampleNames.splice(insertAt, 0, "");
  renderGrid();
}

function removeRow(rowIndex) {
  if (state.numSamples <= 1) return;
  state.numSamples--;
  state.grid.splice(rowIndex, 1);
  state.sampleBuffers.splice(rowIndex, 1);
  state.sampleNames.splice(rowIndex, 1);
  renderGrid();
}

// ---- Grid UI --------------------------------------------------------------

const gridContainer = document.getElementById("grid-container");

function renderGrid() {
  gridContainer.innerHTML = "";

  // CSS grid: first column for labels, then one per beat
  const cols = `190px repeat(${state.numBeats}, 1fr)`;
  gridContainer.style.gridTemplateColumns = cols;

  // Header row — corner spacer + beat numbers
  const spacer = document.createElement("div");
  spacer.className = "corner-spacer";
  gridContainer.appendChild(spacer);

  for (let c = 0; c < state.numBeats; c++) {
    const hdr = document.createElement("div");
    hdr.className = "beat-header";
    hdr.dataset.col = c;
    hdr.textContent = c + 1;
    gridContainer.appendChild(hdr);
  }

  // Sample rows
  for (let r = 0; r < state.numSamples; r++) {
    // Label cell
    const label = document.createElement("div");
    label.className = "row-label";
    label.dataset.row = r;

    const nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.value = state.sampleNames[r];
    nameInput.placeholder = "sample";
    nameInput.addEventListener("change", () => {
      state.sampleNames[r] = nameInput.value;
    });

    const triggerBtn = document.createElement("button");
    triggerBtn.textContent = "\u25B6";
    triggerBtn.title = "Test sample";
    triggerBtn.addEventListener("click", () => {
      ensureAudioContext();
      playSample(r);
    });

    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = "audio/*";
    fileInput.style.display = "none";
    fileInput.addEventListener("change", () => {
      if (fileInput.files.length > 0) {
        loadSampleFromFile(fileInput.files[0], r);
      }
    });

    const loadBtn = document.createElement("button");
    loadBtn.textContent = "\uD83D\uDCC2";
    loadBtn.title = "Load sample";
    loadBtn.addEventListener("click", () => fileInput.click());

    const addBtn = document.createElement("button");
    addBtn.className = "row-add-remove";
    addBtn.textContent = "+";
    addBtn.title = "Add row below";
    addBtn.addEventListener("click", () => addRowAfter(r));

    const removeBtn = document.createElement("button");
    removeBtn.className = "row-add-remove";
    removeBtn.textContent = "\u2212";
    removeBtn.title = "Remove this row";
    removeBtn.addEventListener("click", () => removeRow(r));

    label.appendChild(addBtn);
    label.appendChild(removeBtn);
    label.appendChild(loadBtn);
    label.appendChild(fileInput);
    label.appendChild(nameInput);
    label.appendChild(triggerBtn);
    gridContainer.appendChild(label);

    // Beat cells
    for (let c = 0; c < state.numBeats; c++) {
      const cell = document.createElement("div");
      cell.className = "cell";
      cell.dataset.row = r;
      cell.dataset.col = c;
      if (state.grid[r][c]) cell.classList.add("active");
      if (state.isPlaying && c === state.currentBeat) cell.classList.add("current");

      cell.addEventListener("click", () => {
        state.grid[r][c] = !state.grid[r][c];
        cell.classList.toggle("active");
      });

      gridContainer.appendChild(cell);
    }
  }
}

function updateBeatHighlight() {
  // Remove old current markers
  gridContainer.querySelectorAll(".current").forEach((el) => el.classList.remove("current"));

  if (!state.isPlaying) return;

  // Highlight beat headers and cells for currentBeat
  gridContainer.querySelectorAll(`.beat-header[data-col="${state.currentBeat}"]`).forEach((el) => {
    el.classList.add("current");
  });
  gridContainer.querySelectorAll(`.cell[data-col="${state.currentBeat}"]`).forEach((el) => {
    el.classList.add("current");
  });
}

// ---- Sequencer ------------------------------------------------------------

function getIntervalMs(beatIndex) {
  const baseBeatMs = (60 / state.bpm / 4) * 1000; // sixteenth-note duration
  // Swing offsets even-indexed beats (0-indexed, so indices 1, 3, 5, … are the "off" beats)
  if (beatIndex % 2 === 1 && state.swing > 0) {
    return baseBeatMs * (1 + state.swing);
  }
  if (beatIndex % 2 === 0 && state.swing > 0) {
    return baseBeatMs * (1 - state.swing);
  }
  return baseBeatMs;
}

function stepBeat() {
  // Trigger samples for the current beat
  for (let r = 0; r < state.numSamples; r++) {
    if (state.grid[r] && state.grid[r][state.currentBeat]) {
      playSample(r);
    }
  }
  updateBeatHighlight();

  // Schedule next beat
  const nextBeat = (state.currentBeat + 1) % state.numBeats;
  const interval = getIntervalMs(state.currentBeat);
  state.currentBeat = nextBeat;

  timerId = setTimeout(stepBeat, interval);
}

function startPlayback() {
  if (state.isPlaying) return;
  ensureAudioContext();
  state.isPlaying = true;
  stepBeat();
}

function resetPlayback() {
  state.isPlaying = false;
  clearTimeout(timerId);
  timerId = null;
  state.currentBeat = 0;
  updateBeatHighlight();
}

// ---- Transport Controls ---------------------------------------------------

const btnPlay = document.getElementById("btn-play");
const btnReset = document.getElementById("btn-reset");
btnPlay.addEventListener("click", () => { startPlayback(); btnPlay.blur(); });
btnReset.addEventListener("click", () => { resetPlayback(); btnReset.blur(); });

document.addEventListener("keydown", (event) => {
  if (event.repeat) return;
  if (event.code !== "Space") return;
  const tag = document.activeElement?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  event.preventDefault();
  state.isPlaying ? resetPlayback() : startPlayback();
});

// ---- Swing ----------------------------------------------------------------

const swingSlider = document.getElementById("swing-slider");
const swingValue = document.getElementById("swing-value");
swingSlider.addEventListener("input", () => {
  state.swing = parseFloat(swingSlider.value);
  swingValue.textContent = state.swing.toFixed(2);
});

// ---- Config Inputs --------------------------------------------------------

const inputBeats = document.getElementById("input-beats");
const inputBpm = document.getElementById("input-bpm");

inputBeats.addEventListener("change", () => {
  const val = parseInt(inputBeats.value, 10);
  if (val >= 1 && val <= 64) {
    state.numBeats = val;
    initGrid();
    renderGrid();
  }
});

inputBpm.addEventListener("change", () => {
  const val = parseInt(inputBpm.value, 10);
  if (val >= 20 && val <= 300) {
    state.bpm = val;
  }
});

// ---- Save / Load ----------------------------------------------------------

function savePattern() {
  const data = {
    version: 1,
    numBeats: state.numBeats,
    bpm: state.bpm,
    swing: state.swing,
    samples: state.sampleNames.slice(),
    grid: state.grid.map((row) => row.slice()),
  };
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "grid-drum-pattern.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function loadPattern(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (data.version !== 1) {
    console.error("Unsupported pattern version:", data.version);
    return;
  }

  // Stop playback before applying
  resetPlayback();

  // Restore state
  state.numBeats = data.numBeats;
  state.bpm = data.bpm;
  state.swing = data.swing;
  state.numSamples = data.samples.length;
  state.sampleNames = data.samples.slice();
  state.grid = data.grid.map((row) => row.slice());

  // Re-match default samples by name
  state.sampleBuffers = [];
  for (let i = 0; i < state.numSamples; i++) {
    const match = DEFAULT_SAMPLES.find((s) => s.name === state.sampleNames[i]);
    if (match) {
      try {
        ensureAudioContext();
        state.sampleBuffers[i] = await loadSample(match.url);
      } catch {
        state.sampleBuffers[i] = null;
      }
    } else {
      state.sampleBuffers[i] = null;
    }
  }

  // Update UI inputs
  inputBeats.value = state.numBeats;
  inputBpm.value = state.bpm;
  swingSlider.value = state.swing;
  swingValue.textContent = state.swing.toFixed(2);

  renderGrid();
}

document.getElementById("btn-save").addEventListener("click", savePattern);

const fileLoadInput = document.getElementById("file-load-input");
document.getElementById("btn-load").addEventListener("click", () => {
  fileLoadInput.value = "";
  fileLoadInput.click();
});
fileLoadInput.addEventListener("change", () => {
  if (fileLoadInput.files.length > 0) {
    loadPattern(fileLoadInput.files[0]);
  }
});

// ---- Initialization -------------------------------------------------------

async function init() {
  // Set up default sample names
  for (let i = 0; i < DEFAULT_SAMPLES.length && i < state.numSamples; i++) {
    state.sampleNames[i] = DEFAULT_SAMPLES[i].name;
  }

  initGrid();
  renderGrid();

  // Pre-load default samples (audio context created on first user click)
  try {
    ensureAudioContext();
    for (let i = 0; i < DEFAULT_SAMPLES.length && i < state.numSamples; i++) {
      state.sampleBuffers[i] = await loadSample(DEFAULT_SAMPLES[i].url);
    }
  } catch (err) {
    console.warn("Could not pre-load samples (AudioContext may require user gesture):", err);
  }
}

init();
