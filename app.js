// ---------------------------------------------------------------------------
// GridDrum — app.js
// Copyright (c) 2026 Brent Benson — MIT License (see LICENSE)
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
  patternName: "",
  numBeats: 16,
  numSamples: DEFAULT_SAMPLES.length,
  bpm: 120,
  swing: 0,
  isPlaying: false,
  currentBeat: 0,
  grid: [],        // [row][col] booleans
  sampleBuffers: [],  // AudioBuffer per row (or null)
  sampleNames: [],    // display name per row
  sampleVolumes: [],  // float 0.0–1.0 per row
  sampleMutes: [],    // boolean per row
  sampleSolos: [],    // boolean per row
};

let audioCtx = null;
let timerId = null;
const rowGainNodes = []; // GainNode per row (not serializable, so outside state)

// ---- Audio Engine ---------------------------------------------------------

// Unlock iOS audio: playing an <audio> element on a user gesture forces iOS
// into a media playback session that outputs through the speaker even when
// the silent mode switch is engaged.
let iosAudioUnlocked = false;

function unlockIOSAudio() {
  if (iosAudioUnlocked) return;
  iosAudioUnlocked = true;
  const silentDataUri = "data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAD/+1AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGF2YzU4LjEzAAAAAAAAAAAAAAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAABhgC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAAYYoRBqpAAAAAAA=";
  const audio = new Audio(silentDataUri);
  audio.play().catch(() => {});
}

function ensureAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (navigator.audioSession) {
      navigator.audioSession.type = "playback";
    }
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume();
  }
  unlockIOSAudio();
}

async function loadSample(url) {
  ensureAudioContext();
  const response = await fetch(url);
  const arrayBuffer = await response.arrayBuffer();
  return audioCtx.decodeAudioData(arrayBuffer);
}

// ---- Mixer Gain Logic -----------------------------------------------------

function computeEffectiveGain(rowIndex) {
  if (state.sampleMutes[rowIndex]) return 0;
  const anySolo = state.sampleSolos.some(Boolean);
  if (anySolo && !state.sampleSolos[rowIndex]) return 0;
  return state.sampleVolumes[rowIndex] ?? 0.8;
}

function createRowGainNode(rowIndex) {
  ensureAudioContext();
  const gain = audioCtx.createGain();
  gain.gain.value = computeEffectiveGain(rowIndex);
  gain.connect(audioCtx.destination);
  rowGainNodes[rowIndex] = gain;
  return gain;
}

function updateAllGains() {
  for (let r = 0; r < state.numSamples; r++) {
    if (rowGainNodes[r]) {
      rowGainNodes[r].gain.value = computeEffectiveGain(r);
    }
  }
}

function playSample(rowIndex) {
  if (!state.sampleBuffers[rowIndex]) return;
  ensureAudioContext();
  if (!rowGainNodes[rowIndex]) createRowGainNode(rowIndex);
  const source = audioCtx.createBufferSource();
  source.buffer = state.sampleBuffers[rowIndex];
  source.connect(rowGainNodes[rowIndex]);
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

  while (state.sampleVolumes.length < state.numSamples) state.sampleVolumes.push(0.8);
  state.sampleVolumes.length = state.numSamples;

  while (state.sampleMutes.length < state.numSamples) state.sampleMutes.push(false);
  state.sampleMutes.length = state.numSamples;

  while (state.sampleSolos.length < state.numSamples) state.sampleSolos.push(false);
  state.sampleSolos.length = state.numSamples;

  // Disconnect stale GainNodes beyond current row count
  for (let i = state.numSamples; i < rowGainNodes.length; i++) {
    if (rowGainNodes[i]) { rowGainNodes[i].disconnect(); rowGainNodes[i] = null; }
  }
  rowGainNodes.length = state.numSamples;
}

// ---- Row Add/Remove -------------------------------------------------------

function addRowAfter(rowIndex) {
  state.numSamples++;
  const insertAt = rowIndex + 1;
  state.grid.splice(insertAt, 0, new Array(state.numBeats).fill(false));
  state.sampleBuffers.splice(insertAt, 0, null);
  state.sampleNames.splice(insertAt, 0, "");
  state.sampleVolumes.splice(insertAt, 0, 0.8);
  state.sampleMutes.splice(insertAt, 0, false);
  state.sampleSolos.splice(insertAt, 0, false);
  rowGainNodes.splice(insertAt, 0, null);
  renderGrid();
  scheduleHashUpdate();
}

function removeRow(rowIndex) {
  if (state.numSamples <= 1) return;
  if (rowGainNodes[rowIndex]) {
    rowGainNodes[rowIndex].disconnect();
  }
  state.numSamples--;
  state.grid.splice(rowIndex, 1);
  state.sampleBuffers.splice(rowIndex, 1);
  state.sampleNames.splice(rowIndex, 1);
  state.sampleVolumes.splice(rowIndex, 1);
  state.sampleMutes.splice(rowIndex, 1);
  state.sampleSolos.splice(rowIndex, 1);
  rowGainNodes.splice(rowIndex, 1);
  updateAllGains();
  renderGrid();
  scheduleHashUpdate();
}

