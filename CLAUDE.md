# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`index.html` — single self-contained file (~2000 lines: CSS + JS + GLSL, no build step, no deps). A raymarched WebGL2 "observatory" with three switchable scenes: a Schwarzschild black hole (Sgr A*), the Milky Way, and the Solar System. Everything — HTML, CSS, JS, and all GLSL shader source (as template-literal strings) — lives in this one file.

## Running / testing

No build, no package.json, no test suite. Just open `index.html` in a browser (Chrome/Edge/Firefox with WebGL2), or serve it statically:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

There's no CLI dev loop — verify changes by reloading in-browser and watching the canvas + telemetry HUD. If `run` skill is available, use it to launch and screenshot.

## Architecture

### Single-file layout (in order)
1. `<style>` — HUD chrome (panels, sliders, nav, telemetry, boot screen), all in the same file. Responsive breakpoints at 1024px/700px/430px and a short-viewport (`max-height:620px`) query.
2. `<body>` — canvas + HUD DOM (nav buttons, telemetry rows, sliders, body-picker chips), all present at once; visibility toggled per-scene via `body.scene-{bh,mw,ss}` classes and `[data-sc]` attribute selectors in CSS (not JS show/hide).
3. `<script>` — WebGL2 setup, shader sources, render loop, input handling, HUD updates.

### Shader pipeline
- `GLSL_HEAD` — shared prelude (uniforms, hash/noise functions, procedural starfield/nebula `deepField()`) prepended to each scene's fragment shader source.
- Three scene fragment shaders, each a full raymarcher: `FS_SCENE` (black hole — null geodesic integration via RK2, accretion disk, relativistic jet), `FS_MW` (galaxy), `FS_SS` (solar system/planets).
- Post pipeline: `FS_BRIGHT` (bloom threshold) → `FS_BLUR` (separable gaussian, run twice for two mip levels into `bloomA`/`bloomB`) → `FS_COMP` (final composite: ACES tonemap, chromatic aberration, vignette, scanlines, grain).
- `prog(fs)` compiles+links each shader, auto-introspects active uniforms into a `{name: location}` map — no manual uniform location bookkeeping.

### Scene/state model
- `S` — single global mutable state object: camera (yaw/pitch/dist + `t`-prefixed easing targets), per-scene slider values, `scene` name, `focus` (which body the camera is locked to, solar system only), quality level.
- `SCENES` — per-scene static config: camera framing (dist/pitch/min/max), HUD label text, telemetry unit labels, ticker copy.
- `QUALITY` — 4 presets (LOW/MEDIUM/HIGH/ULTRA) controlling render resolution scale and raymarch step count; there's also an auto quality-drop path (watches frame time, downgrades under load).
- Scene switching (`setScene`) and body focus (`setFocus`) drive both the camera framing and which `[data-sc]` HUD rows/controls are visible (pure CSS attribute-selector visibility, see above).
- URL hash (`#bh`, `#mw`, `#ss`, `#ss/earth`, etc.) is the source of truth for deep-linking: `applyHash()`/`publishState()` keep it in sync with `S.scene`/`S.focus` and also update `document.title`.

### Solar system physics duplication (important when editing)
Planetary orbit math is **intentionally duplicated** between GLSL (`FS_SS`) and JS (`planetPos`/`sunPos`/`orbR` near line ~1289): the JS side is needed for camera focus/click-picking math and must stay numerically identical to the shader (same `ORB_RATE`, `P_AU`, `P_PH0`, radius-compression exponent). If you change orbital mechanics in one, mirror the change in the other — a comment at the JS definitions flags this ("Mirrors the constants in FS_SS exactly").

### Render loop
`frame(now)` is the single rAF loop: advances camera easing, updates uniforms, draws each scene shader to an offscreen target, runs the bloom passes, composites to screen, then calls `updateHud()` to refresh telemetry text/meters (`hudHole`/`hudGalaxy`/`hudSolar`, one per scene).

### Input
Pointer drag = orbit camera, scroll = dolly, click (solar system only) = pick a body (`pick()`), keyboard: `Tab`/`1`/`2`/`3` switch scenes, `H` toggles HUD, `R` resets. Foldable HUD panels (`FOLDS`) auto-collapse on small/short viewports unless the user has manually toggled them.

## Conventions worth preserving

- No frameworks/build tooling — keep it a single deployable HTML file.
- GLSL and JS share physical constants/formulas in comments (e.g. jet Doppler beaming, barycentre wobble) — when tuning visuals, read the adjacent comment before changing a magic number, they usually explain the physical justification for it.
- CSS visibility for per-scene HUD elements is done via attribute/class selectors, not inline styles or JS `display` toggles — follow that pattern for new HUD elements so scene switching stays declarative.
