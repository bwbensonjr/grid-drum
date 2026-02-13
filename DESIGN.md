# GridDrum Design 

A grid-based drum machine application with a sample per-line (e.g., kick.wav, snare.wave, ...) and an adjustable number of beats in the grid. 

A sketch of the user interface:

![](user-interface-sketch.png)

- The plan is to prototype as a web-based application using the
  WebAudio API in a way that can eventually be delivered using Tauri
  or Electron.
- Basic functions:
  - Establish number of beats (columns) and number of samples (rows)
  - Load and audio file sample for each row, set the sample name, and trigger the sample to test.
  - Click on grid openings to set or unset the playing of the sample.
  - Play, pause, or reset the loop.
  - The loop should continue to play until it is paused.
- There are some samples in the `samples` folder for testing.