// ---- Grid UI --------------------------------------------------------------

const gridContainer = document.getElementById("grid-container");

function renderGrid() {
  gridContainer.innerHTML = "";

  // CSS grid: first column for labels, then one per beat
  const cols = `240px repeat(${state.numBeats}, 1fr)`;
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
      scheduleHashUpdate();
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
        loadSampleFromFile(fileInput.files[0], r).then(scheduleHashUpdate);
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

    // Mixer row: volume slider, mute, solo
    const mixer = document.createElement("div");
    mixer.className = "row-mixer";

    const volSlider = document.createElement("input");
    volSlider.type = "range";
    volSlider.className = "vol-slider";
    volSlider.min = "0";
    volSlider.max = "1";
    volSlider.step = "0.01";
    volSlider.value = state.sampleVolumes[r];
    volSlider.addEventListener("input", () => {
      state.sampleVolumes[r] = parseFloat(volSlider.value);
      if (rowGainNodes[r]) {
        rowGainNodes[r].gain.value = computeEffectiveGain(r);
      }
      scheduleHashUpdate();
    });

    const muteBtn = document.createElement("button");
    muteBtn.className = "btn-mute" + (state.sampleMutes[r] ? " engaged" : "");
    muteBtn.textContent = "M";
    muteBtn.title = "Mute";
    muteBtn.addEventListener("click", () => {
      state.sampleMutes[r] = !state.sampleMutes[r];
      muteBtn.classList.toggle("engaged");
      updateAllGains();
      scheduleHashUpdate();
    });

    const soloBtn = document.createElement("button");
    soloBtn.className = "btn-solo" + (state.sampleSolos[r] ? " engaged" : "");
    soloBtn.textContent = "S";
    soloBtn.title = "Solo";
    soloBtn.addEventListener("click", () => {
      state.sampleSolos[r] = !state.sampleSolos[r];
      soloBtn.classList.toggle("engaged");
      updateAllGains();
      scheduleHashUpdate();
    });

    mixer.appendChild(volSlider);
    mixer.appendChild(muteBtn);
    mixer.appendChild(soloBtn);
    label.appendChild(mixer);

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
        scheduleHashUpdate();
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
  scheduleHashUpdate();
});

// ---- Config Inputs --------------------------------------------------------

const inputPatternName = document.getElementById("input-pattern-name");
const inputBeats = document.getElementById("input-beats");
const inputBpm = document.getElementById("input-bpm");

inputPatternName.addEventListener("change", () => {
  state.patternName = inputPatternName.value;
  scheduleHashUpdate();
});

inputBeats.addEventListener("change", () => {
  const val = parseInt(inputBeats.value, 10);
  if (val >= 1 && val <= 64) {
    state.numBeats = val;
    initGrid();
    renderGrid();
    scheduleHashUpdate();
  }
});

inputBpm.addEventListener("change", () => {
  const val = parseInt(inputBpm.value, 10);
  if (val >= 20 && val <= 300) {
    state.bpm = val;
    scheduleHashUpdate();
  }
});

// ---- Save / Load ----------------------------------------------------------

function buildPatternData() {
  const data = {
    version: 2,
    numBeats: state.numBeats,
    bpm: state.bpm,
    swing: state.swing,
    samples: state.sampleNames.slice(),
    grid: state.grid.flatMap((row, r) =>
      row.map((on, c) => on ? [r, c] : null).filter(Boolean)
    ),
    volumes: Object.fromEntries(
      state.sampleVolumes.map((v, i) => [i, v]).filter(([, v]) => v !== 0.8)
    ),
    mutes: Object.fromEntries(
      state.sampleMutes.map((v, i) => [i, v]).filter(([, v]) => v !== false)
    ),
    solos: Object.fromEntries(
      state.sampleSolos.map((v, i) => [i, v]).filter(([, v]) => v !== false)
    ),
  };
  if (state.patternName) data.name = state.patternName;
  return data;
}

