# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A raymarched WebGL2 "observatory" with three switchable scenes: a Schwarzschild black hole (Sgr A*), the Milky Way, and the Solar System. Static site, ES modules, no build step, no deps.

## Running / testing

No build, no package.json, no test suite. **Must be served over http(s)** — ES modules are blocked by CORS on `file://`, so double-clicking `index.html` no longer works (it did before the module split; see git history if you need that fallback). Serve locally:

```bash
python -m http.server 8000   # then open http://localhost:8000
```

There's no CLI dev loop — verify changes by reloading in-browser and watching the canvas + telemetry HUD. If `run` skill is available, use it to launch and screenshot.

GitHub Pages (legacy build type, deploys straight from `main`, no Actions workflow) serves everything over https, so the module split doesn't affect the deployed site.

## Architecture

### File layout
```
index.html         HTML skeleton only — canvas, HUD DOM, <link>/<script type=module>
css/style.css       all CSS (HUD chrome, responsive breakpoints)
js/state.js         S (mutable state), SCENES (per-scene config), QUALITY presets — no imports, safe to import from anywhere
js/shaders.js       every GLSL source as exported template-literal strings — no imports
js/ephemeris.js     JS mirror of the Solar System orbit math (see below) — imports S from state.js
js/gl.js            WebGL2 context, shader compile/link, render-target helpers — imports VS from shaders.js
js/programs.js      compiles the 6 GL programs from shaders.js via gl.js
js/render.js        resize()/applyQuality()/frame() — the render loop and camera math
js/hud.js           updateHud() + per-scene telemetry (hudHole/hudGalaxy/hudSolar)
js/ui.js            pointer/wheel/touch/keyboard input, scene+focus switching, hash routing, sliders/buttons, boot sequence
js/main.js          entry point — imports the above and kicks off the render loop
```
Import graph is a DAG, no cycles: `state.js`/`shaders.js` are leaves; `render.js` and `ui.js` are the two biggest consumers and neither imports the other (render.js needs no UI state; ui.js reads `render.js`'s `resize`/`applyQuality`/`VIEW` one-directionally). The one piece of state both `render.js` and `ui.js` touch — whether the pointer is currently dragging — lives in `state.js` (`dragging`/`setDragging`) rather than being passed between them.

**Adding a new scene**: write `FS_YOURSCENE = GLSL_HEAD + \`...\`` in `shaders.js`, add its camera framing/HUD copy to `SCENES` in `state.js`, compile it in `programs.js`, add its uniform-setting branch + program-select in `render.js`'s `frame()`, and a nav button (`data-go="yourscene"`) in `index.html` — `ui.js`'s delegated `.navb` listener and the CSS `[data-sc]` visibility rules pick it up automatically.

### Shader pipeline (`js/shaders.js`)
- `GLSL_HEAD` — shared prelude (uniforms, hash/noise functions, procedural starfield/nebula `deepField()`) prepended to each scene's fragment shader source.
- Three scene fragment shaders, each a full raymarcher: `FS_SCENE` (black hole — null geodesic integration via RK2, accretion disk, relativistic jet), `FS_MW` (galaxy), `FS_SS` (solar system — planets, moons, asteroid belt, orbit rings).
- Post pipeline: `FS_BRIGHT` (bloom threshold) → `FS_BLUR` (separable gaussian, run twice for two mip levels into `bloomA`/`bloomB`) → `FS_COMP` (final composite: ACES tonemap, chromatic aberration, vignette, scanlines, grain).
- `prog(fs)` (in `gl.js`) compiles+links each shader, auto-introspects active uniforms into a `{name: location}` map — no manual uniform location bookkeeping.

### Scene/state model (`js/state.js`)
- `S` — single mutable state object: camera (yaw/pitch/dist + `t`-prefixed easing targets), per-scene slider values, `scene` name, `focus` (which body the camera is locked to, solar system only), quality level.
- `SCENES` — per-scene static config: camera framing (dist/pitch/min/max), HUD label text, telemetry unit labels, ticker copy.
- `QUALITY` — 4 presets (LOW/MEDIUM/HIGH/ULTRA) controlling render resolution scale and raymarch step count; `render.js` also has an auto quality-drop path (watches frame time, downgrades under load).
- Scene switching (`setScene`) and body focus (`setFocus`), both in `ui.js`, drive both the camera framing and which `[data-sc]` HUD rows/controls are visible (pure CSS attribute-selector visibility in `style.css`, not JS show/hide).
- URL hash (`#bh`, `#mw`, `#ss`, `#ss/earth`, etc.) is the source of truth for deep-linking: `applyHash()`/`publishState()` in `ui.js` keep it in sync with `S.scene`/`S.focus` and also update `document.title`.

### Solar system physics duplication (important when editing)
Planetary orbit math is **intentionally duplicated** between GLSL (`FS_SS` in `shaders.js`) and JS (`planetPos`/`sunPos`/`orbR` in `ephemeris.js`): the JS side is needed for camera focus/click-picking math and must stay numerically identical to the shader (same `ORB_RATE`, `P_AU`/`AU`, `P_PH0`/`PH0`, `P_ECC`/`ECC`, `P_INC`/`INC`, `P_NODE`/`NODE`, radius-compression exponent). If you change orbital mechanics in one, mirror the change in the other — comments on both sides flag this.

### Render loop (`js/render.js`)
`frame(now)` is the single rAF loop: advances camera easing, updates uniforms, draws each scene shader to an offscreen target, runs the bloom passes, composites to screen, then calls `updateHud()` (from `hud.js`) to refresh telemetry text/meters. `render.js` never imports `ui.js`; the one-shot boot-sequence teardown on first frame is wired the other way — `main.js` calls `setOnFirstFrame(finishBoot)` to hook `ui.js`'s `finishBoot` into `render.js` without a circular import.

### Input (`js/ui.js`)
Pointer drag = orbit camera, scroll = dolly, click (solar system only) = pick a body (`pick()`), keyboard: `Tab`/`1`/`2`/`3` switch scenes, `H` toggles HUD, `R` resets. Foldable HUD panels (`FOLDS`) auto-collapse on small/short viewports unless the user has manually toggled them.

## Conventions worth preserving

- No frameworks/bundler — plain ES modules, static hosting only.
- GLSL and JS share physical constants/formulas in comments (e.g. jet Doppler beaming, barycentre wobble, orbital eccentricity/inclination/node) — when tuning visuals, read the adjacent comment before changing a magic number, they usually explain the physical justification for it.
- CSS visibility for per-scene HUD elements is done via attribute/class selectors, not inline styles or JS `display` toggles — follow that pattern for new HUD elements so scene switching stays declarative.
- Keep the module boundaries above rather than growing one file back into a monolith — that's the whole point of the split.
