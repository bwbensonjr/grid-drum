# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

GridDrum is a grid-based drum machine — a web application using the WebAudio API, planned for eventual delivery via Tauri or Electron. The project is currently in the design/prototype phase with no implementation code yet.

## Key Reference Documents

- **DESIGN.md** — Full design specification including planned features and architecture
- **user-interface-sketch.png** — UI mockup showing the grid layout
- **samples/** — WAV audio files (kick, snare, hihat, crash, ride, ride-bell, rim) for testing

## Architecture

The drum machine is a grid sequencer where:
- **Rows** = loaded audio samples (drum sounds)
- **Columns** = beat positions in the loop
- Users click grid cells to toggle sample playback at each beat position
- Playback loops continuously until paused

Core subsystems to implement:
- **Grid UI**: Configurable rows × columns grid with click-to-toggle cells
- **Sample Management**: Load audio files per row, set names, trigger for preview
- **Playback Engine**: WebAudio API-based loop with play/pause/reset controls
- **Desktop Wrapper**: Tauri or Electron (future)