function savePattern() {
  const json = JSON.stringify(buildPatternData(), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  const slug = state.patternName
    ? state.patternName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")
    : "grid-drum";
  a.download = slug + "-pattern.json";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function applyPatternData(data) {
  // Stop playback before applying
  resetPlayback();

  // Restore state
  state.patternName = data.name || "";
  state.numBeats = data.numBeats;
  state.bpm = data.bpm;
  state.swing = data.swing;
  state.numSamples = data.samples.length;
  state.sampleNames = data.samples.slice();
  // Restore grid: v2 uses sparse [row, col] pairs, v1 uses 2D boolean array
  state.grid = Array.from({ length: state.numSamples }, () =>
    new Array(state.numBeats).fill(false)
  );
  if (data.grid.length > 0 && Array.isArray(data.grid[0])) {
    // v1 format: 2D boolean array — or v2 sparse pairs
    if (typeof data.grid[0][0] === "boolean") {
      for (let r = 0; r < data.grid.length; r++) {
        for (let c = 0; c < data.grid[r].length; c++) {
          state.grid[r][c] = data.grid[r][c];
        }
      }
    } else {
      // v2 sparse: array of [row, col] pairs
      for (const [r, c] of data.grid) {
        state.grid[r][c] = true;
      }
    }
  }

  // Restore mixer state (v2 sparse objects) or defaults (v1)
  state.sampleVolumes = new Array(state.numSamples).fill(0.8);
  state.sampleMutes = new Array(state.numSamples).fill(false);
  state.sampleSolos = new Array(state.numSamples).fill(false);
  if (data.volumes) {
    for (const [i, v] of Object.entries(data.volumes)) state.sampleVolumes[i] = v;
  }
  if (data.mutes) {
    for (const [i, v] of Object.entries(data.mutes)) state.sampleMutes[i] = v;
  }
  if (data.solos) {
    for (const [i, v] of Object.entries(data.solos)) state.sampleSolos[i] = v;
  }

  // Disconnect and reset all GainNodes
  for (let i = 0; i < rowGainNodes.length; i++) {
    if (rowGainNodes[i]) { rowGainNodes[i].disconnect(); rowGainNodes[i] = null; }
  }
  rowGainNodes.length = state.numSamples;

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
  inputPatternName.value = state.patternName;
  inputBeats.value = state.numBeats;
  inputBpm.value = state.bpm;
  swingSlider.value = state.swing;
  swingValue.textContent = state.swing.toFixed(2);

  renderGrid();
  scheduleHashUpdate();
}

async function loadPattern(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (data.version !== 1 && data.version !== 2) {
    console.error("Unsupported pattern version:", data.version);
    return;
  }

  await applyPatternData(data);
}

document.getElementById("btn-save").addEventListener("click", savePattern);

// ---- URL Hash Encoding ----------------------------------------------------

function base64urlEncode(str) {
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlDecode(str) {
  str = str.replace(/-/g, "+").replace(/_/g, "/");
  while (str.length % 4) str += "=";
  return atob(str);
}

function encodePatternToHash() {
  const json = JSON.stringify(buildPatternData());
  return "v2=" + base64urlEncode(json);
}

function decodePatternFromHash() {
  try {
    const hash = window.location.hash.slice(1); // strip #
    if (!hash.startsWith("v2=")) return null;
    const encoded = hash.slice(3);
    const json = base64urlDecode(encoded);
    return JSON.parse(json);
  } catch (err) {
    console.error("Failed to decode pattern from URL hash:", err);
    return null;
  }
}

let hashUpdateTimer = null;

function updateUrlHash() {
  history.replaceState(null, "", "#" + encodePatternToHash());
}

function scheduleHashUpdate() {
  clearTimeout(hashUpdateTimer);
  hashUpdateTimer = setTimeout(updateUrlHash, 300);
}

window.addEventListener("hashchange", () => {
  const data = decodePatternFromHash();
  if (data) {
    applyPatternData(data);
  }
});

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

// ---- Reset to Defaults ----------------------------------------------------

async function resetToDefaults() {
  resetPlayback();

  state.patternName = "";
  state.numBeats = 16;
  state.bpm = 120;
  state.swing = 0;
  state.numSamples = DEFAULT_SAMPLES.length;
  state.sampleNames = DEFAULT_SAMPLES.map((s) => s.name);
  state.grid = Array.from({ length: state.numSamples }, () =>
    new Array(state.numBeats).fill(false)
  );
  state.sampleVolumes = new Array(state.numSamples).fill(0.8);
  state.sampleMutes = new Array(state.numSamples).fill(false);
  state.sampleSolos = new Array(state.numSamples).fill(false);

  for (let i = 0; i < rowGainNodes.length; i++) {
    if (rowGainNodes[i]) { rowGainNodes[i].disconnect(); rowGainNodes[i] = null; }
  }
  rowGainNodes.length = state.numSamples;

  state.sampleBuffers = [];
  for (let i = 0; i < state.numSamples; i++) {
    try {
      ensureAudioContext();
      state.sampleBuffers[i] = await loadSample(DEFAULT_SAMPLES[i].url);
    } catch {
      state.sampleBuffers[i] = null;
    }
  }

  inputPatternName.value = "";
  inputBeats.value = state.numBeats;
  inputBpm.value = state.bpm;
  swingSlider.value = state.swing;
  swingValue.textContent = state.swing.toFixed(2);

  renderGrid();
  scheduleHashUpdate();
}

document.getElementById("btn-reset-pattern").addEventListener("click", resetToDefaults);

// ---- Initialization -------------------------------------------------------

async function init() {
  // Try restoring state from URL hash
  const hashData = decodePatternFromHash();
  if (hashData) {
    await applyPatternData(hashData);
    return;
  }

  // Default setup
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

  updateUrlHash();
}

init();
